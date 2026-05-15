import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const ingredients = await prisma.ingredient.findMany({
    where: {
      name: { contains: "Alexandrea" },
    },
    include: {
      vendorRef: { select: { name: true } },
      pricings: { orderBy: [{ sortOrder: "asc" }, { pourMl: "asc" }] },
      inventoryItems: {
        select: { isBTG: true, locationId: true },
      },
    },
  });

  for (const ing of ingredients) {
    console.log("Name:", ing.name);
    console.log("  ingredientCategory:", ing.ingredientCategory);
    console.log("  productType:", ing.productType);
    console.log("  bottleCostCents:", ing.bottleCostCents);
    console.log("  pricings count:", ing.pricings.length);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
