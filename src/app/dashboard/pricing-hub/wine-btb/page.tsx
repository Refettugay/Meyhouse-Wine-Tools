import { getBeverageMatrix, getLocations, getStrategyConfig } from "@/lib/actions/beverage-matrix";
import { BeverageMatrix } from "@/components/pricing-hub/beverage-matrix";
import { StrategyConfigPanel } from "@/components/pricing-hub/strategy-config";

export default async function WineBtbPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const sp = await searchParams;
  const locationId = sp.location && sp.location !== "all" ? sp.location : undefined;
  const [data, locations, strategyConfig] = await Promise.all([
    getBeverageMatrix("wine-btb", locationId),
    getLocations(),
    getStrategyConfig("wine-btb"),
  ]);
  return (
    <div className="max-w-full">
      <div className="mb-4 flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--brand-brown)]">Wine BTB</h2>
          <p className="text-sm text-[var(--ink-muted)] mt-0.5">
            By-the-bottle wine list. Use tiered pricing so expensive bottles
            stay sellable and cheap bottles deliver strong margin.
          </p>
        </div>
        <StrategyConfigPanel
          tab="wine-btb"
          tabLabel="Wine BTB"
          initialConfig={strategyConfig}
        />
      </div>
      <BeverageMatrix
        tab="wine-btb"
        initial={data}
        locations={locations}
        selectedLocationId={sp.location || "all"}
      />
    </div>
  );
}
