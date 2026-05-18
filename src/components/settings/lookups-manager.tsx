"use client";

import { useState } from "react";
import {
  addBottleSize,
  removeBottleSize,
  addCaseSize,
  removeCaseSize,
  addProductCategory,
  removeProductCategory,
  seedCategoriesFromIngredients,
} from "@/lib/actions/settings";
import { Plus, Trash2, Wine, Package, Tag, Sparkles } from "lucide-react";

export function LookupsManager({
  bottleSizes,
  caseSizes,
  categories,
  distinctIngredientCategories,
}: {
  bottleSizes: number[];
  caseSizes: number[];
  categories: string[];
  distinctIngredientCategories: string[];
}) {
  const [error, setError] = useState("");
  const [newBottleSize, setNewBottleSize] = useState("");
  const [newCaseSize, setNewCaseSize] = useState("");
  const [newCategory, setNewCategory] = useState("");

  // Categories that are used by products but not yet in the managed list
  const orphanCategories = distinctIngredientCategories.filter(
    (c) => !categories.includes(c)
  );

  async function handleAddBottleSize(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const val = parseFloat(newBottleSize);
    if (!val || val <= 0) {
      setError("Enter a valid bottle size in ml");
      return;
    }
    const result = await addBottleSize(val);
    if (result?.error) setError(result.error);
    else setNewBottleSize("");
  }

  async function handleAddCaseSize(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const val = parseInt(newCaseSize);
    if (!val || val <= 0) {
      setError("Enter a valid case size");
      return;
    }
    const result = await addCaseSize(val);
    if (result?.error) setError(result.error);
    else setNewCaseSize("");
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!newCategory.trim()) {
      setError("Category name is required");
      return;
    }
    const result = await addProductCategory(newCategory);
    if (result?.error) setError(result.error);
    else setNewCategory("");
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Bottle Sizes */}
      <section className="bg-white border border-[var(--line)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center gap-2">
          <Wine className="w-5 h-5 text-[var(--brand-olive)]" />
          <h2 className="font-semibold">Bottle Sizes (ml)</h2>
          <span className="text-xs text-[var(--ink-muted)]">
            ({bottleSizes.length})
          </span>
        </div>
        <div className="p-4">
          <form onSubmit={handleAddBottleSize} className="flex gap-2 mb-3">
            <input
              type="number"
              step="0.01"
              min="1"
              value={newBottleSize}
              onChange={(e) => setNewBottleSize(e.target.value)}
              placeholder="e.g. 330"
              className="flex-1 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
            />
            <button
              type="submit"
              className="flex items-center gap-1 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </form>
          {bottleSizes.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)] italic">No sizes yet</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {bottleSizes.map((size) => (
                <div
                  key={size}
                  className="flex items-center gap-1 bg-[var(--brand-cream)] rounded-full pl-3 pr-1 py-1 text-sm"
                >
                  <span>{size}ml</span>
                  <button
                    onClick={async () => {
                      if (confirm(`Remove ${size}ml from the list?`)) {
                        await removeBottleSize(size);
                      }
                    }}
                    className="p-1 text-[var(--ink-muted)] hover:text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Case Pack Sizes */}
      <section className="bg-white border border-[var(--line)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center gap-2">
          <Package className="w-5 h-5 text-[var(--brand-olive)]" />
          <h2 className="font-semibold">Case Pack Sizes</h2>
          <span className="text-xs text-[var(--ink-muted)]">({caseSizes.length})</span>
        </div>
        <div className="p-4">
          <p className="text-xs text-[var(--ink-muted)] mb-3">
            Number of bottles per case (e.g. 6-pack, 12-pack)
          </p>
          <form onSubmit={handleAddCaseSize} className="flex gap-2 mb-3">
            <input
              type="number"
              step="1"
              min="1"
              value={newCaseSize}
              onChange={(e) => setNewCaseSize(e.target.value)}
              placeholder="e.g. 15"
              className="flex-1 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
            />
            <button
              type="submit"
              className="flex items-center gap-1 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </form>
          {caseSizes.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)] italic">No case sizes yet</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {caseSizes.map((size) => (
                <div
                  key={size}
                  className="flex items-center gap-1 bg-[var(--brand-cream)] rounded-full pl-3 pr-1 py-1 text-sm"
                >
                  <span>{size === 1 ? "1 (single)" : `${size}-pack`}</span>
                  <button
                    onClick={async () => {
                      if (confirm(`Remove ${size}-pack from the list?`)) {
                        await removeCaseSize(size);
                      }
                    }}
                    className="p-1 text-[var(--ink-muted)] hover:text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Product Categories */}
      <section className="bg-white border border-[var(--line)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-[var(--brand-olive)]" />
            <h2 className="font-semibold">Product Categories</h2>
            <span className="text-xs text-[var(--ink-muted)]">({categories.length})</span>
          </div>
          {orphanCategories.length > 0 && (
            <button
              onClick={async () => {
                if (
                  confirm(
                    `Import ${orphanCategories.length} categories from existing products?`
                  )
                ) {
                  await seedCategoriesFromIngredients();
                }
              }}
              className="flex items-center gap-1 px-2 py-1 bg-[#FAF7F1] hover:bg-[rgba(74,93,39,0.12)] text-[var(--brand-olive-hover)] border border-[var(--brand-olive)] rounded text-xs font-medium"
            >
              <Sparkles className="w-3 h-3" />
              Import {orphanCategories.length} from products
            </button>
          )}
        </div>
        <div className="p-4">
          <p className="text-xs text-[var(--ink-muted)] mb-3">
            Categories for grouping products (e.g. Bourbon, Gin, Syrup, Wine - RED)
          </p>
          <form onSubmit={handleAddCategory} className="flex gap-2 mb-3">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="e.g. Cordial"
              className="flex-1 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
            />
            <button
              type="submit"
              className="flex items-center gap-1 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </form>
          {categories.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)] italic">
              No categories yet — use the button above to import from existing
              products
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <div
                  key={cat}
                  className="flex items-center gap-1 bg-[var(--brand-cream)] rounded-full pl-3 pr-1 py-1 text-sm"
                >
                  <span>{cat}</span>
                  <button
                    onClick={async () => {
                      if (confirm(`Remove "${cat}" from the list?`)) {
                        await removeProductCategory(cat);
                      }
                    }}
                    className="p-1 text-[var(--ink-muted)] hover:text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {orphanCategories.length > 0 && (
            <div className="mt-3 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg p-3">
              <p className="text-xs text-[var(--brand-olive-hover)] font-medium mb-1">
                Found {orphanCategories.length} categories used by existing
                products but not in the managed list:
              </p>
              <p className="text-xs text-[var(--brand-olive-hover)]">
                {orphanCategories.slice(0, 10).join(", ")}
                {orphanCategories.length > 10 &&
                  ` and ${orphanCategories.length - 10} more...`}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
