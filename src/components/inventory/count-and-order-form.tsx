"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { saveCountAndOrder } from "@/lib/actions/inventory";
import {
  Search,
  Save,
  AlertTriangle,
  Check,
  ArrowRight,
  MapPin,
} from "lucide-react";

interface CountItem {
  id: string;
  ingredient: {
    name: string;
    vendor: string | null;
    ingredientCategory: string | null;
    orderUnit: string;
    casePackSize: number | null;
  };
  parLevel: number;
  currentStock: number;
  unit: string;
  storageArea: { id: string; name: string } | null;
  lastCountedAt: string | null;
}

// Compute what to actually order when bottles are below par.
// Returns { quantity, unit } where unit is "case" or "bottle".
// Fallback: if ordered by case but no pack size, default to 12.
function orderQuantity(item: CountItem, bottlesNeeded: number): {
  quantity: number;
  unit: string;
} {
  if (bottlesNeeded <= 0) return { quantity: 0, unit: "bottle" };
  if (item.ingredient.orderUnit === "CASE") {
    const casePack =
      item.ingredient.casePackSize && item.ingredient.casePackSize > 1
        ? item.ingredient.casePackSize
        : 12;
    return {
      quantity: Math.ceil(bottlesNeeded / casePack),
      unit: "case",
    };
  }
  return { quantity: Math.ceil(bottlesNeeded), unit: "bottle" };
}

type GroupBy = "area" | "vendor" | "category";
type SortBy = "name" | "vendor" | "needed";

