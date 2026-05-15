import { getBeverageMatrix, getLocations, getStrategyConfig } from "@/lib/actions/beverage-matrix";
import { BeverageMatrix } from "@/components/pricing-hub/beverage-matrix";
import { StrategyConfigPanel } from "@/components/pricing-hub/strategy-config";

export default async function WineHalfBottlePricingPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const sp = await searchParams;
  const locationId = sp.location && sp.location !== "all" ? sp.location : undefined;
  const [data, locations, strategyConfig] = await Promise.all([
    getBeverageMatrix("wine-half", locationId),
    getLocations(),
    getStrategyConfig("wine-half"),
  ]);
  return (
    <div className="max-w-full">
      <div className="mb-4 flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Wine Half Bottle (375ml)</h2>
          <p className="text-sm text-stone-500 mt-0.5">
            Only items whose category is <code className="text-xs px-1 rounded bg-stone-100">Wine - Half Bottle - *</code>.
            Pricing follows a sweet-spot tier: cheap bottles use aggressive
            markup (to hit the $65–95 zone), prestige bottles use gentle
            markup (~2x) to keep them sellable as menu anchors.
          </p>
        </div>
        <StrategyConfigPanel
          tab="wine-half"
          tabLabel="Wine Half Bottle"
          initialConfig={strategyConfig}
        />
      </div>
      <BeverageMatrix
        tab="wine-half"
        initial={data}
        locations={locations}
        selectedLocationId={sp.location || "all"}
      />
    </div>
  );
}
