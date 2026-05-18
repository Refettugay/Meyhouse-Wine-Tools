"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { submitStockCounts } from "@/lib/actions/inventory";
import { Search, Check, Save, AlertTriangle } from "lucide-react";

interface InventoryItem {
  id: string;
  parLevel: number;
  currentStock: number;
  unit: string;
  ingredient: {
    id: string;
    name: string;
    vendor: string | null;
    ingredientCategory: string | null;
  };
}

export function StockCountForm({
  locationId,
  items,
}: {
  locationId: string;
  items: InventoryItem[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const categories = useMemo(() => {
    return [
      ...new Set(
        items.map((i) => i.ingredient.ingredientCategory).filter(Boolean)
      ),
    ].sort() as string[];
  }, [items]);

  const filtered = items.filter((item) => {
    const matchesSearch = item.ingredient.name
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesCat =
      categoryFilter === "ALL" ||
      item.ingredient.ingredientCategory === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const countedItems = Object.keys(counts).length;

  function updateCount(id: string, value: string) {
    setCounts({ ...counts, [id]: value });
  }

  async function handleSubmit() {
    setError("");
    const validCounts = Object.entries(counts)
      .filter(([_, v]) => v !== "")
      .map(([id, v]) => ({
        inventoryItemId: id,
        count: parseFloat(v) || 0,
      }));

    if (validCounts.length === 0) {
      setError("Enter at least one count before saving");
      return;
    }

    setSaving(true);
    const result = await submitStockCounts(validCounts);
    if (result?.success) {
      router.push(`/dashboard/inventory/${locationId}`);
    } else {
      setError("Failed to save counts");
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

      {/* Sticky action bar */}
      <div className="sticky top-0 z-10 bg-[var(--brand-cream)] pb-3 mb-3">
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--ink-muted)]">
              {countedItems} of {items.length} counted
            </span>
            <button
              onClick={handleSubmit}
              disabled={saving || countedItems === 0}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Counts"}
            </button>
          </div>
        </div>
      </div>

      {/* Item list - simple, large touch targets */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const currentVal = counts[item.id] ?? "";
          const hasCount = currentVal !== "";
          const newStock = hasCount ? parseFloat(currentVal) || 0 : item.currentStock;
          const isBelowPar = newStock < item.parLevel;

          return (
            <div
              key={item.id}
              className={`bg-white border rounded-xl p-3 transition-colors ${
                hasCount
                  ? "border-[var(--brand-olive)]"
                  : "border-[var(--line)]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {item.ingredient.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] mt-0.5">
                    <span>
                      Par: <span className="text-[var(--brand-brown)]">{item.parLevel}</span>
                    </span>
                    <span>•</span>
                    <span>
                      Was: <span className="text-[var(--brand-brown)]">{item.currentStock}</span>
                    </span>
                    {item.ingredient.vendor && (
                      <>
                        <span>•</span>
                        <span className="truncate">{item.ingredient.vendor}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {hasCount && isBelowPar && (
                    <AlertTriangle className="w-4 h-4 text-[var(--brand-olive)]" />
                  )}
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={currentVal}
                    onChange={(e) => updateCount(item.id, e.target.value)}
                    placeholder="—"
                    className="w-20 px-2 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-lg text-center font-bold focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  />
                  {hasCount && (
                    <Check className="w-4 h-4 text-green-600" />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-[var(--ink-muted)]">
            No items match your filters
          </div>
        )}
      </div>
    </div>
  );
}
