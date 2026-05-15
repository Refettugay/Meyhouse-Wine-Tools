import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

// Words that are "type" suffixes and don't uniquely identify a product
const TYPE_WORDS = new Set([
  "gin", "vodka", "rum", "rye", "whiskey", "whisky", "bourbon", "tequila", "scotch",
  "cognac", "mezcal", "pisco", "raki", "liquer", "liqueur", "bitter", "bitters",
  "cordial", "amaro", "grappa", "vermouth", "wine", "red", "white", "rose",
  "sparkling", "champagne", "beer", "ale", "ipa", "lager",
]);

const STOPWORDS = new Set([
  "the", "a", "an", "de", "di", "la", "le", "el", "des", "du", "von", "van",
  "and", "or", "of", "on", "in", "for", "with",
]);

const ABBREV = new Map<string, string>([
  ["rsv", "reserve"],
  ["rsvd", "reserved"],
  ["btl", "bottle"],
  ["cs", "case"],
  ["yr", "year"],
  ["yrs", "year"],
]);

function tokenize(name: string): string[] {
  let s = name.toLowerCase();
  s = s.replace(/\$\s*\d+(\.\d+)?/g, ""); // remove $ annotations
  s = s.replace(/\(.*?\)/g, ""); // remove parens
  s = s.replace(/[''"""]/g, ""); // remove quotes/apostrophes
  s = s.replace(/[^\w\s]/g, " "); // punctuation → space
  s = s.replace(/\s+/g, " ").trim();

  return s
    .split(" ")
    .map((t) => ABBREV.get(t) || t)
    .filter((t) => t.length > 0)
    .filter((t) => !STOPWORDS.has(t))
    .filter((t) => !TYPE_WORDS.has(t));
}

function signature(name: string): string {
  return tokenize(name).sort().join(" ");
}

function canonicalScore(ing: any): number {
  let score = 0;
  if (ing.bottleCostCents && ing.bottleCostCents > 0) score += 100;
  if (ing.bottleSizeMl) score += 50;
  if (ing.casePackSize) score += 30;
  if (ing.vendor || ing.vendorId) score += 20;
  if (ing.ingredientCategory) score += 15;
  if (!ing.name.includes("(")) score += 40;
  if (!/\$/.test(ing.name)) score += 20;
  score -= ing.name.length * 0.5;
  score += ing._count.recipeIngredients * 50;
  score += ing._count.inventoryItems * 5;
  return score;
}

async function mergeRound() {
  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return 0;

  const all = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
    include: {
      _count: {
        select: { recipeIngredients: true, inventoryItems: true },
      },
    },
  });

  const groups = new Map<string, typeof all>();
  for (const ing of all) {
    const sig = signature(ing.name);
    if (!sig || sig.length < 3) continue;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(ing);
  }

  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
  let merged = 0;

  for (const group of duplicateGroups) {
    const scored = group
      .map((ing) => ({ ing, score: canonicalScore(ing) }))
      .sort((a, b) => b.score - a.score);
    const canonical = scored[0].ing;
    const duplicates = scored.slice(1).map((s) => s.ing);

    console.log(`Merging: [${group.map((g) => g.name).join(" | ")}] → "${canonical.name}"`);

    // Merge scalar data
    const mergedData: any = {};
    for (const dup of duplicates) {
      if (!canonical.bottleCostCents && dup.bottleCostCents)
        mergedData.bottleCostCents = dup.bottleCostCents;
      if (!canonical.bottleSizeMl && dup.bottleSizeMl)
        mergedData.bottleSizeMl = dup.bottleSizeMl;
      if (!canonical.casePackSize && dup.casePackSize)
        mergedData.casePackSize = dup.casePackSize;
      if (!canonical.vendor && dup.vendor) mergedData.vendor = dup.vendor;
      if (!canonical.vendorId && dup.vendorId) mergedData.vendorId = dup.vendorId;
      if (!canonical.ingredientCategory && dup.ingredientCategory)
        mergedData.ingredientCategory = dup.ingredientCategory;
    }
    if (Object.keys(mergedData).length > 0) {
      await prisma.ingredient.update({
        where: { id: canonical.id },
        data: mergedData,
      });
    }

    // Move relationships
    for (const dup of duplicates) {
      await prisma.recipeIngredient.updateMany({
        where: { ingredientId: dup.id },
        data: { ingredientId: canonical.id },
      });
      await prisma.orderListItem.updateMany({
        where: { ingredientId: dup.id },
        data: { ingredientId: canonical.id },
      });

      const dupInventory = await prisma.inventoryItem.findMany({
        where: { ingredientId: dup.id },
      });
      for (const dupInv of dupInventory) {
        const existing = await prisma.inventoryItem.findUnique({
          where: {
            locationId_ingredientId: {
              locationId: dupInv.locationId,
              ingredientId: canonical.id,
            },
          },
        });
        if (existing) {
          await prisma.inventoryItem.update({
            where: { id: existing.id },
            data: {
              parLevel: Math.max(existing.parLevel, dupInv.parLevel),
              currentStock: existing.currentStock + dupInv.currentStock,
            },
          });
          await prisma.inventoryItem.delete({ where: { id: dupInv.id } });
        } else {
          await prisma.inventoryItem.update({
            where: { id: dupInv.id },
            data: { ingredientId: canonical.id },
          });
        }
      }

      await prisma.ingredient.delete({ where: { id: dup.id } });
    }

    merged++;
  }

  return merged;
}

async function main() {
  console.log("Merging duplicates with improved normalization...\n");

  let totalMerged = 0;
  // Run multiple passes to catch cascading dupes
  for (let pass = 1; pass <= 3; pass++) {
    const merged = await mergeRound();
    console.log(`\nPass ${pass}: merged ${merged} groups`);
    totalMerged += merged;
    if (merged === 0) break;
  }

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  const finalCount = await prisma.ingredient.count({
    where: { organizationId: org!.id, isActive: true },
  });
  const withPrice = await prisma.ingredient.count({
    where: {
      organizationId: org!.id,
      isActive: true,
      bottleCostCents: { not: null, gt: 0 },
    },
  });
  console.log(`\n=== DONE ===`);
  console.log(`Total groups merged: ${totalMerged}`);
  console.log(`Final product count: ${finalCount}`);
  console.log(`Products with pricing: ${withPrice}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