export function CountAndOrderForm({
  locationId,
  items,
}: {
  locationId: string;
  items: CountItem[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("area");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [useLastCount, setUseLastCount] = useState(true);

  function updateCount(id: string, value: string) {
    setCounts({ ...counts, [id]: value });
  }

  // If "use last count as starting value" is on, seed empty counts with currentStock
  function getEffectiveCount(item: CountItem): number | null {
    const entered = counts[item.id];
    if (entered !== undefined && entered !== "") return parseFloat(entered) || 0;
    if (useLastCount) return item.currentStock;
    return null;
  }

  const filtered = useMemo(() => {
    return items.filter((item) =>
      item.ingredient.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [items, search]);

  // Sort within each group
  function sortItems(arr: CountItem[]): CountItem[] {
    return [...arr].sort((a, b) => {
      if (sortBy === "vendor") {
        const cmp = (a.ingredient.vendor || "").localeCompare(
          b.ingredient.vendor || ""
        );
        if (cmp !== 0) return cmp;
      }
      if (sortBy === "needed") {
        const ac = getEffectiveCount(a) ?? a.currentStock;
        const bc = getEffectiveCount(b) ?? b.currentStock;
        const aNeed = Math.max(0, a.parLevel - ac);
        const bNeed = Math.max(0, b.parLevel - bc);
        if (aNeed !== bNeed) return bNeed - aNeed;
      }
      return a.ingredient.name.localeCompare(b.ingredient.name);
    });
  }

  // Group items
  const groups = useMemo(() => {
    const map = new Map<string, CountItem[]>();
    for (const item of filtered) {
      let key: string;
      if (groupBy === "area")
        key = item.storageArea?.name || "Unassigned";
      else if (groupBy === "vendor")
        key = item.ingredient.vendor || "No Vendor";
      else key = item.ingredient.ingredientCategory || "Uncategorized";

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, items]) => ({ name, items: sortItems(items) }));
  }, [filtered, groupBy, sortBy, counts, useLastCount]);

  // Stats
  const countedCount = Object.values(counts).filter((v) => v !== "").length;
  const itemsNeedingOrder = items.filter((item) => {
    const c = getEffectiveCount(item);
    if (c === null) return false;
    return c < item.parLevel;
  }).length;

  async function handleSubmit() {
    setError("");

    // Collect all counts (both entered and defaulted-to-current-stock if toggle on)
    const allCounts: { inventoryItemId: string; count: number }[] = [];
    for (const item of items) {
      const c = getEffectiveCount(item);
      if (c !== null && counts[item.id] !== undefined && counts[item.id] !== "") {
        // Only save counts the user actually entered
        allCounts.push({ inventoryItemId: item.id, count: c });
      }
    }

    if (allCounts.length === 0) {
      setError("Enter at least one count before saving");
      return;
    }

    setSaving(true);
    const result = await saveCountAndOrder({
      locationId,
      counts: allCounts,
      notes: notes || undefined,
    });

    if (result?.success) {
      router.push(`/dashboard/inventory/orders/${result.orderListId}`);
    } else {
      setError("Failed to save order");
      setSaving(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 bg-[var(--brand-cream)] pb-3 mb-3 -mx-4 px-4 lg:-mx-8 lg:px-8">
        <div className="bg-white border border-[var(--line)] rounded-xl p-3 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              />
            </div>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
            >
              <option value="area">Group by Storage Area</option>
              <option value="vendor">Group by Vendor</option>
              <option value="category">Group by Category</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
            >
              <option value="name">Sort by Name</option>
              <option value="vendor">Sort by Vendor</option>
              <option value="needed">Sort by Needed</option>
            </select>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-[var(--brand-brown)] font-medium">
                {countedCount} / {items.length} counted
              </span>
              {itemsNeedingOrder > 0 && (
                <span className="text-[var(--brand-olive)]">
                  {itemsNeedingOrder} need ordering
                </span>
              )}
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving || countedCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save & Generate Order"}
            </button>
          </div>
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-4">
        {groups.map((group) => (
          <div
            key={group.name}
            className="bg-white border border-[var(--line)] rounded-xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--brand-cream)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--brand-olive)]" />
                <h3 className="font-semibold">{group.name}</h3>
                <span className="text-xs text-[var(--ink-muted)]">
                  ({group.items.length})
                </span>
              </div>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {group.items.map((item) => {
                const enteredVal = counts[item.id] ?? "";
                const hasEntry = enteredVal !== "";
                const effectiveCount = hasEntry
                  ? parseFloat(enteredVal) || 0
                  : item.currentStock;
                const bottlesNeeded = Math.max(
                  0,
                  item.parLevel - effectiveCount
                );
                const needsOrder = bottlesNeeded > 0 && hasEntry;
                const order = orderQuantity(item, bottlesNeeded);
                const isCase = item.ingredient.orderUnit === "CASE";
                const effectiveCasePack =
                  item.ingredient.casePackSize && item.ingredient.casePackSize > 1
                    ? item.ingredient.casePackSize
                    : 12;

                return (
                  <div
                    key={item.id}
                    className={`px-4 py-3 transition-colors ${
                      needsOrder ? "bg-[#FAF7F1]" : ""
                    } ${hasEntry ? "bg-green-50/30" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.ingredient.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] mt-0.5 flex-wrap">
                          <span>
                            Par:{" "}
                            <span className="text-[var(--brand-brown)] font-medium">
                              {item.parLevel}
                            </span>
                          </span>
                          <span>·</span>
                          <span>
                            Previous:{" "}
                            <span className="text-[var(--brand-brown)]">
                              {item.currentStock}
                            </span>
                          </span>
                          {isCase && (
                            <>
                              <span>·</span>
                              <span className="text-[var(--brand-olive-hover)] font-medium">
                                by case ({effectiveCasePack}-pk)
                              </span>
                            </>
                          )}
                          {item.ingredient.vendor && (
                            <>
                              <span>·</span>
                              <span className="truncate">
                                {item.ingredient.vendor}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {needsOrder && (
                          <div className="text-xs text-[var(--brand-olive-hover)] bg-[rgba(74,93,39,0.12)] rounded px-2 py-1 font-medium whitespace-nowrap">
                            Order {order.quantity}{" "}
                            {order.quantity === 1 ? order.unit : order.unit + "s"}
                          </div>
                        )}
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={enteredVal}
                          onChange={(e) => updateCount(item.id, e.target.value)}
                          placeholder="—"
                          className="w-20 px-2 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-lg text-center font-bold focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                        />
                        {hasEntry && !needsOrder && (
                          <Check className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="mt-4 bg-white border border-[var(--line)] rounded-xl p-4">
        <label className="block text-sm font-medium text-[var(--brand-brown)] mb-2">
          Order Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Anything to remember about this order..."
          className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] resize-none"
        />
      </div>
    </div>
  );
}
