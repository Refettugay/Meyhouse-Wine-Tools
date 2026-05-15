"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addSubCategory, addParentCategory } from "@/lib/actions/settings";
import {
  type ParentCategory,
  type PourSize,
  type ServingStyle,
  SERVING_STYLES,
  DEFAULT_PARENTS,
} from "@/lib/category-types";
import { Plus, X, Save } from "lucide-react";

export function AddCategoryForm({
  parents,
  defaultParent,
  defaultType,
}: {
  parents: ParentCategory[];
  defaultParent: string;
  defaultType: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"sub" | "parent">(defaultType === "parent" ? "parent" : "sub");

  // Sub-category fields
  const [subName, setSubName] = useState("");
  const [subParent, setSubParent] = useState(defaultParent || (parents[0]?.name || ""));
  const [subServingStyle, setSubServingStyle] = useState<ServingStyle>(() => {
    const p = parents.find((pp) => pp.name === (defaultParent || parents[0]?.name));
    return p?.defaultServingStyle || "STANDARD";
  });
  const [subPourSizes, setSubPourSizes] = useState<PourSize[]>(() => {
    const p = parents.find((pp) => pp.name === (defaultParent || parents[0]?.name));
    return p?.defaultPourSizes || [];
  });

  // Parent category fields
  const [parentName, setParentName] = useState("");
  const [parentIcon, setParentIcon] = useState("📦");
  const [parentServingStyle, setParentServingStyle] = useState<ServingStyle>("STANDARD");
  const [parentPourSizes, setParentPourSizes] = useState<PourSize[]>([{ label: "Standard", amount: 1.5, unit: "oz" }]);

  // Pour size input
  const [newLabel, setNewLabel] = useState("");
  const [newOz, setNewOz] = useState("");
  const [isFullContainer, setIsFullContainer] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentPourSizes = mode === "sub" ? subPourSizes : parentPourSizes;
  const setCurrentPourSizes = mode === "sub" ? setSubPourSizes : setParentPourSizes;
  const currentServingStyle = mode === "sub" ? subServingStyle : parentServingStyle;
  const showPourEditor = currentServingStyle !== "BTB" && currentServingStyle !== "NONE";

  function handleSubParentChange(newParent: string) {
    setSubParent(newParent);
    const p = parents.find((pp) => pp.name === newParent);
    if (p) {
      setSubServingStyle(p.defaultServingStyle);
      setSubPourSizes([...p.defaultPourSizes]);
    }
  }

  function addPourSize() {
    if (!newLabel.trim()) return;
    const amt = isFullContainer ? 0 : parseFloat(newOz);
    if (!isFullContainer && (isNaN(amt) || amt <= 0)) return;
    setCurrentPourSizes([...currentPourSizes, { label: newLabel.trim(), amount: isFullContainer ? 0 : amt, unit: isFullContainer ? "each" : "oz" }]);
    setNewLabel(""); setNewOz(""); setIsFullContainer(false);
  }

  function removePourSize(index: number) {
    setCurrentPourSizes(currentPourSizes.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(""); setSaving(true);
    try {
      if (mode === "sub") {
        const result = await addSubCategory({
          name: subName.trim(),
          parent: subParent,
          servingStyle: subServingStyle,
          pourSizes: subPourSizes,
        });
        if (result?.error) { setError(result.error); setSaving(false); return; }
      } else {
        const result = await addParentCategory({
          name: parentName.trim(),
          icon: parentIcon,
          defaultServingStyle: parentServingStyle,
          defaultPourSizes: parentPourSizes,
        });
        if (result?.error) { setError(result.error); setSaving(false); return; }
      }
      router.push("/dashboard/settings/categories");
      router.refresh();
    } catch {
      setError("Something went wrong");
      setSaving(false);
    }
  }

  const ICON_OPTIONS = ["🥃", "🍷", "🍺", "🍸", "🧃", "💧", "🍯", "🛒", "🥬", "🥩", "🧈", "🌾", "📦", "🍹", "🥂", "🍶"];

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("sub")}
          className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-colors border ${
            mode === "sub" ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
          }`}
        >
          <p className="font-semibold">Sub-Category</p>
          <p className="text-xs mt-0.5 opacity-70">e.g. Bourbon, BTG Red, Draft Beer</p>
        </button>
        <button
          onClick={() => setMode("parent")}
          className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-colors border ${
            mode === "parent" ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
          }`}
        >
          <p className="font-semibold">Parent Category</p>
          <p className="text-xs mt-0.5 opacity-70">e.g. Spirit, Wine, Beer</p>
        </button>
      </div>

      {/* Sub-category form */}
      {mode === "sub" && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div>
            <label className="text-sm font-medium text-stone-700 mb-1 block">Parent Category</label>
            <select value={subParent} onChange={(e) => handleSubParentChange(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500">
              {parents.map((p) => <option key={p.name} value={p.name}>{p.icon} {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-stone-700 mb-1 block">Sub-Category Name</label>
            <input value={subName} onChange={(e) => setSubName(e.target.value)}
              placeholder="e.g. Bourbon, BTG Red, Draft Beer, Lager"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500" autoFocus />
          </div>
          <div>
            <label className="text-sm font-medium text-stone-700 mb-2 block">Serving Style</label>
            <div className="flex gap-2 flex-wrap">
              {SERVING_STYLES.map((style) => (
                <button key={style.value} onClick={() => {
                  setSubServingStyle(style.value);
                  if (style.value === "BTB" || style.value === "NONE") setSubPourSizes([]);
                }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    subServingStyle === style.value
                      ? style.value === "BTG" ? "bg-purple-600 text-white" :
                        style.value === "BTB" ? "bg-blue-600 text-white" :
                        style.value === "STANDARD" ? "bg-amber-600 text-white" :
                        "bg-stone-600 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}>{style.label}</button>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-2">{SERVING_STYLES.find((s) => s.value === subServingStyle)?.description}</p>
          </div>
        </div>
      )}

      {/* Parent category form */}
      {mode === "parent" && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="flex gap-3">
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1 block">Icon</label>
              <select value={parentIcon} onChange={(e) => setParentIcon(e.target.value)}
                className="px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xl focus:outline-none focus:ring-2 focus:ring-amber-500">
                {ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium text-stone-700 mb-1 block">Parent Category Name</label>
              <input value={parentName} onChange={(e) => setParentName(e.target.value)}
                placeholder="e.g. Spirit, Wine, Beer, Cocktail Ingredient"
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500" autoFocus />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-stone-700 mb-2 block">Default Serving Style</label>
            <div className="flex gap-2 flex-wrap">
              {SERVING_STYLES.map((style) => (
                <button key={style.value} onClick={() => {
                  setParentServingStyle(style.value);
                  if (style.value === "BTB" || style.value === "NONE") setParentPourSizes([]);
                }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    parentServingStyle === style.value
                      ? style.value === "BTG" ? "bg-purple-600 text-white" :
                        style.value === "BTB" ? "bg-blue-600 text-white" :
                        style.value === "STANDARD" ? "bg-amber-600 text-white" :
                        "bg-stone-600 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}>{style.label}</button>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-2">New sub-categories will inherit this serving style by default</p>
          </div>
        </div>
      )}

      {/* Pour Sizes */}
      {showPourEditor && (
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-3">
            {mode === "parent" ? "Default Pour Sizes" : "Pour Sizes"}
          </h2>
          {currentPourSizes.length === 0 ? (
            <p className="text-sm text-stone-400 mb-3">No pour sizes yet. Add at least one.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {currentPourSizes.map((ps, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-stone-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-stone-700">{ps.label}</span>
                    <span className="text-xs text-stone-500">{ps.amount === 0 ? "(full container)" : `${ps.amount}${ps.unit || "oz"}`}</span>
                  </div>
                  <button onClick={() => removePourSize(i)} className="p-1 text-stone-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-stone-500 mb-1 block">Pour Name</label>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Standard, 5oz Glass"
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPourSize(); } }} />
            </div>
            {!isFullContainer && (
              <div className="w-24">
                <label className="text-xs text-stone-500 mb-1 block">Ounces</label>
                <input type="number" step="0.01" value={newOz} onChange={(e) => setNewOz(e.target.value)} placeholder="oz"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPourSize(); } }} />
              </div>
            )}
            <label className="flex items-center gap-2 px-3 py-2 text-xs text-stone-600 cursor-pointer">
              <input type="checkbox" checked={isFullContainer} onChange={(e) => setIsFullContainer(e.target.checked)}
                className="rounded border-stone-300 text-amber-600 focus:ring-amber-500" /> Full container
            </label>
            <button onClick={addPourSize} className="flex items-center gap-1 px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave}
          disabled={saving || (mode === "sub" ? !subName.trim() : !parentName.trim())}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-300 text-white rounded-lg text-sm font-medium transition-colors">
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Create Category"}
        </button>
        <button onClick={() => router.push("/dashboard/settings/categories")}
          className="px-4 py-2.5 text-stone-500 hover:text-stone-900 text-sm">Cancel</button>
      </div>
    </div>
  );
}
