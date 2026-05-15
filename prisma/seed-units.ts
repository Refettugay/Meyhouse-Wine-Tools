import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

// Base units: ml for VOLUME, g for WEIGHT, 1 for COUNT
// baseFactor = how many of the base unit (ml/g/each) this unit represents

interface UnitSeed {
  code: string;
  name: string;
  abbrev: string;
  measureType: "VOLUME" | "WEIGHT" | "COUNT";
  baseFactor: number;
  canPurchase: boolean;
  canRecipe: boolean;
  sortOrder: number;
}

const UNITS: UnitSeed[] = [
  // ===== VOLUME (base: ml) =====
  // Metric
  { code: "ml", name: "Milliliter", abbrev: "ml", measureType: "VOLUME", baseFactor: 1, canPurchase: true, canRecipe: true, sortOrder: 10 },
  { code: "cl", name: "Centiliter", abbrev: "cl", measureType: "VOLUME", baseFactor: 10, canPurchase: true, canRecipe: true, sortOrder: 15 },
  { code: "L", name: "Liter", abbrev: "L", measureType: "VOLUME", baseFactor: 1000, canPurchase: true, canRecipe: true, sortOrder: 20 },
  // US Volume
  { code: "tsp", name: "Teaspoon", abbrev: "tsp", measureType: "VOLUME", baseFactor: 4.92892, canPurchase: false, canRecipe: true, sortOrder: 30 },
  { code: "tbsp", name: "Tablespoon", abbrev: "tbsp", measureType: "VOLUME", baseFactor: 14.7868, canPurchase: false, canRecipe: true, sortOrder: 31 },
  { code: "floz", name: "Fluid Ounce", abbrev: "fl oz", measureType: "VOLUME", baseFactor: 29.5735, canPurchase: true, canRecipe: true, sortOrder: 40 },
  { code: "cup", name: "Cup", abbrev: "cup", measureType: "VOLUME", baseFactor: 236.588, canPurchase: false, canRecipe: true, sortOrder: 50 },
  { code: "pt", name: "Pint", abbrev: "pt", measureType: "VOLUME", baseFactor: 473.176, canPurchase: true, canRecipe: true, sortOrder: 60 },
  { code: "qt", name: "Quart", abbrev: "qt", measureType: "VOLUME", baseFactor: 946.353, canPurchase: true, canRecipe: true, sortOrder: 70 },
  { code: "gal", name: "Gallon", abbrev: "gal", measureType: "VOLUME", baseFactor: 3785.41, canPurchase: true, canRecipe: true, sortOrder: 80 },
  // Bar-specific Volume
  { code: "dash", name: "Dash", abbrev: "dash", measureType: "VOLUME", baseFactor: 0.6, canPurchase: false, canRecipe: true, sortOrder: 90 },
  { code: "barspoon", name: "Barspoon", abbrev: "bsp", measureType: "VOLUME", baseFactor: 3.7, canPurchase: false, canRecipe: true, sortOrder: 91 },
  { code: "splash", name: "Splash", abbrev: "splash", measureType: "VOLUME", baseFactor: 7.4, canPurchase: false, canRecipe: true, sortOrder: 92 },
  { code: "rinse", name: "Rinse", abbrev: "rinse", measureType: "VOLUME", baseFactor: 1.5, canPurchase: false, canRecipe: true, sortOrder: 93 },
  { code: "drop", name: "Drop", abbrev: "drop", measureType: "VOLUME", baseFactor: 0.05, canPurchase: false, canRecipe: true, sortOrder: 94 },
  { code: "jigger", name: "Jigger (1.5 oz)", abbrev: "jig", measureType: "VOLUME", baseFactor: 44.3603, canPurchase: false, canRecipe: true, sortOrder: 95 },
  { code: "pony", name: "Pony (1 oz)", abbrev: "pony", measureType: "VOLUME", baseFactor: 29.5735, canPurchase: false, canRecipe: true, sortOrder: 96 },

  // ===== WEIGHT (base: g) =====
  // Metric
  { code: "g", name: "Gram", abbrev: "g", measureType: "WEIGHT", baseFactor: 1, canPurchase: true, canRecipe: true, sortOrder: 100 },
  { code: "kg", name: "Kilogram", abbrev: "kg", measureType: "WEIGHT", baseFactor: 1000, canPurchase: true, canRecipe: true, sortOrder: 110 },
  { code: "mg", name: "Milligram", abbrev: "mg", measureType: "WEIGHT", baseFactor: 0.001, canPurchase: false, canRecipe: true, sortOrder: 99 },
  // Imperial
  { code: "oz_wt", name: "Ounce (weight)", abbrev: "oz", measureType: "WEIGHT", baseFactor: 28.3495, canPurchase: true, canRecipe: true, sortOrder: 120 },
  { code: "lb", name: "Pound", abbrev: "lb", measureType: "WEIGHT", baseFactor: 453.592, canPurchase: true, canRecipe: true, sortOrder: 130 },

  // ===== COUNT (base: each = 1) =====
  { code: "each", name: "Each", abbrev: "ea", measureType: "COUNT", baseFactor: 1, canPurchase: true, canRecipe: true, sortOrder: 200 },
  { code: "piece", name: "Piece", abbrev: "pc", measureType: "COUNT", baseFactor: 1, canPurchase: true, canRecipe: true, sortOrder: 201 },
  { code: "slice", name: "Slice", abbrev: "slice", measureType: "COUNT", baseFactor: 1, canPurchase: false, canRecipe: true, sortOrder: 202 },
  { code: "wedge", name: "Wedge", abbrev: "wedge", measureType: "COUNT", baseFactor: 1, canPurchase: false, canRecipe: true, sortOrder: 203 },
  { code: "sprig", name: "Sprig", abbrev: "sprig", measureType: "COUNT", baseFactor: 1, canPurchase: false, canRecipe: true, sortOrder: 204 },
  { code: "leaf", name: "Leaf", abbrev: "leaf", measureType: "COUNT", baseFactor: 1, canPurchase: false, canRecipe: true, sortOrder: 205 },
  { code: "dozen", name: "Dozen", abbrev: "doz", measureType: "COUNT", baseFactor: 12, canPurchase: true, canRecipe: false, sortOrder: 210 },
  { code: "bunch", name: "Bunch", abbrev: "bunch", measureType: "COUNT", baseFactor: 1, canPurchase: true, canRecipe: true, sortOrder: 220 },
  { code: "bundle", name: "Bundle", abbrev: "bundle", measureType: "COUNT", baseFactor: 1, canPurchase: true, canRecipe: false, sortOrder: 221 },
  { code: "wheel", name: "Wheel (citrus)", abbrev: "wheel", measureType: "COUNT", baseFactor: 1, canPurchase: false, canRecipe: true, sortOrder: 230 },
  { code: "peel", name: "Peel / Twist", abbrev: "peel", measureType: "COUNT", baseFactor: 1, canPurchase: false, canRecipe: true, sortOrder: 231 },
];

