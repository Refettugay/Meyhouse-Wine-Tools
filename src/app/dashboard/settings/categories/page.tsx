import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { getCategoriesConfig } from "@/lib/actions/settings";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CategoriesManager } from "@/components/settings/categories-manager";

export default async function CategoriesPage() {
  const orgId = await getOrganizationId();

  // Get structured categories config (auto-migrates if needed)
  const config = await getCategoriesConfig();

  // Get product counts per sub-category
  const products = await prisma.ingredient.findMany({
    where: { organizationId: orgId, isActive: true, ingredientCategory: { not: null } },
    select: { ingredientCategory: true },
  });

  const counts: Record<string, number> = {};
  for (const p of products) {
    const cat = p.ingredientCategory!;
    counts[cat] = (counts[cat] || 0) + 1;
  }

  const totalProducts = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Product Categories</h1>
        <p className="text-[var(--ink-muted)] text-sm mt-1">
          {config.parents.length} parent categories, {config.subs.length} sub-categories across {totalProducts} products.
          Click any category to configure pour sizes and serving style.
        </p>
      </div>

      <CategoriesManager config={config} subCounts={counts} />
    </div>
  );
}
