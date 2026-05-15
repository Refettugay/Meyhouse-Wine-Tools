import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

// The correct ingredient for each recipe (by name)
const RECIPE_FIXES: Record<string, string> = {
  MARGARITA: "Desired Tequila",
  MANHATTAN: "Desired Bourbon/Rye",
  "OLD FASHION": "Desired Bourbon/Rye",
  NEGRONI: "Desired Gin",
  BOULEVARDIER: "Desired Bourbon",
  "WHISKEY SOUR": "Desired Bourbon",
  "AMARETTO SOUR": "Desired Bourbon",
  "MOSCOW MULE": "Desired Vodka",
};

async function main() {
  console.log("Fixing damaged recipe ingredients...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  // 1. Make sure all the "Desired X" ingredients exist
  const requiredNames = [
    "Desired Vodka",
    "Desired Gin",
    "Desired Bourbon",
    "Desired Bourbon/Rye",
    "Desired Tequila",
  ];

  const nameToId = new Map<string, string>();
  for (const name of requiredNames) {
    let ing = await prisma.ingredient.findUnique({
      where: { organizationId_name: { organizationId: org.id, name } },
    });
    if (!ing) {
      ing = await prisma.ingredient.create({
        data: {
          organizationId: org.id,
          name,
          type: "LIQUID",
          bottleSizeMl: 750,
        },
      });
      console.log(`  Created: ${name}`);
    }
    nameToId.set(name, ing.id);
  }

  // 2. Find the merged "Desired Vodka" (has all recipes pointing to it now)
  const desiredVodkaId = nameToId.get("Desired Vodka")!;

  // 3. Fix each broken recipe
  for (const [recipeName, correctIngredientName] of Object.entries(RECIPE_FIXES)) {
    const recipe = await prisma.recipe.findFirst({
      where: { organizationId: org.id, name: recipeName },
      include: { ingredients: { include: { ingredient: true } } },
    });
    if (!recipe) {
      console.log(`  ⚠ Recipe not found: ${recipeName}`);
      continue;
    }

    const correctId = nameToId.get(correctIngredientName);
    if (!correctId) continue;

    // If the recipe is already correctly pointing, skip
    if (correctIngredientName === "Desired Vodka" && recipeName === "MOSCOW MULE") {
      console.log(`  ✓ ${recipeName} already uses ${correctIngredientName}`);
      continue;
    }

    // Find the ingredient row that's currently "Desired Vodka" and replace it
    const wrongRow = recipe.ingredients.find(
      (ri) => ri.ingredientId === desiredVodkaId
    );
    if (!wrongRow) {
      console.log(`  ⚠ ${recipeName} doesn't have Desired Vodka row, skipping`);
      continue;
    }

    await prisma.recipeIngredient.update({
      where: { id: wrongRow.id },
      data: { ingredientId: correctId },
    });
    console.log(`  ✓ ${recipeName}: Desired Vodka → ${correctIngredientName}`);
  }

  // 4. Now handle Well Gin / Well Vodka
  console.log("\nFixing Well Gin / Well Vodka...");

  let wellGinId = (
    await prisma.ingredient.findUnique({
      where: { organizationId_name: { organizationId: org.id, name: "Well Gin" } },
    })
  )?.id;

  let wellVodkaId = (
    await prisma.ingredient.findUnique({
      where: { organizationId_name: { organizationId: org.id, name: "Well Vodka" } },
    })
  )?.id;

  if (!wellVodkaId) {
    const created = await prisma.ingredient.create({
      data: {
        organizationId: org.id,
        name: "Well Vodka",
        type: "LIQUID",
        bottleSizeMl: 1000,
      },
    });
    wellVodkaId = created.id;
    console.log("  Created: Well Vodka");
  }

  if (wellGinId) {
    // RAKI ROLLIE should use Well Vodka, not Well Gin
    const rakiRollie = await prisma.recipe.findFirst({
      where: { organizationId: org.id, name: "RAKI ROLLIE" },
      include: { ingredients: true },
    });
    if (rakiRollie) {
      const wrongRow = rakiRollie.ingredients.find(
        (ri) => ri.ingredientId === wellGinId
      );
      if (wrongRow) {
        await prisma.recipeIngredient.update({
          where: { id: wrongRow.id },
          data: { ingredientId: wellVodkaId },
        });
        console.log("  ✓ RAKI ROLLIE: Well Gin → Well Vodka");
      }
    }
  }

  console.log("\nDone!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
