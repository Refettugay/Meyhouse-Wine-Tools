import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

interface OrderUnitItem {
  product: string;
  order_unit: "BOTTLE" | "CASE" | null;
  case_size: number | null;
}

// Same tokenizer as merge-duplicates-v2 for consistency
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

function tokenize(name: string): string[] {
  let s = name.toLowerCase();
  s = s.replace(/\$\s*\d+(\.\d+)?/g, "");
  s = s.replace(/\(.*?\)/g, "");
  s = s.replace(/[''"""]/g, "");
  s = s.replace(/[^\w\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s
    .split(" ")
    .filter((t) => t.length > 0)
    .filter((t) => !STOPWORDS.has(t));
}

function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let matches = 0;
  for (const token of setA) {
    if (setB.has(token)) matches++;
  }
  const minSize = Math.min(setA.size, setB.size);
  return matches / minSize;
}

async function main() {
  console.log("Applying order units (bottle vs case) from Excel...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const dataPath = path.resolve("prisma/order-units.json");
  const items: OrderUnitItem[] = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const withUnit = items.filter((i) => i.order_unit);
  console.log(`Loaded ${withUnit.length} items with order units\n`);

  const allIngredients = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
  });

  // Pre-tokenize for fuzzy matching
  const candidates = allIngredients.map((i) => ({
    id: i.id,
    name: i.name,
    tokens: tokenize(i.name),
  }));

  let updated = 0;
  let notMatched = 0;
  const notMatchedList: string[] = [];

  for (const item of withUnit) {
    // Exact match first
    let match = allIngredients.find((i) => i.name === item.product);

    // Fuzzy match
    if (!match) {
      const itemTokens = tokenize(item.product);
      const scored = candidates
        .map((c) => ({
          ...c,
          score: similarity(itemTokens, c.tokens),
        }))
        .filter((c) => c.score >= 0.7)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        match = allIngredients.find((i) => i.id === scored[0].id);
      }
    }

    if (!match) {
      notMatched++;
      notMatchedList.push(item.product);
      continue;
    }

    // Update the orderUnit and case size.
    // If ordering by case but no explicit case size was set in the Excel,
    // default to 12 (standard wine/spirit case) — unless the product already
    // has a different case size saved.
    const updateData: any = { orderUnit: item.order_unit! };
    if (item.case_size) {
      updateData.casePackSize = item.case_size;
    } else if (
      item.order_unit === "CASE" &&
      (match.casePackSize === null || match.casePackSize === 0)
    ) {
      updateData.casePackSize = 12;
    }

    await prisma.ingredient.update({
      where: { id: match.id },
      data: updateData,
    });
    updated++;
  }

  console.log(`Updated: ${updated} products`);
  console.log(`Not matched: ${notMatched} products`);

  // Verify
  const byBottle = await prisma.ingredient.count({
    where: {
      organizationId: org.id,
      isActive: true,
      orderUnit: "BOTTLE",
    },
  });
  const byCase = await prisma.ingredient.count({
    where: {
      organizationId: org.id,
      isActive: true,
      orderUnit: "CASE",
    },
  });

  console.log(`\nFinal:`);
  console.log(`  Order by bottle: ${byBottle}`);
  console.log(`  Order by case: ${byCase}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
