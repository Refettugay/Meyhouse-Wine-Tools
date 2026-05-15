import { getPricingRows, getCategoriesWithTargets } from "@/lib/actions/pricing-tool";
import { PricingToolTable } from "@/components/finans-lab/pricing-tool-table";

// Food tab: everything that isn't a cocktail.
// Excludes beverage categories so food recipes land here cleanly.
const EXCLUDE = [
  "cocktail",
  "wine",
  "spirit",
  "beer",
  "raki",
  "vodka",
  "gin",
  "tequila",
  "mezcal",
  "whiskey",
  "bourbon",
  "rye",
  "scotch",
  "cordial",
  "rum",
  "soft",
  "na",
  "sparkling",
];

export default async function FoodPricingPage() {
  const [rows, allCategories] = await Promise.all([
    getPricingRows({ excludeCategoryKeywords: EXCLUDE }),
    getCategoriesWithTargets(),
  ]);

  const usedCategoryIds = new Set(rows.map((r) => r.categoryId));
  const categories = allCategories.filter((c) => usedCategoryIds.has(c.id));

  return (
    <div className="max-w-7xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-stone-900">Food</h2>
        <p className="text-sm text-stone-500 mt-0.5">
          Food recipes (mezze, mains, sides, desserts). Cost comes from the
          recipe&apos;s ingredients; suggested price uses the category cost
          target.
        </p>
      </div>
      <PricingToolTable initialRows={rows} categories={categories} />
    </div>
  );
}
