import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const sample = await prisma.ingredient.findMany({
    where: { name: { contains: "Alexandrea" } },
    select: {
      id: true,
      name: true,
      ingredientCategory: true,
      productType: true,
    },
  });
  console.log("Alexandrea sample:", JSON.stringify(sample, null, 2));

  // Distinct ingredientCategory
  console.log("\nAll distinct ingredientCategory values (non-null):");
  const cats = await prisma.ingredient.findMany({
    select: { ingredientCategory: true },
    distinct: ["ingredientCategory"],
  });
  for (const c of cats) {
    console.log("  -", JSON.stringify(c.ingredientCategory));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
