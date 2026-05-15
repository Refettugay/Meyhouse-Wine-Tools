"use client";

import { useState } from "react";
import { calculateBatch } from "@/lib/calculations/batch";
import {
  calculateIngredientCost,
  calculateRecipeCost,
  suggestMenuPrice,
  formatCents,
} from "@/lib/calculations/cost";
import { formatUnit, ozToMl } from "@/lib/calculations/units";
import {
  Wine,
  Snowflake,
  Refrigerator,
  Calculator,
  DollarSign,
  Minus,
  Plus,
} from "lucide-react";

interface RecipeIngredientWithDetails {
  id: string;
  amount: number;
  unit: string;
  isTopOff: boolean;
  notes: string | null;
  ingredient: {
    id: string;
    name: string;
    type: string;
    bottleCostCents: number | null;
    bottleSizeMl: number | null;
    purchaseCostCents: number | null;
    purchaseQty: number | null;
  };
}

interface RecipeProps {
  recipe: {
    id: string;
    name: string;
    portionCount: number;
    dilutionPct: number;
    glassType: string | null;
    iceType: string | null;
    garnish: string | null;
    pourFromBatch: string | null;
    howTo: string | null;
    storageType: string;
    noBatching: boolean;
    costTargetPct: number | null;
    menuPrice: number | null;
    notes: string | null;
    category: { name: string; defaultCostTargetPct: number | null };
    ingredients: RecipeIngredientWithDetails[];
  };
}

