import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Wine, FlaskConical, DollarSign } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await requireAuth();
  const orgId = session.organizationId;

  const [recipeCount, ingredientCount, categoryCount] = await Promise.all([
    prisma.recipe.count({ where: { organizationId: orgId, isArchived: false } }),
    prisma.ingredient.count({ where: { organizationId: orgId, isActive: true, onMenu: true } }),
    prisma.category.count({ where: { organizationId: orgId } }),
  ]);

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          Welcome, {session.userName.split(" ")[0]}
        </h1>
        <p className="text-stone-500 mt-1">{session.organizationName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Link
          href="/dashboard/recipes"
          className="bg-white border border-stone-200 rounded-xl p-4 hover:border-amber-500/30 transition-colors"
        >
          <Wine className="w-8 h-8 text-amber-500 mb-2" />
          <p className="text-2xl font-bold">{recipeCount}</p>
          <p className="text-sm text-stone-500">Recipes</p>
        </Link>

        <Link
          href="/dashboard/ingredients"
          className="bg-white border border-stone-200 rounded-xl p-4 hover:border-amber-500/30 transition-colors"
        >
          <FlaskConical className="w-8 h-8 text-amber-500 mb-2" />
          <p className="text-2xl font-bold">{ingredientCount}</p>
          <p className="text-sm text-stone-500">Ingredients</p>
        </Link>

        <Link
          href="/dashboard/pricing"
          className="bg-white border border-stone-200 rounded-xl p-4 hover:border-amber-500/30 transition-colors"
        >
          <DollarSign className="w-8 h-8 text-amber-500 mb-2" />
          <p className="text-2xl font-bold">{categoryCount}</p>
          <p className="text-sm text-stone-500">Categories</p>
        </Link>
      </div>

      {/* Quick actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/dashboard/recipes/new"
            className="bg-white border border-stone-200 rounded-xl p-4 hover:border-amber-500/30 transition-colors"
          >
            <p className="font-medium">Add New Recipe</p>
            <p className="text-sm text-stone-500 mt-1">
              Create a new cocktail recipe
            </p>
          </Link>
          <Link
            href="/dashboard/products/new"
            className="bg-white border border-stone-200 rounded-xl p-4 hover:border-amber-500/30 transition-colors"
          >
            <p className="font-medium">Add New Product</p>
            <p className="text-sm text-stone-500 mt-1">
              Add a spirit, wine, beer, grocery, or any product
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
