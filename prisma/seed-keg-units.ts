import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

const KEG_UNITS = [
  {
    code: "keg_full",
    name: "Full Keg (15.5 gal)",
    abbrev: "full keg",
    measureType: "VOLUME",
    baseFactor: 58670, // 15.5 gal × 3785.41 ml/gal
    sortOrder: 85,
  },
  {
    code: "keg_quarter",
    name: "Quarter Keg (7.75 gal)",
    abbrev: "1/4 keg",
    measureType: "VOLUME",
    baseFactor: 29337, // 7.75 gal × 3785.41
    sortOrder: 86,
  },
  {
    code: "keg_sixth",
    name: "Sixth Keg (5.16 gal)",
    abbrev: "1/6 keg",
    measureType: "VOLUME",
    baseFactor: 19533, // 5.16 gal × 3785.41
    sortOrder: 87,
  },
  {
    code: "keg_mini",
    name: "Mini Keg (1.32 gal)",
    abbrev: "mini keg",
    measureType: "VOLUME",
    baseFactor: 5000, // 1.32 gal ≈ 5000 ml (5 liters)
    sortOrder: 88,
  },
];

async function main() {
  console.log("Adding keg size units...\n");

  for (const unit of KEG_UNITS) {
    const existing = await prisma.unit.findUnique({
      where: { code: unit.code },
    });
    if (existing) {
      console.log(`  Already exists: ${unit.name}`);
      continue;
    }

    await prisma.unit.create({
      data: {
        ...unit,
        canPurchase: true,
        canRecipe: false,
        isActive: true,
        isSystem: true,
      },
    });
    console.log(`  Created: ${unit.name} (${unit.baseFactor} ml)`);
  }

  console.log("\nDone!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
