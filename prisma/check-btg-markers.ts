import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Check InventoryItem for per-store BTG markers
  const btgInventory = await prisma.inventoryItem.findMany({
    where: { isBTG: true },
    include: {
      ingredient: { select: { name: true, productType: true, isBTG: true } },
      location: { select: { name: true } },
    },
    take: 20,
  });

  console.log("========================================");
  console.log("InventoryItem rows with isBTG = true:");
  console.log("========================================");
  console.log("Total:", await prisma.inventoryItem.count({ where: { isBTG: true } }));
  console.log();

  for (const i of btgInventory) {
    console.log(
      `  [${i.location.name}] ${i.ingredient.name} | global_isBTG=${i.ingredient.isBTG}`
    );
  }

  console.log("\n========================================");
  console.log("Ingredient-level isBTG count:");
  console.log("========================================");
  const globalBtg = await prisma.ingredient.count({ where: { isBTG: true } });
  console.log("Total ingredients with global isBTG=true:", globalBtg);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
