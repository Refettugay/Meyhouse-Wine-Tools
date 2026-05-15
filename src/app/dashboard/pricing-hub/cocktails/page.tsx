import { getPricingRows, getCategoriesWithTargets } from "@/lib/actions/pricing-tool";
import { PricingToolTable } from "@/components/finans-lab/pricing-tool-table";

export default async function CocktailsPricingPage() {
  const [rows, allCategories] = await Promise.all([
    getPricingRows({ categoryKeywordsAny: ["cocktail"] }),
    getCategoriesWithTargets(),
  ]);

  const usedCategoryIds = new Set(rows.map((r) => r.categoryId));
  const categories = allCategories.filter((c) => usedCategoryIds.has(c.id));

  return (
    <div className="max-w-7xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-stone-900">Cocktails</h2>
        <p className="text-sm text-stone-500 mt-0.5">
          House and classic cocktail recipes. Cost is calculated from each
          recipe&apos;s ingredients; suggested price uses the category cost
          target.
        </p>
      </div>
      <PricingToolTable initialRows={rows} categories={categories} />
    </div>
  );
}
