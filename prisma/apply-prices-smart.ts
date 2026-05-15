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
  price_source_column: string | null;
}

// Aggressive normalization for matching
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\$\s*\d+(\.\d+)?/g, "") // remove "$62" annotations
    .replace(/\(.*?\)/g, "") // remove parenthetical notes
    .replace(/[""'']/g, "") // remove fancy quotes
    .replace(/[^\w\s]/g, " ") // replace punctuation with space
    .replace(/\b(the|a|an|de|di|la|le|el|des|du|von|van)\b/g, "") // remove common articles
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 1);
}

// Compute a similarity score between two tokenized names
function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let matches = 0;
  for (const token of setA) {
    if (setB.has(token)) matches++;
  }
  // Jaccard-like: matches / smaller set size (favors substring matches)
  const minSize = Math.min(setA.size, setB.size);
  return matches / minSize;
}

// Find best matches in the database for a given Excel product name
function findMatches(
  excelName: string,
  candidates: { id: string; name: string; tokens: string[] }[],
  threshold = 0.7
): { id: string; name: string; score: number }[] {
  const excelTokens = tokenize(excelName);
  const matches: { id: string; name: string; score: number }[] = [];
  for (const c of candidates) {
    const score = similarity(excelTokens, c.tokens);
    if (score >= threshold) {
      matches.push({ id: c.id, name: c.name, score });
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}

async function main() {
  console.log("Applying pricing with smart matching...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) {
    console.error("Organization not found");
    return;
  }

  const dataPath = path.resolve("prisma/price-update.json");
  const items: PriceItem[] = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const pricedItems = items.filter((i) => i.cost_per_bottle_dollars !== null);
  console.log(`Loaded ${pricedItems.length} items with pricing\n`);

  const allIngredients = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
  });

  // Pre-tokenize all database names
  const candidates = allIngredients.map((i) => ({
    id: i.id,
    name: i.name,
    tokens: tokenize(i.name),
  }));

  let updated = 0;
  let notFound = 0;
  const notFoundList: string[] = [];
  const ambiguousList: { excel: string; matches: string[] }[] = [];

  for (const item of pricedItems) {
    // Try exact match first
    const exact = allIngredients.find((i) => i.name === item.product);
    if (exact) {
      await prisma.ingredient.update({
        where: { id: exact.id },
        data: {
          bottleCostCents: Math.round(item.cost_per_bottle_dollars! * 100),
          ...(item.bottle_size_ml && { bottleSizeMl: item.bottle_size_ml }),
          ...(item.case_size && { casePackSize: item.case_size }),
        },
      });
      updated++;
      continue;
    }

    // Fuzzy match
    const matches = findMatches(item.product, candidates, 0.7);

    if (matches.length === 0) {
      notFound++;
      notFoundList.push(item.product);
      continue;
    }

    // Apply to all good matches (in case of duplicates like Arette) — use the best match
    const best = matches[0];
    await prisma.ingredient.update({
      where: { id: best.id },
      data: {
        bottleCostCents: Math.round(item.cost_per_bottle_dollars! * 100),
        ...(item.bottle_size_ml && { bottleSizeMl: item.bottle_size_ml }),
        ...(item.case_size && { casePackSize: item.case_size }),
      },
    });
    updated++;

    if (matches.length > 1 && matches[0].score === matches[1].score) {
      // Same score - apply to both
      for (let i = 1; i < matches.length; i++) {
        if (matches[i].score === matches[0].score) {
          await prisma.ingredient.update({
            where: { id: matches[i].id },
            data: {
              bottleCostCents: Math.round(item.cost_per_bottle_dollars! * 100),
              ...(item.bottle_size_ml && { bottleSizeMl: item.bottle_size_ml }),
              ...(item.case_size && { casePackSize: item.case_size }),
            },
          });
        }
      }
      ambiguousList.push({
        excel: item.product,
        matches: matches.slice(0, 3).map((m) => `${m.name} (${m.score.toFixed(2)})`),
      });
    }
  }

  console.log(`Updated: ${updated} products`);
  console.log(`Not matched: ${notFound} products`);

  if (notFoundList.length > 0) {
    console.log("\nStill unmatched (truly new products):");
    notFoundList.forEach((n) => console.log(`  - ${n}`));
  }

  if (ambiguousList.length > 0) {
    console.log("\nMatched multiple (duplicates in DB):");
    ambiguousList.forEach((a) => {
      console.log(`  "${a.excel}" → matched: ${a.matches.join(", ")}`);
    });
  }

  const withCost = await prisma.ingredient.count({
    where: {
      organizationId: org.id,
      isActive: true,
      bottleCostCents: { not: null, gt: 0 },
    },
  });
  console.log(`\nTotal products with pricing: ${withCost}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
