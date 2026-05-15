import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import Link from "next/link";
import { Plus, Beaker } from "lucide-react";
import { RecipeList } from "@/components/recipe/recipe-list";
import { SubRecipeList } from "@/components/recipe/sub-recipe-list";

export default async function RecipesPage() {
  const orgId = await getOrganizationId();

  const [recipes, subRecipes, categories] = await Promise.all([
    prisma.recipe.findMany({
      where: {
        organizationId: orgId,
        isArchived: false,
        isSubRecipe: false,
      },
      include: {
        category: true,
        ingredients: {
          include: { ingredient: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.recipe.findMany({
      where: {
        organizationId: orgId,
        isArchived: false,
        isSubRecipe: true,
      },
      include: {
        category: true,
        ingredients: {
          include: { ingredient: true },
          orderBy: { sortOrder: "asc" },
        },
        producesIngredient: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { organizationId: orgId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return (
    <div className="p-4 lg:p-8">
      {/* Cocktail recipes */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Recipes</h1>
          <p className="text-stone-500 text-sm mt-1">
            {recipes.length} cocktails
          </p>
        </div>
        <Link
          href="/dashboard/recipes/new"
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Recipe
        </Link>
      </div>

      <RecipeList recipes={recipes} categories={categories} />

      {/* House-Made Bar Ingredients */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Beaker className="w-6 h-6 text-amber-600" />
            <div>
              <h2 className="text-xl font-bold">House-Made Bar Ingredients</h2>
              <p className="text-stone-500 text-sm">
                {subRecipes.length} house-made items — syrups, infusions,
                shrubs
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/recipes/sub-recipe/new"
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add House-Made
          </Link>
        </div>

        <SubRecipeList subRecipes={subRecipes} />
      </div>
    </div>
  );
}
