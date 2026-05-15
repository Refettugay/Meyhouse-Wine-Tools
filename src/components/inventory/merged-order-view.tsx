"use client";

import { useMemo } from "react";
import { Printer, ShoppingCart, MapPin } from "lucide-react";
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
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <p className="text-xs text-stone-500">Vendors</p>
          <p className="text-xl font-bold">{grouped.length}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <p className="text-xs text-stone-500">Line Items</p>
          <p className="text-xl font-bold">{items.length}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <p className="text-xs text-stone-500">Total Bottles</p>
          <p className="text-xl font-bold">{totalBottles}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <p className="text-xs text-stone-500">Total Cost (est.)</p>
          <p className="text-xl font-bold text-amber-600">
            {totalCost > 0 ? formatCents(totalCost) : "—"}
          </p>
        </div>
      </div>

      <div className="flex justify-end mb-4 print:hidden">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm transition-colors"
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
            className="bg-white border border-stone-200 rounded-xl overflow-hidden print:border print:border-black"
          >
            <div className="px-4 py-3 border-b-2 border-amber-500 bg-amber-50 print:bg-white">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-amber-600 print:text-black" />
                  <h2 className="text-lg font-bold">{vg.vendor}</h2>
                  <span className="text-xs text-stone-600 print:text-black">
                    ({vg.totalBottles} bottles across{" "}
                    {vg.locationGroups.length} stores)
                  </span>
                </div>
                {vg.totalCost > 0 && (
                  <span className="text-sm font-semibold text-amber-700 print:text-black">
                    {formatCents(vg.totalCost)}
                  </span>
                )}
              </div>
            </div>

            {vg.locationGroups.map((lg) => (
              <div
                key={lg.locationName}
                className="border-b border-stone-200 last:border-b-0"
              >
                <div className="px-4 py-2 bg-stone-50 flex items-center justify-between print:bg-white">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-stone-500 print:text-black" />
                    <h3 className="text-sm font-semibold">{lg.locationName}</h3>
                    <span className="text-xs text-stone-500 print:text-black">
                      ({lg.items.length} items, {lg.subtotalBottles} bottles)
                    </span>
                  </div>
                  {lg.subtotalCost > 0 && (
                    <span className="text-xs text-stone-600 print:text-black">
                      {formatCents(lg.subtotalCost)}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-stone-200">
                  {lg.items.map((item) => {
                    const lineCost = lineCostOf(item);
                    return (
                      <div
                        key={item.itemId}
                        className="px-4 py-2 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.name}</p>
                          <div className="flex items-center gap-2 text-xs text-stone-500 print:text-black">
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
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-amber-600 print:text-black">
                            {item.quantityNeeded}
                          </p>
                          <p className="text-xs text-stone-500 print:text-black">
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
                          <div className="w-16 text-right text-xs text-stone-600 print:text-black">
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
          .bg-stone-100,
          .bg-stone-50,
          .bg-amber-50 {
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
