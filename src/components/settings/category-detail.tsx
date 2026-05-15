"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSubCategory } from "@/lib/actions/settings";
import {
  type ParentCategory,
  type SubCategory,
  type PourSize,
  type ServingStyle,
  SERVING_STYLES,
} from "@/lib/category-types";
import { Plus, X, Save, Package } from "lucide-react";

export function CategoryDetail({
  sub,
  parent,
  parents,
  productCount,
}: {
  sub: SubCategory;
  parent: ParentCategory | null;
  parents: ParentCategory[];
  productCount: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(sub.name);
  const [parentName, setParentName] = useState(sub.parent);
  const [servingStyle, setServingStyle] = useState<ServingStyle>(sub.servingStyle);
  const [pourSizes, setPourSizes] = useState<PourSize[]>(sub.pourSizes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [newLabel, setNewLabel] = useState("");
  const [newOz, setNewOz] = useState("");
  const [isFullContainer, setIsFullContainer] = useState(false);

  const currentParent = parents.find((p) => p.name === parentName);

  function handleParentChange(newParent: string) {
    setParentName(newParent);
    const p = parents.find((pp) => pp.name === newParent);
    if (p) {
      setServingStyle(p.defaultServingStyle);
      setPourSizes(p.defaultPourSizes.length > 0 ? [...p.defaultPourSizes] : []);
    }
  }

  function handleServingStyleChange(newStyle: ServingStyle) {
    setServingStyle(newStyle);
    if (newStyle === "BTB" || newStyle === "NONE") {
      setPourSizes([]);
    } else if (pourSizes.length === 0 && currentParent) {
      setPourSizes([...currentParent.defaultPourSizes]);
    }
  }

  function addPourSize() {
    if (!newLabel.trim()) return;
    const amt = isFullContainer ? 0 : parseFloat(newOz);
    if (!isFullContainer && (isNaN(amt) || amt <= 0)) return;
    setPourSizes([...pourSizes, { label: newLabel.trim(), amount: isFullContainer ? 0 : amt, unit: isFullContainer ? "each" : "oz" }]);
    setNewLabel(""); setNewOz(""); setIsFullContainer(false);
  }

  function removePourSize(index: number) {
    setPourSizes(pourSizes.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(""); setSuccess(""); setSaving(true);
    try {
      const result = await updateSubCategory(sub.name, {
        name: name.trim(),
        parent: parentName,
        servingStyle,
        pourSizes,
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(`Saved!${result.count ? ` (${result.count} products updated)` : ""}`);
        if (name.trim() !== sub.name) {
          router.replace(`/dashboard/settings/categories/${encodeURIComponent(name.trim())}`);
        }
        router.refresh();
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const showPourEditor = servingStyle !== "BTB" && servingStyle !== "NONE";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">{currentParent?.icon || "📦"}</span>
          <div>
            <p className="text-xs text-stone-400 uppercase tracking-wide">{parentName}</p>
            <h1 className="text-2xl font-bold">{sub.name}</h1>
          </div>
        </div>
        <p className="text-stone-500 text-sm flex items-center gap-2 mt-1">
          <Package className="w-4 h-4" />
          {productCount} {productCount === 1 ? "product" : "products"} using this category
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

      {/* Parent + Name */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="text-sm font-medium text-stone-700 mb-1 block">Parent Category</label>
          <select
            value={parentName}
            onChange={(e) => handleParentChange(e.target.value)}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {parents.map((p) => (
              <option key={p.name} value={p.name}>{p.icon} {p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-stone-700 mb-1 block">Sub-Category Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {name.trim() !== sub.name && productCount > 0 && (
            <p className="text-xs text-amber-600 mt-1">Renaming will update {productCount} product(s)</p>
          )}
        </div>

        {/* Serving Style */}
        <div>
          <label className="text-sm font-medium text-stone-700 mb-2 block">Serving Style</label>
          <div className="flex gap-2 flex-wrap">
            {SERVING_STYLES.map((style) => (
              <button
                key={style.value}
                onClick={() => handleServingStyleChange(style.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  servingStyle === style.value
                    ? style.value === "BTG" ? "bg-purple-600 text-white" :
                      style.value === "BTB" ? "bg-blue-600 text-white" :
                      style.value === "STANDARD" ? "bg-amber-600 text-white" :
                      "bg-stone-600 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {style.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-stone-400 mt-2">
            {SERVING_STYLES.find((s) => s.value === servingStyle)?.description}
          </p>
        </div>
      </div>

      {/* Pour Sizes */}
      {showPourEditor && (
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-3">Pour Sizes</h2>

          {pourSizes.length === 0 ? (
            <p className="text-sm text-stone-400 mb-3">No pour sizes configured. Add at least one.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {pourSizes.map((ps, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-stone-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-stone-700">{ps.label}</span>
                    <span className="text-xs text-stone-500">
                      {ps.amount === 0 ? "(full container)" : `${ps.amount}${ps.unit || "oz"}`}
                    </span>
                  </div>
                  <button onClick={() => removePourSize(i)} className="p-1 text-stone-400 hover:text-red-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-stone-500 mb-1 block">Pour Name</label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Standard, 5oz Glass, 14oz Draft"
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPourSize(); } }}
              />
            </div>
            {!isFullContainer && (
              <div className="w-24">
                <label className="text-xs text-stone-500 mb-1 block">Ounces</label>
                <input
                  type="number" step="0.01" value={newOz}
                  onChange={(e) => setNewOz(e.target.value)} placeholder="oz"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPourSize(); } }}
                />
              </div>
            )}
            <label className="flex items-center gap-2 px-3 py-2 text-xs text-stone-600 cursor-pointer">
              <input type="checkbox" checked={isFullContainer} onChange={(e) => setIsFullContainer(e.target.checked)}
                className="rounded border-stone-300 text-amber-600 focus:ring-amber-500" />
              Full container
            </label>
            <button onClick={addPourSize}
              className="flex items-center gap-1 px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>
      )}

      {servingStyle === "BTB" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <strong>By the Bottle</strong> — Products in this category are sold as whole bottles.
          The pricing tool will calculate suggested price from the bottle cost directly.
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-300 text-white rounded-lg text-sm font-medium transition-colors">
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
        </button>
        <button onClick={() => router.push("/dashboard/settings/categories")}
          className="px-4 py-2.5 text-stone-500 hover:text-stone-900 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
