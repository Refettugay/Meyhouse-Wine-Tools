import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { SubRecipeForm } from "@/components/recipe/sub-recipe-form";

export default async function NewSubRecipePage() {
  const orgId = await getOrganizationId();

  const [categories, ingredients] = await Promise.all([
    prisma.category.findMany({
      where: { organizationId: orgId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.ingredient.findMany({
      where: { organizationId: orgId, isActive: true, isHouseMade: false },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-4 lg:p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">New House-Made Bar Ingredient</h1>
      <SubRecipeForm categories={categories} ingredients={ingredients} />
    </div>
  );
}
