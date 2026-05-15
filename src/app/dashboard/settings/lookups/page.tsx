import { getOrgSettings } from "@/lib/actions/settings";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LookupsManager } from "@/components/settings/lookups-manager";
import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";

export default async function LookupsPage() {
  const orgId = await getOrganizationId();
  const settings = await getOrgSettings();

  // Also grab distinct categories from existing ingredients so we can
  // show any that aren't yet in the settings list (for migration/seeding)
  const ingredients = await prisma.ingredient.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      ingredientCategory: { not: null },
    },
    select: { ingredientCategory: true },
  });
  const distinctIngCategories = [
    ...new Set(
      ingredients
        .map((i) => i.ingredientCategory!)
        .filter((c) => c && c.trim())
    ),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="p-4 lg:p-8 max-w-3xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-2 text-stone-500 hover:text-stone-900 mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Lookup Values</h1>
        <p className="text-stone-500 text-sm mt-1">
          Manage the dropdown values used throughout the app when adding
          products
        </p>
      </div>

      <LookupsManager
        bottleSizes={settings.bottleSizes}
        caseSizes={settings.caseSizes}
        categories={settings.categories}
        distinctIngredientCategories={distinctIngCategories}
      />
    </div>
  );
}
