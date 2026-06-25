"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Printer, ShoppingCart, MapPin, ArrowRightLeft, Send } from "lucide-react";
import { formatCents } from "@/lib/calculations/cost";
import { submitOrderForApproval } from "@/lib/actions/inventory";

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
  transferNote: string | null;
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
  status,
  items,
}: {
  orderId: string;
  status: string;
  items: OrderItem[];
}) {
  const router = useRouter();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    const res = await submitOrderForApproval(orderId);
    setSubmitting(false);
    if (res?.error) setSubmitError(res.error);
    else router.refresh();
  }

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
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <p className="text-xs text-[var(--ink-muted)]">Vendors</p>
          <p className="text-xl font-bold">{grouped.length}</p>
        </div>
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <p className="text-xs text-[var(--ink-muted)]">Items</p>
          <p className="text-xl font-bold">{items.length}</p>
        </div>
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <p className="text-xs text-[var(--ink-muted)]">Total Bottles</p>
          <p className="text-xl font-bold">{totalBottles}</p>
        </div>
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <p className="text-xs text-[var(--ink-muted)]">Est. Cost</p>
          <p className="text-xl font-bold text-[var(--brand-olive)]">
            {totalCost > 0 ? formatCents(totalCost) : "—"}
          </p>
        </div>
      </div>

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4 print:hidden">
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-2 mb-4 print:hidden">
        {status === "IN_PROGRESS" && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submitting ? "Submitting..." : "Submit for Approval"}
          </button>
        )}
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-sm transition-colors"
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
              className="bg-white border border-[var(--line)] rounded-xl overflow-hidden print:border print:border-black"
            >
              <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--brand-cream)] print:bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-[var(--brand-olive)] print:text-black" />
                    <h3 className="font-semibold">{vendor}</h3>
                    <span className="text-xs text-[var(--ink-muted)] print:text-black">
                      ({vendorItems.length} items)
                    </span>
                  </div>
                  {vendorCost > 0 && (
                    <span className="text-sm font-medium text-[var(--brand-olive)] print:text-black">
                      {formatCents(vendorCost)}
                    </span>
                  )}
                </div>
              </div>

              <div className="divide-y divide-[var(--line)]">
                {vendorItems.map((item) => {
                  const isChecked = checkedItems.has(item.id);
                  const lineCost = lineCostOf(item);

                  return (
                    <div
                      key={item.id}
                      className={`px-4 py-3 flex items-center gap-3 hover:bg-[var(--brand-cream)] transition-colors ${
                        isChecked ? "opacity-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(item.id)}
                        className="w-4 h-4 rounded bg-[var(--brand-cream)] border-[var(--line)] text-[var(--brand-olive)] focus:ring-[var(--brand-olive)] print:hidden"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-medium text-sm ${
                            isChecked ? "line-through" : ""
                          }`}
                        >
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] mt-0.5 flex-wrap">
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
                        {item.transferNote && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--brand-olive-hover)] bg-[rgba(74,93,39,0.12)] rounded px-2 py-0.5 print:hidden">
                            <ArrowRightLeft className="w-3 h-3" />
                            {item.transferNote}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-[var(--brand-olive)] print:text-black">
                          {item.quantityNeeded}
                        </p>
                        <p className="text-xs text-[var(--ink-muted)]">
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
                        <div className="w-20 text-right text-sm text-[var(--ink-muted)]">
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
          .bg-[var(--brand-cream)],
          .bg-[var(--brand-cream)] {
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
