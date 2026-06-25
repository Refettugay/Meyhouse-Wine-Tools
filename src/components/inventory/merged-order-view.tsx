"use client";

import { useMemo } from "react";
import { Printer, ShoppingCart, MapPin, ArrowRightLeft } from "lucide-react";
import { formatCents } from "@/lib/calculations/cost";

interface MergedItem {
  orderId: string;
  itemId: string;
  name: string;
  vendor: string;
  locationId: string;
  locationName: string;
  quantityNeeded: number;
  unit: string;
  countedStock: number | null;
  parSnapshot: number | null;
  bottleCostCents: number | null;
  casePackSize: number | null;
  orderDate: string;
  status: string;
  transferNote: string | null;
}

// Compute the line cost taking into account unit (bottle vs case).
// If unit is "case", multiply by casePackSize to get the total cost
// (since bottleCostCents is always per-bottle).
function lineCostOf(item: {
  unit: string;
  quantityNeeded: number;
  bottleCostCents: number | null;
  casePackSize: number | null;
}): number {
  if (!item.bottleCostCents) return 0;
  if (item.unit === "case" && item.casePackSize) {
    return item.bottleCostCents * item.casePackSize * item.quantityNeeded;
  }
  return item.bottleCostCents * item.quantityNeeded;
}

// Compute the total bottles represented by a line item
// (1 case = casePackSize bottles)
function bottlesOf(item: {
  unit: string;
  quantityNeeded: number;
  casePackSize: number | null;
}): number {
  if (item.unit === "case" && item.casePackSize) {
    return item.casePackSize * item.quantityNeeded;
  }
  return item.quantityNeeded;
}

interface VendorGroup {
  vendor: string;
  locationGroups: {
    locationName: string;
    items: MergedItem[];
    subtotalCost: number;
    subtotalBottles: number;
  }[];
  totalCost: number;
  totalBottles: number;
}

