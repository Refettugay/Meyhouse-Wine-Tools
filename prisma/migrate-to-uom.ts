import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

// Map ingredientCategory strings to productType enums
function guessProductType(cat: string | null, type: string): string {
  if (!cat) return type === "LIQUID" ? "SPIRIT" : "OTHER";
  const lower = cat.toLowerCase();
  if (lower.includes("bourbon") || lower.includes("rye") || lower.includes("whiskey") || lower.includes("whisky")) return "SPIRIT";
  if (lower.includes("vodka")) return "SPIRIT";
  if (lower.includes("gin")) return "SPIRIT";
  if (lower.includes("tequila")) return "SPIRIT";
  if (lower.includes("mezcal")) return "SPIRIT";
  if (lower.includes("scotch")) return "SPIRIT";
  if (lower.includes("cognac")) return "SPIRIT";
  if (lower.includes("rum")) return "SPIRIT";
  if (lower.includes("pisco")) return "SPIRIT";
  if (lower.includes("raki")) return "SPIRIT";
  if (lower.includes("wine") || lower.includes("btg") || lower.includes("sparkling") || lower.includes("rose") || lower.includes("dessert") || lower.includes("half")) return "WINE";
  if (lower.includes("beer") || lower.includes("ale") || lower.includes("ipa") || lower.includes("lager")) return "BEER";
  if (lower.includes("na") || lower === "na-cc") return "NA_BEVERAGE";
  if (lower.includes("cordial") || lower.includes("liqueur") || lower.includes("amaro")) return "CORDIAL";
  if (lower.includes("bitter")) return "BITTER";
  if (lower.includes("syrup")) return "SYRUP";
  if (lower.includes("grocery")) return "PANTRY";
  return type === "GARNISH" ? "GARNISH" : type === "SOLID" ? "PANTRY" : "SPIRIT";
}

// Determine container type name from orderUnit + context
function containerName(
  orderUnit: string,
  casePackSize: number | null,
  bottleSizeMl: number | null
): string {
  if (orderUnit === "CASE" && casePackSize && casePackSize > 1) {
    const sizeLabel = bottleSizeMl ? `${bottleSizeMl}ml` : "";
    return `Case of ${casePackSize}${sizeLabel ? ` × ${sizeLabel}` : ""}`;
  }
  if (bottleSizeMl) return `Bottle (${bottleSizeMl}ml)`;
  return "Bottle";
}

async function main() {
  console.log("Migrating existing products to new UoM model...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) {
    console.error("Organization not found");
    return;
  }

  // Get the ml unit ID for liquid products
  const mlUnit = await prisma.unit.findUnique({ where: { code: "ml" } });
  const eachUnit = await prisma.unit.findUnique({ where: { code: "each" } });
  const gUnit = await prisma.unit.findUnique({ where: { code: "g" } });
  if (!mlUnit || !eachUnit || !gUnit) {
    console.error("Base units not found. Run seed-units.ts first.");
    return;
  }

  const allProducts = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
  });

  console.log(`Processing ${allProducts.length} products...\n`);

  let updatedProducts = 0;
  let createdSKUs = 0;
  let skippedSKUs = 0;

  for (const product of allProducts) {
    // 1. Set productType if not already set
    const productType = product.productType || guessProductType(product.ingredientCategory, product.type);

    // 2. Determine base and count units
    let baseUnitCode = product.baseUnitCode;
    let countUnitCode = product.countUnitCode;

    if (!baseUnitCode) {
      if (product.type === "SOLID") baseUnitCode = "g";
      else if (product.type === "GARNISH") baseUnitCode = "each";
      else baseUnitCode = "ml"; // LIQUID default
    }

    if (!countUnitCode) {
      // Most beverage items are counted by "each" (whole bottles/cans)
      countUnitCode = "each";
    }

    // 3. Update product with new fields
    await prisma.ingredient.update({
      where: { id: product.id },
      data: {
        productType,
        baseUnitCode,
        countUnitCode,
      },
    });
    updatedProducts++;

    // 4. Create ProductSKU(s) from legacy fields
    // Check if already has SKUs (from a previous run)
    const existingSKUs = await prisma.productSKU.count({
      where: { ingredientId: product.id },
    });
    if (existingSKUs > 0) {
      skippedSKUs++;
      continue;
    }

    // Only create if we have cost or size data
    if (!product.bottleCostCents && !product.bottleSizeMl) continue;

    const bottleSizeMl = product.bottleSizeMl || 750;
    const casePackSize = product.casePackSize || 1;
    const orderUnit = product.orderUnit || "BOTTLE";

    if (orderUnit === "CASE" && casePackSize > 1) {
      // Create a CASE SKU as default
      const totalCostCents = product.bottleCostCents
        ? product.bottleCostCents * casePackSize
        : null;

      await prisma.productSKU.create({
        data: {
          organizationId: org.id,
          ingredientId: product.id,
          vendorId: product.vendorId || null,
          name: containerName("CASE", casePackSize, bottleSizeMl),
          containerType: "case",
          unitsPerPack: casePackSize,
          innerSize: bottleSizeMl,
          innerUnitId: mlUnit.id,
          costCents: totalCostCents,
          isDefault: true,
        },
      });
      createdSKUs++;

      // Also create a single-bottle SKU as backup (non-default)
      if (product.bottleCostCents) {
        await prisma.productSKU.create({
          data: {
            organizationId: org.id,
            ingredientId: product.id,
            vendorId: product.vendorId || null,
            name: `Bottle (${bottleSizeMl}ml)`,
            containerType: "bottle",
            unitsPerPack: 1,
            innerSize: bottleSizeMl,
            innerUnitId: mlUnit.id,
            costCents: product.bottleCostCents,
            isDefault: false,
          },
        });
        createdSKUs++;
      }
    } else {
      // Create a BOTTLE SKU as default
      await prisma.productSKU.create({
        data: {
          organizationId: org.id,
          ingredientId: product.id,
          vendorId: product.vendorId || null,
          name: `Bottle (${bottleSizeMl}ml)`,
          containerType: "bottle",
          unitsPerPack: 1,
          innerSize: bottleSizeMl,
          innerUnitId: mlUnit.id,
          costCents: product.bottleCostCents,
          isDefault: true,
        },
      });
      createdSKUs++;
    }
  }

  console.log(`Products updated: ${updatedProducts}`);
  console.log(`SKUs created: ${createdSKUs}`);
  console.log(`SKUs skipped (already existed): ${skippedSKUs}`);

  // Stats
  const typeStats: Record<string, number> = {};
  for (const p of allProducts) {
    const pt = guessProductType(p.ingredientCategory, p.type);
    typeStats[pt] = (typeStats[pt] || 0) + 1;
  }
  console.log(`\nProduct type distribution:`);
  Object.entries(typeStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
