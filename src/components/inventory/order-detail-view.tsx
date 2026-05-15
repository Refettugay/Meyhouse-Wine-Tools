"use client";

import { useState, useMemo } from "react";
import { Printer, ShoppingCart, MapPin } from "lucide-react";
import { formatCents } from "@/lib/calculations/cost";

interface OrderItem {
  id: string;
  name: string;
  vendor: string | null;
  countedStock: number | null;
  parSnapshot: number | null;
  quantityNeeded: number;
  unit: string;
  storageArea: string | null;
  status: string;
  bottleCostCents: number | null;
  casePackSize: number | null;
}

// Line cost = bottleCost × bottles (where bottles = qty × casePack if unit is "case")
function lineCostOf(item: OrderItem): number {
  if (!item.bottleCostCents) return 0;
  if (item.unit === "case" && item.casePackSize) {
    return item.bottleCostCents * item.casePackSize * item.quantityNeeded;
  }
  return item.bottleCostCents * item.quantityNeeded;
}

function bottlesOf(item: OrderItem): number {
  if (item.unit === "case" && item.casePackSize) {
    return item.casePackSize * item.quantityNeeded;
  }
  return item.quantityNeeded;
}

export function OrderDetailView({
  orderId,
  items,
}: {
  orderId: string;
  items: OrderItem[];
}) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Group by vendor
  const grouped = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const item of items) {
      const vendor = item.vendor || "No Vendor";
      if (!map.has(vendor)) map.set(vendor, []);
      map.get(vendor)!.push(item);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([vendor, items]) => ({
        vendor,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [items]);

  const totalCost = items.reduce((sum, item) => sum + lineCostOf(item), 0);
  const totalBottles = items.reduce((sum, item) => sum + bottlesOf(item), 0);

  function toggleCheck(id: string) {
    const newSet = new Set(checkedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setCheckedItems(newSet);
  }

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
          <p className="text-xs text-stone-500">Items</p>
          <p className="text-xl font-bold">{items.length}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <p className="text-xs text-stone-500">Total Bottles</p>
          <p className="text-xl font-bold">{totalBottles}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <p className="text-xs text-stone-500">Est. Cost</p>
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
          Print
        </button>
      </div>

      {/* Grouped by vendor */}
      <div className="space-y-4">
        {grouped.map(({ vendor, items: vendorItems }) => {
          const vendorCost = vendorItems.reduce(
            (sum, item) => sum + lineCostOf(item),
            0
          );

          return (
            <div
              key={vendor}
              className="bg-white border border-stone-200 rounded-xl overflow-hidden print:border print:border-black"
            >
              <div className="px-4 py-3 border-b border-stone-200 bg-stone-50 print:bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-amber-600 print:text-black" />
                    <h3 className="font-semibold">{vendor}</h3>
                    <span className="text-xs text-stone-500 print:text-black">
                      ({vendorItems.length} items)
                    </span>
                  </div>
                  {vendorCost > 0 && (
                    <span className="text-sm font-medium text-amber-600 print:text-black">
                      {formatCents(vendorCost)}
                    </span>
                  )}
                </div>
              </div>

              <div className="divide-y divide-stone-200">
                {vendorItems.map((item) => {
                  const isChecked = checkedItems.has(item.id);
                  const lineCost = lineCostOf(item);

                  return (
                    <div
                      key={item.id}
                      className={`px-4 py-3 flex items-center gap-3 hover:bg-stone-50 transition-colors ${
                        isChecked ? "opacity-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(item.id)}
                        className="w-4 h-4 rounded bg-stone-100 border-stone-300 text-amber-500 focus:ring-amber-500 print:hidden"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-medium text-sm ${
                            isChecked ? "line-through" : ""
                          }`}
                        >
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-stone-500 mt-0.5 flex-wrap">
                          {item.parSnapshot !== null &&
                            item.countedStock !== null && (
                              <span>
                                Par {item.parSnapshot} / Counted{" "}
                                {item.countedStock}
                              </span>
                            )}
                          {item.storageArea && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {item.storageArea}
                              </span>
                            </>
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
                        <p className="text-lg font-bold text-amber-600 print:text-black">
                          {item.quantityNeeded}
                        </p>
                        <p className="text-xs text-stone-500">
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
                        <div className="w-20 text-right text-sm text-stone-600">
                          {formatCents(lineCost)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
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
          .bg-stone-50 {
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