export function MergedOrderView({ items }: { items: MergedItem[] }) {
  const grouped = useMemo<VendorGroup[]>(() => {
    // First group by vendor
    const byVendor = new Map<string, MergedItem[]>();
    for (const item of items) {
      if (!byVendor.has(item.vendor)) byVendor.set(item.vendor, []);
      byVendor.get(item.vendor)!.push(item);
    }

    // Then within each vendor, group by location
    return [...byVendor.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([vendor, vendorItems]) => {
        const byLocation = new Map<string, MergedItem[]>();
        for (const item of vendorItems) {
          if (!byLocation.has(item.locationName))
            byLocation.set(item.locationName, []);
          byLocation.get(item.locationName)!.push(item);
        }

        const locationGroups = [...byLocation.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([locationName, items]) => {
            const subtotalCost = items.reduce(
              (s, i) => s + lineCostOf(i),
              0
            );
            const subtotalBottles = items.reduce(
              (s, i) => s + bottlesOf(i),
              0
            );
            return {
              locationName,
              items: items.sort((a, b) => a.name.localeCompare(b.name)),
              subtotalCost,
              subtotalBottles,
            };
          });

        const totalCost = locationGroups.reduce(
          (s, g) => s + g.subtotalCost,
          0
        );
        const totalBottles = locationGroups.reduce(
          (s, g) => s + g.subtotalBottles,
          0
        );

        return { vendor, locationGroups, totalCost, totalBottles };
      });
  }, [items]);

  const totalCost = items.reduce((s, i) => s + lineCostOf(i), 0);
  const totalBottles = items.reduce((s, i) => s + bottlesOf(i), 0);

  function handlePrint() {
    window.print();
  }

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 print:hidden">
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <p className="text-xs text-[var(--ink-muted)]">Vendors</p>
          <p className="text-xl font-bold">{grouped.length}</p>
        </div>
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <p className="text-xs text-[var(--ink-muted)]">Line Items</p>
          <p className="text-xl font-bold">{items.length}</p>
        </div>
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <p className="text-xs text-[var(--ink-muted)]">Total Bottles</p>
          <p className="text-xl font-bold">{totalBottles}</p>
        </div>
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <p className="text-xs text-[var(--ink-muted)]">Total Cost (est.)</p>
          <p className="text-xl font-bold text-[var(--brand-olive)]">
            {totalCost > 0 ? formatCents(totalCost) : "—"}
          </p>
        </div>
      </div>

      <div className="flex justify-end mb-4 print:hidden">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-sm transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print Merged Order
        </button>
      </div>

      {/* Vendor → Location → Items */}
      <div className="space-y-5">
        {grouped.map((vg) => (
          <div
            key={vg.vendor}
            className="bg-white border border-[var(--line)] rounded-xl overflow-hidden print:border print:border-black"
          >
            <div className="px-4 py-3 border-b-2 border-[var(--brand-olive)] bg-[#FAF7F1] print:bg-white">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-[var(--brand-olive)] print:text-black" />
                  <h2 className="text-lg font-bold">{vg.vendor}</h2>
                  <span className="text-xs text-[var(--ink-muted)] print:text-black">
                    ({vg.totalBottles} bottles across{" "}
                    {vg.locationGroups.length} stores)
                  </span>
                </div>
                {vg.totalCost > 0 && (
                  <span className="text-sm font-semibold text-[var(--brand-olive-hover)] print:text-black">
                    {formatCents(vg.totalCost)}
                  </span>
                )}
              </div>
            </div>

            {vg.locationGroups.map((lg) => (
              <div
                key={lg.locationName}
                className="border-b border-[var(--line)] last:border-b-0"
              >
                <div className="px-4 py-2 bg-[var(--brand-cream)] flex items-center justify-between print:bg-white">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[var(--ink-muted)] print:text-black" />
                    <h3 className="text-sm font-semibold">{lg.locationName}</h3>
                    <span className="text-xs text-[var(--ink-muted)] print:text-black">
                      ({lg.items.length} items, {lg.subtotalBottles} bottles)
                    </span>
                  </div>
                  {lg.subtotalCost > 0 && (
                    <span className="text-xs text-[var(--ink-muted)] print:text-black">
                      {formatCents(lg.subtotalCost)}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-[var(--line)]">
                  {lg.items.map((item) => {
                    const lineCost = lineCostOf(item);
                    return (
                      <div
                        key={item.itemId}
                        className="px-4 py-2 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.name}</p>
                          <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] print:text-black">
                            {item.parSnapshot !== null &&
                              item.countedStock !== null && (
                                <span>
                                  Par {item.parSnapshot} / Had{" "}
                                  {item.countedStock}
                                </span>
                              )}
                            {item.casePackSize && item.casePackSize > 1 && (
                              <>
                                <span>·</span>
                                <span>{item.casePackSize}-pk</span>
                              </>
                            )}
                          </div>
                          {item.transferNote && (
                            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--brand-olive-hover)] bg-[rgba(74,93,39,0.12)] rounded px-2 py-0.5 print:hidden">
                              <ArrowRightLeft className="w-3 h-3" />
                              {item.transferNote}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-[var(--brand-olive)] print:text-black">
                            {item.quantityNeeded}
                          </p>
                          <p className="text-xs text-[var(--ink-muted)] print:text-black">
                            {item.unit}
                            {item.unit === "case" &&
                            item.casePackSize &&
                            item.casePackSize > 1
                              ? ` (${
                                  item.quantityNeeded * item.casePackSize
                                } btls)`
                              : ""}
                          </p>
                        </div>
                        {lineCost > 0 && (
                          <div className="w-16 text-right text-xs text-[var(--ink-muted)] print:text-black">
                            {formatCents(lineCost)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          nav,
          aside,
          .print\\:hidden {
            display: none !important;
          }
          .bg-white,
          .bg-[var(--brand-cream)],
          .bg-[var(--brand-cream)],
          .bg-[#FAF7F1] {
            background: white !important;
          }
          * {
            color: black !important;
          }
        }
      `}</style>
    </div>
  );
}
