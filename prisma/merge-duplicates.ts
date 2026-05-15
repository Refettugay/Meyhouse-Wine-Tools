import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\$\s*\d+(\.\d+)?/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[""'']/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(the|a|an|de|di|la|le|el|des|du|von|van)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 1);
}

function signature(name: string): string {
  return tokenize(name).sort().join(" ");
}

// Score: higher = better canonical candidate
// Rewards: has price, has size, short name, no parentheses, no $ annotations
function canonicalScore(ing: {
  name: string;
  bottleCostCents: number | null;
  bottleSizeMl: number | null;
  casePackSize: number | null;
  vendor: string | null;
  _count: { recipeIngredients: number; inventoryItems: number };
}): number {
  let score = 0;
  if (ing.bottleCostCents && ing.bottleCostCents > 0) score += 100;
  if (ing.bottleSizeMl) score += 50;
  if (ing.casePackSize) score += 30;
  if (ing.vendor) score += 20;
  // Penalize parentheses and $ annotations in name
  if (!ing.name.includes("(")) score += 40;
  if (!/\$/.test(ing.name)) score += 20;
  // Shorter is better (slightly)
  score -= ing.name.length * 0.5;
  // Having existing relationships is important (don't break things)
  score += ing._count.recipeIngredients * 50;
  // Slight preference to items already in inventory
  score += ing._count.inventoryItems * 5;
  return score;
}

async function main() {
  console.log("Analyzing duplicates and merging...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const all = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
    include: {
      _count: {
        select: {
          recipeIngredients: true,
          inventoryItems: true,
        },
      },
    },
  });

  // Group by signature
  const groups = new Map<string, typeof all>();
  for (const ing of all) {
    const sig = signature(ing.name);
    if (!sig) continue;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(ing);
  }

  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`Found ${duplicateGroups.length} duplicate groups\n`);

  let mergedCount = 0;
  let deletedCount = 0;

  for (const group of duplicateGroups) {
    // Pick canonical: highest score
    const scored = group
      .map((ing) => ({ ing, score: canonicalScore(ing) }))
      .sort((a, b) => b.score - a.score);

    const canonical = scored[0].ing;
    const duplicates = scored.slice(1).map((s) => s.ing);

    console.log(`Group: ${group.map((g) => g.name).join(" / ")}`);
    console.log(`  → Canonical: ${canonical.name}`);

    // Merge data from duplicates into canonical (take non-null values)
    const mergedData: any = {};
    for (const dup of duplicates) {
      if (!canonical.bottleCostCents && dup.bottleCostCents) {
        mergedData.bottleCostCents = dup.bottleCostCents;
      }
      if (!canonical.bottleSizeMl && dup.bottleSizeMl) {
        mergedData.bottleSizeMl = dup.bottleSizeMl;
      }
      if (!canonical.casePackSize && dup.casePackSize) {
        mergedData.casePackSize = dup.casePackSize;
      }
      if (!canonical.vendor && dup.vendor) {
        mergedData.vendor = dup.vendor;
      }
      if (!canonical.vendorId && dup.vendorId) {
        mergedData.vendorId = dup.vendorId;
      }
      if (!canonical.ingredientCategory && dup.ingredientCategory) {
        mergedData.ingredientCategory = dup.ingredientCategory;
      }
    }
    if (Object.keys(mergedData).length > 0) {
      await prisma.ingredient.update({
        where: { id: canonical.id },
        data: mergedData,
      });
    }

    // For each duplicate: move its recipe ingredients and inventory items to canonical
    for (const dup of duplicates) {
      // Move recipe ingredients (point to canonical)
      await prisma.recipeIngredient.updateMany({
        where: { ingredientId: dup.id },
        data: { ingredientId: canonical.id },
      });

      // Move order list items
      await prisma.orderListItem.updateMany({
        where: { ingredientId: dup.id },
        data: { ingredientId: canonical.id },
      });

      // Inventory items need merging per location (can't have 2 at same location)
      const dupInventory = await prisma.inventoryItem.findMany({
        where: { ingredientId: dup.id },
      });
      for (const dupInv of dupInventory) {
        const canonicalInv = await prisma.inventoryItem.findUnique({
          where: {
            locationId_ingredientId: {
              locationId: dupInv.locationId,
              ingredientId: canonical.id,
            },
          },
        });
        if (canonicalInv) {
          // Already exists at this location — merge (max par, sum stock)
          await prisma.inventoryItem.update({
            where: { id: canonicalInv.id },
            data: {
              parLevel: Math.max(canonicalInv.parLevel, dupInv.parLevel),
              currentStock: canonicalInv.currentStock + dupInv.currentStock,
            },
          });
          await prisma.inventoryItem.delete({ where: { id: dupInv.id } });
        } else {
          // Move to canonical
          await prisma.inventoryItem.update({
            where: { id: dupInv.id },
            data: { ingredientId: canonical.id },
          });
        }
      }

      // Delete the duplicate ingredient
      await prisma.ingredient.delete({ where: { id: dup.id } });
      deletedCount++;
    }

    mergedCount++;
    console.log();
  }

  console.log(`\nMerged ${mergedCount} groups`);
  console.log(`Deleted ${deletedCount} duplicate ingredients`);

  const finalCount = await prisma.ingredient.count({
    where: { organizationId: org.id, isActive: true },
  });
  const withPrice = await prisma.ingredient.count({
    where: {
      organizationId: org.id,
      isActive: true,
      bottleCostCents: { not: null, gt: 0 },
    },
  });
  console.log(`\nFinal: ${finalCount} products, ${withPrice} with pricing`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
