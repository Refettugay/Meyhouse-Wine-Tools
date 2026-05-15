import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // Find the merged "Desired" ingredient and see what recipes now use it
  const desired = await prisma.ingredient.findMany({
    where: { name: { contains: "Desired" } },
    include: {
      recipeIngredients: {
        include: { recipe: true },
      },
    },
  });

  for (const d of desired) {
    console.log(`\n"${d.name}"`);
    for (const ri of d.recipeIngredients) {
      console.log(`  Used in: ${ri.recipe.name}`);
    }
  }

  // Also check Well Gin/Vodka
  const well = await prisma.ingredient.findMany({
    where: { name: { contains: "Well" } },
    include: {
      recipeIngredients: {
        include: { recipe: true },
      },
    },
  });

  for (const w of well) {
    console.log(`\n"${w.name}"`);
    for (const ri of w.recipeIngredients) {
      console.log(`  Used in: ${ri.recipe.name}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
