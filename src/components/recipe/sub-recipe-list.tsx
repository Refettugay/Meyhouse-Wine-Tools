"use client";

import Link from "next/link";
import { deleteSubRecipe } from "@/lib/actions/sub-recipes";
import {
  Beaker,
  Snowflake,
  Refrigerator,
  Trash2,
  Edit,
  Clock,
} from "lucide-react";
import { useState } from "react";

interface SubRecipeData {
  id: string;
  name: string;
  yieldAmount: number | null;
  yieldUnitCode: string | null;
  shelfLifeDays: number | null;
  storageType: string;
  category: { name: string };
  ingredients: {
    amount: number;
    unit: string;
    ingredient: {
      name: string;
      bottleCostCents: number | null;
      bottleSizeMl: number | null;
    };
  }[];
  producesIngredient: { id: string; name: string } | null;
}

export function SubRecipeList({
  subRecipes,
}: {
  subRecipes: SubRecipeData[];
}) {
  const [error, setError] = useState("");

  if (subRecipes.length === 0) {
    return (
      <div className="bg-white border border-[var(--line)] rounded-xl p-8 text-center">
        <Beaker className="w-10 h-10 text-[var(--ink-muted)] mx-auto mb-3" />
        <h3 className="text-lg font-semibold mb-1">No house-made items yet</h3>
        <p className="text-sm text-[var(--ink-muted)] mb-4">
          Create sub-recipes for syrups, infusions, and other items you make
          in-house. They&apos;ll be available as ingredients in your cocktail
          recipes with auto-calculated costs.
        </p>
        <Link
          href="/dashboard/recipes/sub-recipe/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors"
        >
          Create your first one
        </Link>
      </div>
    );
  }

  // Simple cost calculation
  function estimateBatchCost(
    ingredients: SubRecipeData["ingredients"]
  ): number {
    const OZ_TO_ML = 29.5735;
    let total = 0;
    for (const ri of ingredients) {
      const ing = ri.ingredient;
      if (!ing.bottleCostCents || !ing.bottleSizeMl) continue;
      const costPerMl = ing.bottleCostCents / ing.bottleSizeMl;
      let amountMl = 0;
      switch (ri.unit) {
        case "floz":
        case "OZ":
          amountMl = ri.amount * OZ_TO_ML;
          break;
        case "ml":
        case "ML":
          amountMl = ri.amount;
          break;
        case "cup":
          amountMl = ri.amount * 236.588;
          break;
        case "L":
          amountMl = ri.amount * 1000;
          break;
        default:
          amountMl = ri.amount * OZ_TO_ML;
      }
      total += costPerMl * amountMl;
    }
    return total / 100;
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subRecipes.map((recipe) => {
          const batchCost = estimateBatchCost(recipe.ingredients);
          const costPerUnit =
            recipe.yieldAmount && recipe.yieldAmount > 0
              ? batchCost / recipe.yieldAmount
              : 0;

          return (
            <div
              key={recipe.id}
              className="bg-white border border-[var(--line)] rounded-xl p-4 hover:border-[var(--brand-olive)] transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Beaker className="w-5 h-5 text-[var(--brand-olive)]" />
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

              <p className="text-xs text-[var(--ink-muted)] mb-2">
                {recipe.ingredients.length} ingredients
                {recipe.yieldAmount && (
                  <> · Makes {recipe.yieldAmount} {recipe.yieldUnitCode}</>
                )}
                {recipe.shelfLifeDays && (
                  <>
                    {" "}
                    · <Clock className="w-3 h-3 inline" />{" "}
                    {recipe.shelfLifeDays}d
                  </>
                )}
              </p>

              {/* Cost */}
              <div className="flex items-center justify-between text-sm mb-3">
                {batchCost > 0 ? (
                  <div className="text-xs">
                    <span className="text-[var(--ink-muted)]">
                      Batch: ${batchCost.toFixed(2)}
                    </span>
                    {costPerUnit > 0 && (
                      <span className="text-[var(--brand-olive)] font-medium ml-2">
                        ${costPerUnit.toFixed(3)}/{recipe.yieldUnitCode}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-[var(--ink-muted)]">
                    Add costs to ingredients to see pricing
                  </span>
                )}
              </div>

              {/* Ingredient preview */}
              <div className="text-xs text-[var(--ink-muted)] mb-3 space-y-0.5">
                {recipe.ingredients.slice(0, 4).map((ri, i) => (
                  <p key={i}>
                    {ri.amount} {ri.unit} {ri.ingredient.name}
                  </p>
                ))}
                {recipe.ingredients.length > 4 && (
                  <p className="text-[var(--ink-muted)]">
                    +{recipe.ingredients.length - 4} more
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
                <Link
                  href={`/dashboard/recipes/sub-recipe/${recipe.id}/edit`}
                  className="flex items-center gap-1 text-xs text-[var(--brand-olive)] hover:text-[var(--brand-olive-hover)]"
                >
                  <Edit className="w-3 h-3" />
                  Edit
                </Link>
                <button
                  onClick={async () => {
                    if (
                      confirm(
                        `Delete "${recipe.name}"? The linked ingredient will also be removed.`
                      )
                    ) {
                      const result = await deleteSubRecipe(recipe.id);
                      if (result?.error) setError(result.error);
                    }
                  }}
                  className="flex items-center gap-1 text-xs text-[var(--ink-muted)] hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
