"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSubRecipe, updateSubRecipe } from "@/lib/actions/sub-recipes";
import { ArrowLeft, Plus, Trash2, Beaker } from "lucide-react";

interface Category {
  id: string;
  name: string;
}

interface Ingredient {
  id: string;
  name: string;
  type: string;
  bottleCostCents: number | null;
  bottleSizeMl: number | null;
}

interface IngredientRow {
  ingredientId: string;
  amount: number;
  unit: string;
}

interface ExistingSubRecipe {
  id: string;
  name: string;
  categoryId: string;
  yieldAmount: number | null;
  yieldUnitCode: string | null;
  shelfLifeDays: number | null;
  storageType: string;
  prepInstructions: string | null;
  notes: string | null;
  ingredients: {
    amount: number;
    unit: string;
    ingredient: { id: string; name: string };
  }[];
}

const RECIPE_UNITS = [
  { value: "floz", label: "fl oz" },
  { value: "ml", label: "ml" },
  { value: "OZ", label: "oz" },
  { value: "cup", label: "cup" },
  { value: "L", label: "liter" },
  { value: "dash", label: "dash" },
  { value: "barspoon", label: "barspoon" },
  { value: "tsp", label: "tsp" },
  { value: "tbsp", label: "tbsp" },
  { value: "each", label: "each" },
  { value: "g", label: "gram" },
  { value: "oz_wt", label: "oz (weight)" },
  { value: "lb", label: "lb" },
];

const YIELD_UNITS = [
  { value: "floz", label: "fl oz" },
  { value: "ml", label: "ml" },
  { value: "cup", label: "cups" },
  { value: "L", label: "liters" },
  { value: "qt", label: "quarts" },
  { value: "gal", label: "gallons" },
  { value: "each", label: "servings" },
];

