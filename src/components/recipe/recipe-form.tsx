"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRecipe } from "@/lib/actions/recipes";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
}

interface Ingredient {
  id: string;
  name: string;
  type: string;
}

interface IngredientRow {
  ingredientId: string;
  amount: number;
  unit: string;
  isTopOff: boolean;
}

const UNITS = [
  { value: "OZ", label: "oz" },
  { value: "ML", label: "ml" },
  { value: "DASH", label: "dash" },
  { value: "BARSPOON", label: "barspoon" },
  { value: "EACH", label: "each" },
  { value: "SPLASH", label: "splash" },
  { value: "RINSE", label: "rinse" },
];

export function RecipeForm({
  categories,
  ingredients,
}: {
  categories: Category[];
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [portionCount, setPortionCount] = useState(15);
  const [dilutionPct, setDilutionPct] = useState(0);
  const [glassType, setGlassType] = useState("");
  const [iceType, setIceType] = useState("");
  const [garnish, setGarnish] = useState("");
  const [pourFromBatch, setPourFromBatch] = useState("");
  const [howTo, setHowTo] = useState("");
  const [storageType, setStorageType] = useState("NONE");
  const [noBatching, setNoBatching] = useState(false);
  const [costTargetPct, setCostTargetPct] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [rows, setRows] = useState<IngredientRow[]>([
    { ingredientId: "", amount: 0, unit: "OZ", isTopOff: false },
  ]);

  function addRow() {
    setRows([
      ...rows,
      { ingredientId: "", amount: 0, unit: "OZ", isTopOff: false },
    ]);
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: string, value: any) {
    const newRows = [...rows];
    (newRows[index] as any)[field] = value;
    setRows(newRows);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const validRows = rows.filter((r) => r.ingredientId && r.amount > 0);
    if (validRows.length === 0) {
      setError("Add at least one ingredient");
      setLoading(false);
      return;
    }

    const result = await createRecipe({
      name,
      categoryId,
      portionCount,
      dilutionPct,
      glassType: glassType || undefined,
      iceType: iceType || undefined,
      garnish: garnish || undefined,
      pourFromBatch: pourFromBatch || undefined,
      howTo: howTo || undefined,
      storageType,
      noBatching,
      costTargetPct: costTargetPct ? parseFloat(costTargetPct) : undefined,
      notes: notes || undefined,
      ingredients: validRows.map((row, i) => ({
        ingredientId: row.ingredientId,
        amount: row.amount,
        unit: row.unit,
        sortOrder: i,
        isTopOff: row.isTopOff,
      })),
    });

    if (result?.id) {
      router.push(`/dashboard/recipes/${result.id}`);
    } else {
      setError("Failed to create recipe");
      setLoading(false);
    }
  }

  return (
    <div>
      <Link
        href="/dashboard/recipes"
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Recipes
      </Link>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
          <h2 className="font-semibold">Basic Info</h2>

          <div>
            <label className="block text-sm text-[var(--brand-brown)] mb-1">
              Cocktail Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              placeholder="e.g. Pins & Needles"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--brand-brown)] mb-1">
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
              <label className="block text-sm text-[var(--brand-brown)] mb-1">
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

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="noBatching"
              checked={noBatching}
              onChange={(e) => setNoBatching(e.target.checked)}
              className="w-4 h-4 rounded bg-[var(--brand-cream)] border-[var(--line)] text-[var(--brand-olive)] focus:ring-[var(--brand-olive)]"
            />
            <label htmlFor="noBatching" className="text-sm text-[var(--brand-brown)]">
              No batching (single serve only)
            </label>
          </div>
        </div>

        {/* Ingredients */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
          <h2 className="font-semibold">Ingredients (Single Serving)</h2>

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
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-[var(--ink-muted)] whitespace-nowrap py-2">
                <input
                  type="checkbox"
                  checked={row.isTopOff}
                  onChange={(e) =>
                    updateRow(index, "isTopOff", e.target.checked)
                  }
                  className="w-3 h-3"
                />
                Top off
              </label>
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
            className="flex items-center gap-2 text-[var(--brand-olive)] hover:text-[var(--brand-olive)] text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Ingredient
          </button>
        </div>

        {/* Batch settings */}
        {!noBatching && (
          <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
            <h2 className="font-semibold">Batch Settings</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--brand-brown)] mb-1">
                  Default Portions
                </label>
                <input
                  type="number"
                  value={portionCount}
                  onChange={(e) => setPortionCount(parseInt(e.target.value) || 15)}
                  min={1}
                  className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--brand-brown)] mb-1">
                  Dilution %
                </label>
                <input
                  type="number"
                  value={dilutionPct}
                  onChange={(e) =>
                    setDilutionPct(parseFloat(e.target.value) || 0)
                  }
                  min={0}
                  step="0.1"
                  className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Build info */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
          <h2 className="font-semibold">Build Instructions</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--brand-brown)] mb-1">Glass</label>
              <input
                value={glassType}
                onChange={(e) => setGlassType(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                placeholder="e.g. Rock Glass"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--brand-brown)] mb-1">Ice</label>
              <input
                value={iceType}
                onChange={(e) => setIceType(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                placeholder="e.g. Big Clear Ice Cube"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-[var(--brand-brown)] mb-1">Garnish</label>
            <input
              value={garnish}
              onChange={(e) => setGarnish(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              placeholder="e.g. Buzz Button"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--brand-brown)] mb-1">
              Pour from Batch
            </label>
            <input
              value={pourFromBatch}
              onChange={(e) => setPourFromBatch(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              placeholder="e.g. 4oz"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--brand-brown)] mb-1">How to</label>
            <textarea
              value={howTo}
              onChange={(e) => setHowTo(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] resize-none"
              placeholder="Build instructions..."
            />
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
          <h2 className="font-semibold">Pricing</h2>
          <div>
            <label className="block text-sm text-[var(--brand-brown)] mb-1">
              Cost Target % (leave empty to use category default)
            </label>
            <input
              type="number"
              value={costTargetPct}
              onChange={(e) => setCostTargetPct(e.target.value)}
              step="0.1"
              min="0"
              max="100"
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              placeholder="e.g. 20"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4">
          <label className="block text-sm text-[var(--brand-brown)] mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] resize-none"
            placeholder="Any additional notes..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Recipe"}
        </button>
      </form>
    </div>
  );
}
