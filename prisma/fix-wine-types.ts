import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ANY ingredient whose category says "Wine" but productType is not WINE
  const wrong = await prisma.ingredient.findMany({
    where: {
      ingredientCategory: { contains: "Wine" },
      NOT: { productType: "WINE" },
    },
    select: {
      id: true,
      name: true,
      productType: true,
      ingredientCategory: true,
    },
  });

  console.log(`Found ${wrong.length} items with category "Wine..." but productType != WINE:\n`);
  for (const w of wrong) {
    console.log(`  - ${w.name} | productType=${w.productType} | category=${w.ingredientCategory}`);
  }

  if (wrong.length === 0) {
    console.log("Nothing to fix.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nFixing…`);
  for (const w of wrong) {
    await prisma.ingredient.update({
      where: { id: w.id },
      data: { productType: "WINE", type: "LIQUID" },
    });
    console.log(`  ✓ Fixed: ${w.name}`);
  }

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
