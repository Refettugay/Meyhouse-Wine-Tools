import { getBeverageMatrix, getLocations, getStrategyConfig } from "@/lib/actions/beverage-matrix";
import { BeverageMatrix } from "@/components/pricing-hub/beverage-matrix";
import { StrategyConfigPanel } from "@/components/pricing-hub/strategy-config";

export default async function NaPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const sp = await searchParams;
  const locationId = sp.location && sp.location !== "all" ? sp.location : undefined;
  const [data, locations, strategyConfig] = await Promise.all([
    getBeverageMatrix("na", locationId),
    getLocations(),
    getStrategyConfig("na"),
  ]);
  return (
    <div className="max-w-full">
      <div className="mb-4 flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">NA / Soft Drinks</h2>
          <p className="text-sm text-stone-500 mt-0.5">
            Non-alcoholic beverages — coffee, tea, mocktails, juices. Highest-margin category.
          </p>
        </div>
        <StrategyConfigPanel
          tab="na"
          tabLabel="NA / Soft Drinks"
          initialConfig={strategyConfig}
        />
      </div>
      <BeverageMatrix
        tab="na"
        initial={data}
        locations={locations}
        selectedLocationId={sp.location || "all"}
      />
    </div>
  );
}
