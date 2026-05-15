import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

interface PriceItem {
  vendor: string | null;
  product: string;
  type: string | null;
  order_by: string | null;
  bottle_size_ml: number | null;
  case_size: number | null;
  cost_per_bottle_dollars: number | null;
}

// Normalize a name for fuzzy matching (remove price annotations, $X, etc.)
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\$\s*\d+(\.\d+)?/g, "") // remove "$62" annotations
    .replace(/\(.*?\)/g, "") // remove parenthetical notes like "(well tequila)"
    .replace(/["""'']/g, "") // remove quotes
    .replace(/\s+/g, " ") // collapse spaces
    .trim();
}

async function main() {
  console.log("Applying updated pricing from Excel...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) {
    console.error("Organization not found");
    return;
  }

  const dataPath = path.resolve("prisma/price-update.json");
  const items: PriceItem[] = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const pricedItems = items.filter((i) => i.cost_per_bottle_dollars !== null);
  console.log(`Loaded ${pricedItems.length} items with pricing\n`);

  // Load all existing ingredients with their normalized names for matching
  const allIngredients = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
  });
  console.log(`Matching against ${allIngredients.length} existing products\n`);

  const normalizedMap = new Map<string, typeof allIngredients[0]>();
  for (const ing of allIngredients) {
    normalizedMap.set(normalizeName(ing.name), ing);
  }

  let updated = 0;
  let notFound = 0;
  const notFoundList: string[] = [];

  for (const item of pricedItems) {
    const normalized = normalizeName(item.product);

    // Try exact match first, then normalized
    let match = allIngredients.find((i) => i.name === item.product);
    if (!match) {
      match = normalizedMap.get(normalized);
    }

    // Try matching by first 3 words for things with different annotations
    if (!match) {
      const firstWords = normalized.split(" ").slice(0, 3).join(" ");
      if (firstWords.length > 5) {
        for (const ing of allIngredients) {
          const ingNorm = normalizeName(ing.name);
          if (ingNorm.startsWith(firstWords) || firstWords.startsWith(ingNorm.split(" ").slice(0, 3).join(" "))) {
            match = ing;
            break;
          }
        }
      }
    }

    if (!match) {
      notFound++;
      notFoundList.push(item.product);
      continue;
    }

    const updateData: any = {
      bottleCostCents: Math.round(item.cost_per_bottle_dollars! * 100),
    };
    if (item.bottle_size_ml) updateData.bottleSizeMl = item.bottle_size_ml;
    if (item.case_size) updateData.casePackSize = item.case_size;

    await prisma.ingredient.update({
      where: { id: match.id },
      data: updateData,
    });
    updated++;
  }

  console.log(`Updated: ${updated} products`);
  console.log(`Not matched: ${notFound} products`);

  if (notFoundList.length > 0) {
    console.log("\nCouldn't find matches for:");
    notFoundList.slice(0, 20).forEach((n) => console.log(`  - ${n}`));
    if (notFoundList.length > 20) console.log(`  ... and ${notFoundList.length - 20} more`);
  }

  // Summary stats
  const stats = await prisma.ingredient.aggregate({
    where: { organizationId: org.id, isActive: true },
    _count: { _all: true },
  });
  const withCost = await prisma.ingredient.count({
    where: { organizationId: org.id, isActive: true, bottleCostCents: { not: null, gt: 0 } },
  });

  console.log(`\nDatabase summary:`);
  console.log(`  Total active products: ${stats._count._all}`);
  console.log(`  With pricing: ${withCost}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
