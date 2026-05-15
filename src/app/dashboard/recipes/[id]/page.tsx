import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Edit } from "lucide-react";
import { RecipeDetail } from "@/components/recipe/recipe-detail";
import { BackToRecipes } from "@/components/recipe/back-button";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrganizationId();

  const recipe = await prisma.recipe.findFirst({
    where: { id, organizationId: orgId },
    include: {
      category: true,
      ingredients: {
        include: { ingredient: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!recipe) notFound();

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <BackToRecipes />
        <Link
          href={`/dashboard/recipes/${id}/edit`}
          className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm transition-colors"
        >
          <Edit className="w-4 h-4" />
          Edit
        </Link>
      </div>

      <RecipeDetail recipe={recipe} />
    </div>
  );
}
