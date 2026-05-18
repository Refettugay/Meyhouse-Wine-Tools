import { getBeverageMatrix, getLocations, getStrategyConfig } from "@/lib/actions/beverage-matrix";
import { BeverageMatrix } from "@/components/pricing-hub/beverage-matrix";
import { StrategyConfigPanel } from "@/components/pricing-hub/strategy-config";

export default async function SpiritsPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const sp = await searchParams;
  const locationId = sp.location && sp.location !== "all" ? sp.location : undefined;
  const [data, locations, strategyConfig] = await Promise.all([
    getBeverageMatrix("spirits", locationId),
    getLocations(),
    getStrategyConfig("spirits"),
  ]);
  return (
    <div className="max-w-full">
      <div className="mb-4 flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--brand-brown)]">Spirits</h2>
          <p className="text-sm text-[var(--ink-muted)] mt-0.5">
            Vodka, Gin, Tequila, Mezcal, Bourbon, Rye, Scotch, Japanese
            Whiskey, Cordials. Use tiered to price well / call / premium
            correctly.
          </p>
        </div>
        <StrategyConfigPanel
          tab="spirits"
          tabLabel="Spirits"
          initialConfig={strategyConfig}
        />
      </div>
      <BeverageMatrix
        tab="spirits"
        initial={data}
        locations={locations}
        selectedLocationId={sp.location || "all"}
      />
    </div>
  );
}