async function main() {
  console.log("Seeding Units of Measure...\n");

  let created = 0;
  let existing = 0;

  for (const unit of UNITS) {
    const ex = await prisma.unit.findUnique({ where: { code: unit.code } });
    if (ex) {
      existing++;
      continue;
    }

    await prisma.unit.create({
      data: {
        code: unit.code,
        name: unit.name,
        abbrev: unit.abbrev,
        measureType: unit.measureType,
        baseFactor: unit.baseFactor,
        canPurchase: unit.canPurchase,
        canRecipe: unit.canRecipe,
        isActive: true,
        isSystem: true,
        sortOrder: unit.sortOrder,
      },
    });
    created++;
  }

  console.log(`Created: ${created}, Already existed: ${existing}`);

  // Summary
  const counts = {
    volume: await prisma.unit.count({ where: { measureType: "VOLUME" } }),
    weight: await prisma.unit.count({ where: { measureType: "WEIGHT" } }),
    count: await prisma.unit.count({ where: { measureType: "COUNT" } }),
  };
  console.log(`\nTotal units:`);
  console.log(`  Volume: ${counts.volume}`);
  console.log(`  Weight: ${counts.weight}`);
  console.log(`  Count:  ${counts.count}`);
  console.log(`  Total:  ${counts.volume + counts.weight + counts.count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
