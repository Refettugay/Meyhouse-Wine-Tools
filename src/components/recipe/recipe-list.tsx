"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Wine, Snowflake, Refrigerator } from "lucide-react";
import { calculateRecipeCost, formatCents } from "@/lib/calculations/cost";

interface RecipeWithDetails {
  id: string;
  name: string;
  glassType: string | null;
  garnish: string | null;
  storageType: string;
  noBatching: boolean;
  portionCount: number;
  category: { id: string; name: string };
  ingredients: {
    amount: number;
    unit: string;
    isTopOff: boolean;
    ingredient: {
      name: string;
      type: string;
      bottleCostCents: number | null;
      bottleSizeMl: number | null;
      purchaseCostCents: number | null;
      purchaseQty: number | null;
    };
  }[];
}

interface Category {
  id: string;
  name: string;
}

export function RecipeList({
  recipes,
  categories,
}: {
  recipes: RecipeWithDetails[];
  categories: Category[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize from URL params so "back" restores the state
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [categoryFilter, setCategoryFilter] = useState(
    searchParams.get("category") || "ALL"
  );

  // Update URL when filters change (replaces history entry so back works properly)
  const updateUrl = useCallback(
    (newCategory: string, newSearch: string) => {
      const params = new URLSearchParams();
      if (newCategory !== "ALL") params.set("category", newCategory);
      if (newSearch) params.set("search", newSearch);
      const qs = params.toString();
      router.replace(`/dashboard/recipes${qs ? `?${qs}` : ""}`, {
        scroll: false,
      });
    },
    [router]
  );

  function handleCategoryChange(cat: string) {
    setCategoryFilter(cat);
    updateUrl(cat, search);
  }

  function handleSearchChange(val: string) {
    setSearch(val);
    updateUrl(categoryFilter, val);
  }

  const filtered = recipes.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat =
      categoryFilter === "ALL" || r.category.id === categoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div>
      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input
            type="text"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Category tabs for mobile */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
        <button
          onClick={() => handleCategoryChange("ALL")}
          className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
            categoryFilter === "ALL"
              ? "bg-amber-600 text-white"
              : "bg-stone-100 text-stone-500 hover:text-stone-900"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryChange(cat.id)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              categoryFilter === cat.id
                ? "bg-amber-600 text-white"
                : "bg-stone-100 text-stone-500 hover:text-stone-900"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Recipe grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-stone-500">
          {recipes.length === 0
            ? "No recipes yet. Add your first cocktail!"
            : "No recipes match your search."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((recipe) => {
            const cost = calculateRecipeCost(
              recipe.ingredients.map((ri) => ({
                type: ri.ingredient.type,
                amount: ri.amount,
                unit: ri.unit,
                bottleCostCents: ri.ingredient.bottleCostCents,
                bottleSizeMl: ri.ingredient.bottleSizeMl,
                purchaseCostCents: ri.ingredient.purchaseCostCents,
                purchaseQty: ri.ingredient.purchaseQty,
              }))
            );

            return (
              <Link
                key={recipe.id}
                href={`/dashboard/recipes/${recipe.id}`}
                className="bg-white border border-stone-200 rounded-xl p-4 hover:border-amber-500/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wine className="w-5 h-5 text-amber-500" />
                    <h3 className="font-semibold">{recipe.name}</h3>
                  </div>
                  <div className="flex gap-1">
                    {recipe.storageType === "FREEZER" && (
                      <Snowflake className="w-4 h-4 text-blue-600" />
                    )}
                    {recipe.storageType === "FRIDGE" && (
                      <Refrigerator className="w-4 h-4 text-cyan-600" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-stone-500 mb-2">
                  {recipe.category.name}
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-500">
                    {recipe.ingredients.length} ingredients
                  </span>
                  {cost > 0 && (
                    <span className="text-amber-600 font-medium">
                      {formatCents(cost)}
                    </span>
                  )}
                </div>
                {recipe.glassType && (
                  <p className="text-xs text-stone-400 mt-2">
                    {recipe.glassType}
                    {recipe.garnish && ` - ${recipe.garnish}`}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