export function RecipeDetail({ recipe }: RecipeProps) {
  const [portions, setPortions] = useState(recipe.portionCount);
  const [dilution, setDilution] = useState(recipe.dilutionPct);
  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");

  const batchResult = calculateBatch(
    recipe.ingredients.map((ri) => ({
      name: ri.ingredient.name,
      amount: ri.amount,
      unit: ri.unit,
      isTopOff: ri.isTopOff,
    })),
    portions,
    dilution
  );

  const singleCost = calculateRecipeCost(
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

  const batchCost = singleCost * portions;
  const costTargetPct =
    recipe.costTargetPct || recipe.category.defaultCostTargetPct || 20;
  const suggested = suggestMenuPrice(singleCost, costTargetPct);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Wine className="w-6 h-6 text-amber-500" />
          <h1 className="text-2xl font-bold">{recipe.name}</h1>
          {recipe.storageType === "FREEZER" && (
            <span className="flex items-center gap-1 text-xs bg-blue-500/10 text-blue-600 px-2 py-1 rounded">
              <Snowflake className="w-3 h-3" /> Freezer
            </span>
          )}
          {recipe.storageType === "FRIDGE" && (
            <span className="flex items-center gap-1 text-xs bg-cyan-500/10 text-cyan-600 px-2 py-1 rounded">
              <Refrigerator className="w-3 h-3" /> Fridge
            </span>
          )}
          {recipe.noBatching && (
            <span className="text-xs bg-red-500/10 text-red-600 px-2 py-1 rounded">
              No Batching
            </span>
          )}
        </div>
        <p className="text-sm text-stone-500">{recipe.category.name}</p>
      </div>

      {/* Tab toggle */}
      <div className="flex bg-white rounded-lg p-1 mb-6">
        <button
          onClick={() => setActiveTab("single")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "single"
              ? "bg-amber-600 text-white"
              : "text-stone-500 hover:text-stone-900"
          }`}
        >
          Single Serving
        </button>
        {!recipe.noBatching && (
          <button
            onClick={() => setActiveTab("batch")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "batch"
                ? "bg-amber-600 text-white"
                : "text-stone-500 hover:text-stone-900"
            }`}
          >
            Batch Calculator
          </button>
        )}
      </div>

      {/* Single serving */}
      {activeTab === "single" && (
        <div className="space-y-4">
          {/* Ingredients table */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-200">
              <h2 className="font-semibold">Ingredients</h2>
            </div>
            <div className="divide-y divide-stone-200">
              {recipe.ingredients.map((ri) => {
                const cost = calculateIngredientCost({
                  type: ri.ingredient.type,
                  amount: ri.amount,
                  unit: ri.unit,
                  bottleCostCents: ri.ingredient.bottleCostCents,
                  bottleSizeMl: ri.ingredient.bottleSizeMl,
                  purchaseCostCents: ri.ingredient.purchaseCostCents,
                  purchaseQty: ri.ingredient.purchaseQty,
                });
                return (
                  <div
                    key={ri.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex-1">
                      <span className="text-stone-900">{ri.ingredient.name}</span>
                      {ri.isTopOff && (
                        <span className="text-xs text-stone-400 ml-2">
                          (top off)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-stone-700">
                        {ri.isTopOff
                          ? "top off"
                          : `${ri.amount} ${formatUnit(ri.unit)}`}
                      </span>
                      {cost > 0 && (
                        <span className="text-stone-400 w-16 text-right">
                          {formatCents(cost)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {singleCost > 0 && (
              <div className="px-4 py-3 border-t border-stone-300 bg-stone-100/50">
                <div className="flex justify-between font-medium">
                  <span>Total Cost</span>
                  <span className="text-amber-600">{formatCents(singleCost)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Cost & pricing */}
          {singleCost > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5 text-amber-500" />
                <h2 className="font-semibold">Pricing</h2>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-stone-500">Ingredient Cost</p>
                  <p className="text-lg font-bold text-stone-900">
                    {formatCents(singleCost)}
                  </p>
                </div>
                <div>
                  <p className="text-stone-500">
                    Suggested Price ({costTargetPct}% cost)
                  </p>
                  <p className="text-lg font-bold text-green-600">
                    {formatCents(suggested)}
                  </p>
                </div>
                {recipe.menuPrice && (
                  <div>
                    <p className="text-stone-500">Menu Price</p>
                    <p className="text-lg font-bold text-stone-900">
                      {formatCents(Math.round(recipe.menuPrice * 100))}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-stone-500">Actual Cost %</p>
                  <p className="text-lg font-bold text-stone-900">
                    {recipe.menuPrice
                      ? (
                          (singleCost / (recipe.menuPrice * 100)) *
                          100
                        ).toFixed(1)
                      : suggested > 0
                      ? ((singleCost / suggested) * 100).toFixed(1)
                      : "—"}
                    %
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Build info */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h2 className="font-semibold mb-3">Build</h2>
            <div className="space-y-2 text-sm">
              {recipe.glassType && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Glass</span>
                  <span>{recipe.glassType}</span>
                </div>
              )}
              {recipe.iceType && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Ice</span>
                  <span>{recipe.iceType}</span>
                </div>
              )}
              {recipe.garnish && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Garnish</span>
                  <span>{recipe.garnish}</span>
                </div>
              )}
              {recipe.howTo && (
                <div className="pt-2 border-t border-stone-200">
                  <p className="text-stone-500 mb-1">How to</p>
                  <p className="text-stone-900">{recipe.howTo}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch calculator */}
      {activeTab === "batch" && !recipe.noBatching && (
        <div className="space-y-4">
          {/* Portion control */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-amber-500" />
              <h2 className="font-semibold">Batch Settings</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-stone-500 mb-2">
                  Number of Servings
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPortions(Math.max(1, portions - 1))}
                    className="w-10 h-10 flex items-center justify-center bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={portions}
                    onChange={(e) =>
                      setPortions(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    className="w-20 text-center text-xl font-bold bg-stone-100 border border-stone-300 rounded-lg py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    onClick={() => setPortions(portions + 1)}
                    className="w-10 h-10 flex items-center justify-center bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-stone-500 mb-2">
                  Dilution %
                </label>
                <input
                  type="number"
                  value={dilution}
                  onChange={(e) =>
                    setDilution(Math.max(0, parseFloat(e.target.value) || 0))
                  }
                  className="w-24 text-center text-xl font-bold bg-stone-100 border border-stone-300 rounded-lg py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Batch ingredients */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-200">
              <h2 className="font-semibold">
                Batch Recipe ({portions} servings)
              </h2>
            </div>
            <div className="divide-y divide-stone-200">
              {batchResult.ingredients.map((ing, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span className="flex-1 text-stone-900">
                    {ing.name}
                    {ing.isTopOff && (
                      <span className="text-xs text-stone-400 ml-2">
                        (per serving)
                      </span>
                    )}
                  </span>
                  <div className="text-right">
                    <span className="text-amber-600 font-medium">
                      {ing.isTopOff
                        ? "top off"
                        : `${ing.batchAmount.toFixed(2)} ${formatUnit(
                            ing.unit
                          )}`}
                    </span>
                    {!ing.isTopOff && ing.unit === "OZ" && (
                      <span className="block text-xs text-stone-400">
                        {ozToMl(ing.batchAmount)} ml
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-stone-300 bg-stone-100/50 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Total</span>
                <span>{batchResult.totalOz} oz ({ozToMl(batchResult.totalOz)} ml)</span>
              </div>
              {batchResult.dilutionOz > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">
                    Dilution ({dilution}%)
                  </span>
                  <span>
                    +{batchResult.dilutionOz} oz ({ozToMl(batchResult.dilutionOz)} ml)
                  </span>
                </div>
              )}
              <div className="flex justify-between font-medium pt-1 border-t border-stone-300">
                <span>Final Volume</span>
                <span className="text-amber-600">
                  {batchResult.finalVolumeOz} oz ({ozToMl(batchResult.finalVolumeOz)} ml)
                </span>
              </div>
            </div>
          </div>

          {/* Batch cost */}
          {batchCost > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-stone-500">Cost per Serving</p>
                  <p className="text-lg font-bold">{formatCents(singleCost)}</p>
                </div>
                <div>
                  <p className="text-stone-500">
                    Total Batch Cost ({portions} servings)
                  </p>
                  <p className="text-lg font-bold text-amber-600">
                    {formatCents(batchCost)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Build info for batch */}
          {recipe.pourFromBatch && (
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <h2 className="font-semibold mb-3">Serving from Batch</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-stone-500">Pour from Batch</span>
                  <span>{recipe.pourFromBatch}</span>
                </div>
                {recipe.glassType && (
                  <div className="flex justify-between">
                    <span className="text-stone-500">Glass</span>
                    <span>{recipe.glassType}</span>
                  </div>
                )}
                {recipe.iceType && (
                  <div className="flex justify-between">
                    <span className="text-stone-500">Ice</span>
                    <span>{recipe.iceType}</span>
                  </div>
                )}
                {recipe.garnish && (
                  <div className="flex justify-between">
                    <span className="text-stone-500">Garnish</span>
                    <span>{recipe.garnish}</span>
                  </div>
                )}
                {recipe.howTo && (
                  <div className="pt-2 border-t border-stone-200">
                    <p className="text-stone-500 mb-1">How to</p>
                    <p className="text-stone-900">{recipe.howTo}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {recipe.notes && (
        <div className="mt-4 bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="font-semibold mb-2">Notes</h2>
          <p className="text-sm text-stone-700">{recipe.notes}</p>
        </div>
      )}
    </div>
  );
}
