import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

// Manual overrides for products we know should be different types
const NAME_OVERRIDES: Record<string, { productType: string; baseUnit: string; countUnit: string }> = {};

// Name-pattern matching for auto-classification
const NAME_PATTERNS: [RegExp, { productType: string; baseUnit: string; countUnit: string }][] = [
  // Garnishes / Fresh herbs
  [/\bfresh mint\b/i, { productType: "GARNISH", baseUnit: "each", countUnit: "each" }],
  [/\bfresh rosemary\b/i, { productType: "GARNISH", baseUnit: "each", countUnit: "each" }],
  [/\bmint\b/i, { productType: "GARNISH", baseUnit: "each", countUnit: "each" }],
  [/\brosemary\b/i, { productType: "GARNISH", baseUnit: "each", countUnit: "each" }],
  [/\bolive/i, { productType: "GROCERY", baseUnit: "each", countUnit: "each" }],
  [/\bcherry|cherries\b/i, { productType: "GROCERY", baseUnit: "each", countUnit: "each" }],
  [/\bmaraschino cherry/i, { productType: "GROCERY", baseUnit: "each", countUnit: "each" }],
  [/\bclear ice\b/i, { productType: "GROCERY", baseUnit: "each", countUnit: "each" }],
  // Syrups
  [/\bsyrup\b/i, { productType: "SYRUP", baseUnit: "ml", countUnit: "each" }],
  [/\bagave\b/i, { productType: "SYRUP", baseUnit: "ml", countUnit: "each" }],
  [/\bgrenadine\b/i, { productType: "SYRUP", baseUnit: "ml", countUnit: "each" }],
  // Water / Grocery
  [/\bwater\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  [/\bevian\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  [/\bgerolsteiner\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  // Tonics / Sodas / Mixers
  [/\btonic\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  [/\bsoda\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  [/\bginger beer\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  [/\bclub soda\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  [/\bfever tree\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  [/\bseedlip\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  // Juices
  [/\bjuice\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  [/\bpom pomegranate\b/i, { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" }],
  // Box wine
  [/\bfranzia\b/i, { productType: "WINE", baseUnit: "ml", countUnit: "each" }],
  [/\bprosecco\b/i, { productType: "WINE", baseUnit: "ml", countUnit: "each" }],
];

// Category-based classification
function classifyByCategory(cat: string | null): { productType: string; baseUnit: string; countUnit: string } | null {
  if (!cat) return null;
  const lower = cat.toLowerCase();
  if (lower === "grocery") return { productType: "GROCERY", baseUnit: "each", countUnit: "each" };
  if (lower === "syrup") return { productType: "SYRUP", baseUnit: "ml", countUnit: "each" };
  if (lower.includes("beer") || lower.includes("ale") || lower.includes("ipa")) return { productType: "BEER", baseUnit: "ml", countUnit: "each" };
  if (lower.includes("na")) return { productType: "NA_BEVERAGE", baseUnit: "ml", countUnit: "each" };
  if (lower.includes("bitter")) return { productType: "BITTER", baseUnit: "ml", countUnit: "each" };
  return null;
}

async function main() {
  console.log("Fixing product type classifications...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const products = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
  });

  let fixed = 0;
  const fixes: { name: string; from: string; to: string }[] = [];

  for (const product of products) {
    let newData: { productType: string; baseUnit: string; countUnit: string } | null = null;

    // 1. Check manual overrides
    if (NAME_OVERRIDES[product.name]) {
      newData = NAME_OVERRIDES[product.name];
    }

    // 2. Check name patterns
    if (!newData) {
      for (const [pattern, data] of NAME_PATTERNS) {
        if (pattern.test(product.name)) {
          newData = data;
          break;
        }
      }
    }

    // 3. Check category-based (only if type is wrong)
    if (!newData && product.type === "SOLID") {
      newData = classifyByCategory(product.ingredientCategory);
    }

    // 4. Fix SOLID type items without a match — default to GROCERY
    if (!newData && product.type === "SOLID" && product.productType !== "DRY_GOODS" && product.productType !== "MEAT") {
      newData = { productType: "GROCERY", baseUnit: "each", countUnit: "each" };
    }

    // 5. Fix GARNISH type items → now goes to PRODUCE
    if (!newData && product.type === "GARNISH") {
      newData = { productType: "PRODUCE", baseUnit: "each", countUnit: "each" };
    }

    if (newData && (product.productType !== newData.productType || product.baseUnitCode !== newData.baseUnit)) {
      const oldType = product.productType || product.type;
      await prisma.ingredient.update({
        where: { id: product.id },
        data: {
          productType: newData.productType,
          baseUnitCode: newData.baseUnit,
          countUnitCode: newData.countUnit,
        },
      });
      fixes.push({ name: product.name, from: oldType, to: newData.productType });
      fixed++;
    }
  }

  console.log(`Fixed ${fixed} products:\n`);
  for (const f of fixes) {
    console.log(`  ${f.name.padEnd(45)} ${f.from.padEnd(12)} → ${f.to}`);
  }

  // Also fix ProductSKUs for garnish/grocery items — change container from "bottle" to "each"/"bunch"
  console.log("\nFixing ProductSKUs for non-liquid items...");
  const nonLiquidProducts = await prisma.ingredient.findMany({
    where: {
      organizationId: org.id,
      isActive: true,
      productType: { in: ["GARNISH", "GROCERY", "PRODUCE", "DRY_GOODS", "MEAT", "OTHER"] },
    },
    include: { productSKUs: true },
  });

  let skuFixed = 0;
  for (const product of nonLiquidProducts) {
    for (const sku of product.productSKUs) {
      if (sku.containerType === "bottle") {
        let newContainer = "each";
        if (product.productType === "GARNISH") newContainer = "bunch";
        else if (product.productType === "DRY_GOODS" || product.productType === "MEAT") newContainer = "bag";

        // Get the appropriate unit ID
        const unitCode = product.baseUnitCode || "each";
        const unit = await prisma.unit.findUnique({ where: { code: unitCode } });
        if (!unit) continue;

        await prisma.productSKU.update({
          where: { id: sku.id },
          data: {
            containerType: newContainer,
            innerUnitId: unit.id,
            name: `${newContainer.charAt(0).toUpperCase() + newContainer.slice(1)}`,
          },
        });
        skuFixed++;
      }
    }
  }

  console.log(`Fixed ${skuFixed} SKUs from "bottle" to correct container type`);

  // Final stats
  const typeCounts: Record<string, number> = {};
  const allProducts = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
    select: { productType: true },
  });
  for (const p of allProducts) {
    const t = p.productType || "UNKNOWN";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  console.log("\nFinal product type distribution:");
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, c]) => console.log(`  ${t}: ${c}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