export function SubRecipeForm({
  categories,
  ingredients,
  existingRecipe,
}: {
  categories: Category[];
  ingredients: Ingredient[];
  existingRecipe?: ExistingSubRecipe;
}) {
  const router = useRouter();

  // Find House-Made category
  const houseMadeCat = categories.find((c) =>
    c.name.toLowerCase().includes("house-made")
  );

  const [name, setName] = useState(existingRecipe?.name || "");
  const [categoryId, setCategoryId] = useState(
    existingRecipe?.categoryId || houseMadeCat?.id || categories[0]?.id || ""
  );
  const [yieldAmount, setYieldAmount] = useState(
    existingRecipe?.yieldAmount?.toString() || ""
  );
  const [yieldUnitCode, setYieldUnitCode] = useState(
    existingRecipe?.yieldUnitCode || "floz"
  );
  const [shelfLifeDays, setShelfLifeDays] = useState(
    existingRecipe?.shelfLifeDays?.toString() || ""
  );
  const [storageType, setStorageType] = useState(
    existingRecipe?.storageType || "FRIDGE"
  );
  const [prepInstructions, setPrepInstructions] = useState(
    existingRecipe?.prepInstructions || ""
  );
  const [notes, setNotes] = useState(existingRecipe?.notes || "");

  const [rows, setRows] = useState<IngredientRow[]>(
    existingRecipe?.ingredients.map((ri) => ({
      ingredientId: ri.ingredient.id,
      amount: ri.amount,
      unit: ri.unit,
    })) || [{ ingredientId: "", amount: 0, unit: "floz" }]
  );

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function addRow() {
    setRows([...rows, { ingredientId: "", amount: 0, unit: "floz" }]);
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: string, value: any) {
    const newRows = [...rows];
    (newRows[index] as any)[field] = value;
    setRows(newRows);
  }

  // Live cost calculation
  function estimateCost(): {
    total: number;
    perUnit: number;
    items: { name: string; cost: number }[];
  } {
    const OZ_TO_ML = 29.5735;
    const items: { name: string; cost: number }[] = [];
    let total = 0;

    for (const row of rows) {
      const ing = ingredients.find((i) => i.id === row.ingredientId);
      if (!ing || !ing.bottleCostCents || !ing.bottleSizeMl || !row.amount)
        continue;

      const costPerMl = ing.bottleCostCents / ing.bottleSizeMl;
      let amountMl = 0;

      switch (row.unit) {
        case "floz":
        case "OZ":
          amountMl = row.amount * OZ_TO_ML;
          break;
        case "ml":
        case "ML":
          amountMl = row.amount;
          break;
        case "cup":
          amountMl = row.amount * 236.588;
          break;
        case "L":
          amountMl = row.amount * 1000;
          break;
        case "tsp":
          amountMl = row.amount * 4.929;
          break;
        case "tbsp":
          amountMl = row.amount * 14.787;
          break;
        default:
          amountMl = row.amount * OZ_TO_ML;
      }

      const cost = (costPerMl * amountMl) / 100;
      items.push({ name: ing.name, cost });
      total += cost;
    }

    const yield_ = parseFloat(yieldAmount) || 1;
    return { total, perUnit: total / yield_, items };
  }

  const costEstimate = estimateCost();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const validRows = rows.filter((r) => r.ingredientId && r.amount > 0);
    if (validRows.length === 0) {
      setError("Add at least one ingredient");
      setLoading(false);
      return;
    }

    const data = {
      name,
      categoryId,
      ingredients: validRows.map((row, i) => ({
        ingredientId: row.ingredientId,
        amount: row.amount,
        unit: row.unit,
        sortOrder: i,
      })),
      yieldAmount: parseFloat(yieldAmount) || 0,
      yieldUnitCode,
      shelfLifeDays: shelfLifeDays ? parseInt(shelfLifeDays) : undefined,
      storageType,
      prepInstructions: prepInstructions || undefined,
      notes: notes || undefined,
    };

    const result = existingRecipe
      ? await updateSubRecipe(existingRecipe.id, data)
      : await createSubRecipe(data);

    if ((result as any)?.error) {
      setError((result as any).error);
      setLoading(false);
    } else {
      router.push("/dashboard/recipes");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Recipes
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Beaker className="w-5 h-5 text-[var(--brand-olive)]" />
            <h2 className="font-semibold">What are you making?</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
              Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Sage Tea Syrup"
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                Storage
              </label>
              <select
                value={storageType}
                onChange={(e) => setStorageType(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              >
                <option value="NONE">Room Temp</option>
                <option value="FRIDGE">Fridge</option>
                <option value="FREEZER">Freezer</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ingredients */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
          <h2 className="font-semibold">Ingredients</h2>
          <p className="text-xs text-[var(--ink-muted)]">
            What goes into this? Select from your product list.
          </p>

          {rows.map((row, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1">
                <select
                  value={row.ingredientId}
                  onChange={(e) =>
                    updateRow(index, "ingredientId", e.target.value)
                  }
                  className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                >
                  <option value="">Select ingredient...</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.amount || ""}
                onChange={(e) =>
                  updateRow(index, "amount", parseFloat(e.target.value) || 0)
                }
                className="w-20 px-2 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                placeholder="Amt"
              />
              <select
                value={row.unit}
                onChange={(e) => updateRow(index, "unit", e.target.value)}
                className="w-24 px-2 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              >
                {RECIPE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="p-2 text-[var(--ink-muted)] hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-2 text-[var(--brand-olive)] hover:text-[var(--brand-olive-hover)] text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Ingredient
          </button>
        </div>

        {/* Yield */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
          <h2 className="font-semibold">Yield & Shelf Life</h2>
          <p className="text-xs text-[var(--ink-muted)]">
            How much does this recipe make? The system uses this to calculate
            cost per unit when used in cocktails.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--ink-muted)] mb-1">
                Makes *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={yieldAmount}
                onChange={(e) => setYieldAmount(e.target.value)}
                placeholder="e.g. 12"
                className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-muted)] mb-1">
                Unit
              </label>
              <select
                value={yieldUnitCode}
                onChange={(e) => setYieldUnitCode(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              >
                {YIELD_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-muted)] mb-1">
                Shelf Life (days)
              </label>
              <input
                type="number"
                min="0"
                value={shelfLifeDays}
                onChange={(e) => setShelfLifeDays(e.target.value)}
                placeholder="e.g. 7"
                className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              />
            </div>
          </div>

          {/* Live cost estimate */}
          {costEstimate.total > 0 && (
            <div className="bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg p-3 space-y-2">
              <p className="font-medium text-[var(--brand-olive-hover)] text-sm">
                💰 Estimated Cost
              </p>
              <div className="space-y-1 text-xs text-[var(--brand-olive-hover)]">
                {costEstimate.items.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{item.name}</span>
                    <span>${item.cost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--brand-olive)] pt-2 flex justify-between text-sm font-semibold text-[var(--brand-olive-hover)]">
                <span>Total batch cost</span>
                <span>${costEstimate.total.toFixed(2)}</span>
              </div>
              {parseFloat(yieldAmount) > 0 && (
                <div className="flex justify-between text-sm text-[var(--brand-olive-hover)]">
                  <span>
                    Cost per{" "}
                    {YIELD_UNITS.find((u) => u.value === yieldUnitCode)?.label ||
                      yieldUnitCode}
                  </span>
                  <span className="font-bold">
                    ${costEstimate.perUnit.toFixed(3)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Prep instructions */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">How to make it</h2>
          <textarea
            value={prepInstructions}
            onChange={(e) => setPrepInstructions(e.target.value)}
            rows={4}
            placeholder="Step-by-step instructions for making this..."
            className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] resize-y text-sm"
          />
        </div>

        {/* Notes */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4">
          <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any additional notes..."
            className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] resize-none text-sm"
          />
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-4 text-sm">
          <p className="font-medium mb-1">How this works</p>
          <p className="text-xs">
            When you save, &ldquo;{name || "this item"}&rdquo; will
            automatically appear as an ingredient you can select in cocktail
            recipes. Its cost will be calculated from this recipe&apos;s
            ingredients — no vendor price needed.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : existingRecipe
            ? "Save Changes"
            : "Create House-Made Ingredient"}
        </button>
      </form>
    </div>
  );
}
