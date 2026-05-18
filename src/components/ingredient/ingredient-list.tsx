"use client";

import { useState } from "react";
import { deleteIngredient } from "@/lib/actions/ingredients";
import { Trash2, Edit, Search } from "lucide-react";
import Link from "next/link";

interface Ingredient {
  id: string;
  name: string;
  type: string;
  bottleCostCents: number | null;
  bottleSizeMl: number | null;
  vendor: string | null;
  ingredientCategory: string | null;
}

export function IngredientList({ ingredients }: { ingredients: Ingredient[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");

  const filtered = ingredients.filter((ing) => {
    const matchesSearch = ing.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "ALL" || ing.type === filter;
    return matchesSearch && matchesFilter;
  });

  const categories = [...new Set(ingredients.map((i) => i.ingredientCategory).filter(Boolean))];

  return (
    <div>
      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
          <input
            type="text"
            placeholder="Search ingredients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
        >
          <option value="ALL">All Types</option>
          <option value="LIQUID">Liquids</option>
          <option value="SOLID">Solids</option>
          <option value="GARNISH">Garnishes</option>
        </select>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--ink-muted)]">
            {ingredients.length === 0
              ? "No ingredients yet. Add your first one!"
              : "No ingredients match your search."}
          </div>
        ) : (
          filtered.map((ing) => (
            <div
              key={ing.id}
              className="bg-white border border-[var(--line)] rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{ing.name}</p>
                <div className="flex items-center gap-2 mt-1 text-sm text-[var(--ink-muted)]">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[var(--brand-cream)]">
                    {ing.type.toLowerCase()}
                  </span>
                  {ing.bottleCostCents && (
                    <span>
                      ${(ing.bottleCostCents / 100).toFixed(2)}
                      {ing.bottleSizeMl && ` / ${ing.bottleSizeMl}ml`}
                    </span>
                  )}
                  {ing.vendor && <span>- {ing.vendor}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <Link
                  href={`/dashboard/ingredients/${ing.id}/edit`}
                  className="p-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </Link>
                <button
                  onClick={async () => {
                    if (confirm("Remove this ingredient?")) {
                      await deleteIngredient(ing.id);
                    }
                  }}
                  className="p-2 text-[var(--ink-muted)] hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
