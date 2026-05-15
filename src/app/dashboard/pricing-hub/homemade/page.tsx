import { getPricingRows, getCategoriesWithTargets } from "@/lib/actions/pricing-tool";
import { PricingToolTable } from "@/components/finans-lab/pricing-tool-table";

export default async function HomemadePricingPage() {
  const [rows, allCategories] = await Promise.all([
    getPricingRows({ subRecipesOnly: true }),
    getCategoriesWithTargets(),
  ]);

  const usedCategoryIds = new Set(rows.map((r) => r.categoryId));
  const categories = allCategories.filter((c) => usedCategoryIds.has(c.id));

  return (
    <div className="max-w-7xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-stone-900">
          Homemade Ingredients
        </h2>
        <p className="text-sm text-stone-500 mt-0.5">
          Sub-recipes that produce ingredients (syrups, infusions, cordials,
          etc.). These don&apos;t sell directly, but their per-unit cost flows
          into every cocktail and food recipe that uses them.
        </p>
      </div>
      <PricingToolTable initialRows={rows} categories={categories} />
    </div>
  );
}
