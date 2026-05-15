import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { RecipeForm } from "@/components/recipe/recipe-form";

export default async function NewRecipePage() {
  const orgId = await getOrganizationId();

  const [categories, ingredients] = await Promise.all([
    prisma.category.findMany({
      where: { organizationId: orgId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.ingredient.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-4 lg:p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">New Recipe</h1>
      <RecipeForm categories={categories} ingredients={ingredients} />
    </div>
  );
}
