import { getBeverageMatrix, getLocations, getStrategyConfig } from "@/lib/actions/beverage-matrix";
import { BeverageMatrix } from "@/components/pricing-hub/beverage-matrix";
import { StrategyConfigPanel } from "@/components/pricing-hub/strategy-config";

export default async function WineBtgPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const sp = await searchParams;
  const locationId = sp.location && sp.location !== "all" ? sp.location : undefined;
  const [data, locations, strategyConfig] = await Promise.all([
    getBeverageMatrix("wine-btg", locationId),
    getLocations(),
    getStrategyConfig("wine-btg"),
  ]);
  return (
    <div className="max-w-full">
      <div className="mb-4 flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Wine BTG</h2>
          <p className="text-sm text-stone-500 mt-0.5">
            By-the-glass wines. Each pour size can have its own target cost %,
            or switch to tiered for bottle-cost-driven pricing.
          </p>
        </div>
        <StrategyConfigPanel
          tab="wine-btg"
          tabLabel="Wine BTG"
          initialConfig={strategyConfig}
        />
      </div>
      <BeverageMatrix
        tab="wine-btg"
        initial={data}
        locations={locations}
        selectedLocationId={sp.location || "all"}
      />
    </div>
  );
}
