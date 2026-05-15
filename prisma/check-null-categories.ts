import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const winesWithoutCategory = await prisma.ingredient.findMany({
    where: {
      productType: "WINE",
      OR: [{ ingredientCategory: null }, { ingredientCategory: "" }],
    },
    select: { id: true, name: true, ingredientCategory: true, isBTG: true },
  });

  console.log(`Wines with NULL/empty ingredientCategory: ${winesWithoutCategory.length}\n`);
  for (const w of winesWithoutCategory) {
    console.log(`  ${w.name} | isBTG=${w.isBTG}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
