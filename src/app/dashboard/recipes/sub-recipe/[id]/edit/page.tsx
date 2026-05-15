import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { notFound } from "next/navigation";
import { SubRecipeForm } from "@/components/recipe/sub-recipe-form";

export default async function EditSubRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrganizationId();

  const [recipe, categories, ingredients] = await Promise.all([
    prisma.recipe.findFirst({
      where: { id, organizationId: orgId, isSubRecipe: true },
      include: {
        ingredients: {
          include: { ingredient: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.category.findMany({
      where: { organizationId: orgId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.ingredient.findMany({
      where: { organizationId: orgId, isActive: true, isHouseMade: false },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!recipe) notFound();

  return (
    <div className="p-4 lg:p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Edit: {recipe.name}</h1>
      <SubRecipeForm
        categories={categories}
        ingredients={ingredients}
        existingRecipe={recipe}
      />
    </div>
  );
}
