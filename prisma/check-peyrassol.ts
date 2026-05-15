import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Search for Peyrassol specifically
  const peyrassol = await prisma.ingredient.findMany({
    where: { name: { contains: "Peyrassol" } },
    select: {
      id: true,
      name: true,
      productType: true,
      type: true,
      ingredientCategory: true,
      isActive: true,
      menuStatus: true,
      bottleCostCents: true,
      bottleSizeMl: true,
      inventoryItems: { select: { isBTG: true, location: { select: { name: true } } } },
    },
  });

  console.log("Peyrassol search:");
  for (const p of peyrassol) {
    console.log(JSON.stringify(p, null, 2));
  }

  console.log("\n==========================");
  console.log("Distinct ingredientCategory values:");
  const cats = await prisma.ingredient.findMany({
    select: { ingredientCategory: true },
    distinct: ["ingredientCategory"],
  });
  for (const c of cats) {
    if (c.ingredientCategory && c.ingredientCategory.toLowerCase().includes("wine")) {
      console.log("  -", c.ingredientCategory);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
