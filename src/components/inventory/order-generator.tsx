"use client";

import { useState, useMemo } from "react";
import { formatCents } from "@/lib/calculations/cost";
import { Printer, ShoppingCart, CheckCircle2 } from "lucide-react";

interface OrderItem {
  id: string;
  ingredient: {
    id: string;
    name: string;
    vendor: string | null;
    ingredientCategory: string | null;
    bottleSizeMl: number | null;
    bottleCostCents: number | null;
  };
  currentStock: number;
  parLevel: number;
  quantityNeeded: number;
  unit: string;
}

export function OrderGenerator({ items }: { items: OrderItem[] }) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Group items by vendor
  const grouped = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const item of items) {
      const vendor = item.ingredient.vendor || "No Vendor";
      if (!map.has(vendor)) map.set(vendor, []);
      map.get(vendor)!.push(item);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([vendor, items]) => ({ vendor, items }));
  }, [items]);

  const totalCost = items.reduce((sum, item) => {
    if (!item.ingredient.bottleCostCents) return sum;
    return sum + item.ingredient.bottleCostCents * item.quantityNeeded;
  }, 0);

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

  if (items.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold mb-2">All Stocked Up!</h2>
        <p className="text-stone-500 text-sm">
          No items need reordering. All inventory is at or above par levels.
        </p>
      </div>
    );
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
          <p className="text-xl font-bold">
            {items.reduce((sum, i) => sum + i.quantityNeeded, 0)}
          </p>
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
          Print Order List
        </button>
      </div>

      {/* Grouped order list */}
      <div className="space-y-4">
        {grouped.map(({ vendor, items: vendorItems }) => {
          const vendorCost = vendorItems.reduce((sum, item) => {
            if (!item.ingredient.bottleCostCents) return sum;
            return sum + item.ingredient.bottleCostCents * item.quantityNeeded;
          }, 0);

          return (
            <div
              key={vendor}
              className="bg-white border border-stone-200 rounded-xl overflow-hidden print:border print:border-black"
            >
              <div className="px-4 py-3 border-b border-stone-200 bg-stone-100/50 print:bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-amber-500 print:text-black" />
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
                  const lineCost = item.ingredient.bottleCostCents
                    ? item.ingredient.bottleCostCents * item.quantityNeeded
                    : 0;

                  return (
                    <div
                      key={item.id}
                      className={`px-4 py-3 flex items-center gap-3 hover:bg-stone-100/50 transition-colors ${
                        isChecked ? "opacity-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(item.id)}
                        className="w-4 h-4 rounded bg-stone-100 border-stone-300 text-amber-500 focus:ring-amber-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-medium text-sm ${
                            isChecked ? "line-through" : ""
                          }`}
                        >
                          {item.ingredient.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
                          <span>
                            Par {item.parLevel} / Have {item.currentStock}
                          </span>
                          {item.ingredient.ingredientCategory && (
                            <>
                              <span>•</span>
                              <span>{item.ingredient.ingredientCategory}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-amber-600 print:text-black">
                          {item.quantityNeeded}
                        </p>
                        <p className="text-xs text-stone-400">{item.unit}</p>
                      </div>
                      {lineCost > 0 && (
                        <div className="w-20 text-right text-sm text-stone-500">
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
          .bg-stone-100 {
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
