import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { notFound } from "next/navigation";
import { RecipeEditForm } from "@/components/recipe/recipe-edit-form";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrganizationId();

  const [recipe, categories, ingredients] = await Promise.all([
    prisma.recipe.findFirst({
      where: { id, organizationId: orgId },
      include: {
        category: true,
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
      where: { organizationId: orgId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!recipe) notFound();

  return (
    <div className="p-4 lg:p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Edit: {recipe.name}</h1>
      <RecipeEditForm
        recipe={recipe}
        categories={categories}
        ingredients={ingredients}
      />
    </div>
  );
}
