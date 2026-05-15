"use client";

import { useState } from "react";
import {
  calculateRecipeCost,
  suggestMenuPrice,
  formatCents,
} from "@/lib/calculations/cost";

interface RecipeWithDetails {
  id: string;
  name: string;
  costTargetPct: number | null;
  menuPrice: number | null;
  category: { id: string; name: string; defaultCostTargetPct: number | null };
  ingredients: {
    amount: number;
    unit: string;
    ingredient: {
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
  defaultCostTargetPct: number | null;
}

export function PricingDashboard({
  recipes,
  categories,
}: {
  recipes: RecipeWithDetails[];
  categories: Category[];
}) {
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  const filtered =
    selectedCategory === "ALL"
      ? recipes
      : recipes.filter((r) => r.category.id === selectedCategory);

  const recipesWithCosts = filtered.map((recipe) => {
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
    const targetPct =
      recipe.costTargetPct ||
      recipe.category.defaultCostTargetPct ||
      20;
    const suggested = suggestMenuPrice(cost, targetPct);

    return { ...recipe, cost, targetPct, suggested };
  });

  const totalCost = recipesWithCosts.reduce((sum, r) => sum + r.cost, 0);
  const avgCost = recipesWithCosts.length > 0 ? totalCost / recipesWithCosts.length : 0;
  const pricedCount = recipesWithCosts.filter((r) => r.cost > 0).length;

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-sm text-stone-500">Total Recipes</p>
          <p className="text-2xl font-bold">{filtered.length}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-sm text-stone-500">With Cost Data</p>
          <p className="text-2xl font-bold">{pricedCount}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-sm text-stone-500">Avg Cost / Drink</p>
          <p className="text-2xl font-bold text-amber-600">
            {avgCost > 0 ? formatCents(Math.round(avgCost)) : "—"}
          </p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-sm text-stone-500">Categories</p>
          <p className="text-2xl font-bold">{categories.length}</p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
        <button
          onClick={() => setSelectedCategory("ALL")}
          className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
            selectedCategory === "ALL"
              ? "bg-amber-600 text-white"
              : "bg-stone-100 text-stone-500"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              selectedCategory === cat.id
                ? "bg-amber-600 text-white"
                : "bg-stone-100 text-stone-500"
            }`}
          >
            {cat.name} ({cat.defaultCostTargetPct || 20}%)
          </button>
        ))}
      </div>

      {/* Pricing table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="text-left px-4 py-3 text-stone-500 font-medium">
                  Cocktail
                </th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium">
                  Cost
                </th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium">
                  Target %
                </th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium">
                  Suggested
                </th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium">
                  Menu Price
                </th>
                <th className="text-right px-4 py-3 text-stone-500 font-medium">
                  Actual %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {recipesWithCosts.map((recipe) => {
                const actualPct = recipe.menuPrice
                  ? ((recipe.cost / (recipe.menuPrice * 100)) * 100).toFixed(1)
                  : recipe.suggested > 0
                  ? ((recipe.cost / recipe.suggested) * 100).toFixed(1)
                  : "—";

                return (
                  <tr key={recipe.id} className="hover:bg-stone-100/50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{recipe.name}</p>
                      <p className="text-xs text-stone-400">
                        {recipe.category.name}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {recipe.cost > 0 ? (
                        <span className="text-amber-600">
                          {formatCents(recipe.cost)}
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-700">
                      {recipe.targetPct}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {recipe.suggested > 0 ? (
                        <span className="text-green-600">
                          {formatCents(recipe.suggested)}
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {recipe.menuPrice ? (
                        <span>{formatCents(Math.round(recipe.menuPrice * 100))}</span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={
                        actualPct !== "—" && parseFloat(actualPct) > (recipe.targetPct + 5)
                          ? "text-red-600"
                          : "text-stone-700"
                      }>
                        {actualPct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
