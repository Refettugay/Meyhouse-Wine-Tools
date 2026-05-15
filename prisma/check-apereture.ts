import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const results = await prisma.ingredient.findMany({
    where: {
      OR: [
        { name: { contains: "pereture" } },
        { name: { contains: "perture" } },
        { name: { contains: "Apert" } },
      ],
    },
    select: {
      id: true,
      name: true,
      productType: true,
      ingredientCategory: true,
      isActive: true,
      menuStatus: true,
      isBTG: true,
      inventoryItems: {
        select: {
          isBTG: true,
          locationId: true,
          markedForRemoval: true,
          location: { select: { name: true } },
        },
      },
    },
  });

  console.log(`Found ${results.length} matches:`);
  for (const r of results) {
    console.log(`\n${r.name}`);
    console.log(`  productType: ${r.productType}`);
    console.log(`  ingredientCategory: ${r.ingredientCategory}`);
    console.log(`  isActive: ${r.isActive}`);
    console.log(`  menuStatus: ${r.menuStatus}`);
    console.log(`  global isBTG: ${r.isBTG}`);
    console.log(`  InventoryItems (${r.inventoryItems.length}):`);
    for (const i of r.inventoryItems) {
      console.log(`    - [${i.location.name}] isBTG=${i.isBTG} markedForRemoval=${i.markedForRemoval ?? "null"}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
