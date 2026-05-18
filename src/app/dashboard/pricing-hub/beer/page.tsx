import { getBeverageMatrix, getLocations, getStrategyConfig } from "@/lib/actions/beverage-matrix";
import { BeverageMatrix } from "@/components/pricing-hub/beverage-matrix";
import { StrategyConfigPanel } from "@/components/pricing-hub/strategy-config";

export default async function BeerPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const sp = await searchParams;
  const locationId = sp.location && sp.location !== "all" ? sp.location : undefined;
  const [data, locations, strategyConfig] = await Promise.all([
    getBeverageMatrix("beer", locationId),
    getLocations(),
    getStrategyConfig("beer"),
  ]);
  return (
    <div className="max-w-full">
      <div className="mb-4 flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--brand-brown)]">Beer</h2>
          <p className="text-sm text-[var(--ink-muted)] mt-0.5">
            Bottled, canned, and draft beer.
          </p>
        </div>
        <StrategyConfigPanel
          tab="beer"
          tabLabel="Beer"
          initialConfig={strategyConfig}
        />
      </div>
      <BeverageMatrix
        tab="beer"
        initial={data}
        locations={locations}
        selectedLocationId={sp.location || "all"}
      />
    </div>
  );
}
