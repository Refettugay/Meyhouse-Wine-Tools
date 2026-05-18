"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateParentCategory } from "@/lib/actions/settings";
import {
  type ParentCategory,
  type PourSize,
  type ServingStyle,
  SERVING_STYLES,
} from "@/lib/category-types";
import { Plus, X, Save } from "lucide-react";

const ICON_OPTIONS = ["🥃", "🍷", "🍺", "🍸", "🧃", "💧", "🍯", "🛒", "🥬", "🥩", "🧈", "🌾", "📦", "🍹", "🥂", "🍶"];

export function ParentCategoryDetail({
  parent,
  subCount,
}: {
  parent: ParentCategory;
  subCount: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(parent.name);
  const [icon, setIcon] = useState(parent.icon);
  const [servingStyle, setServingStyle] = useState<ServingStyle>(parent.defaultServingStyle);
  const [pourSizes, setPourSizes] = useState<PourSize[]>(parent.defaultPourSizes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [newLabel, setNewLabel] = useState("");
  const [newOz, setNewOz] = useState("");
  const [isFullContainer, setIsFullContainer] = useState(false);

  const showPourEditor = servingStyle !== "BTB" && servingStyle !== "NONE";

  function addPourSize() {
    if (!newLabel.trim()) return;
    const amt = isFullContainer ? 0 : parseFloat(newOz);
    if (!isFullContainer && (isNaN(amt) || amt <= 0)) return;
    setPourSizes([...pourSizes, { label: newLabel.trim(), amount: isFullContainer ? 0 : amt, unit: isFullContainer ? "each" : "oz" }]);
    setNewLabel(""); setNewOz(""); setIsFullContainer(false);
  }

  async function handleSave() {
    setError(""); setSuccess(""); setSaving(true);
    try {
      const result = await updateParentCategory(parent.name, {
        name: name.trim(),
        icon,
        defaultServingStyle: servingStyle,
        defaultPourSizes: pourSizes,
      });
      if (result?.error) { setError(result.error); }
      else {
        setSuccess("Saved!");
        if (name.trim() !== parent.name) {
          router.replace(`/dashboard/settings/categories/parent/${encodeURIComponent(name.trim())}`);
        }
        router.refresh();
      }
    } catch { setError("Something went wrong"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">{icon}</span>
          <h1 className="text-2xl font-bold">{parent.name}</h1>
        </div>
        <p className="text-[var(--ink-muted)] text-sm">{subCount} sub-categories under this parent</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

      <div className="bg-white border border-[var(--line)] rounded-xl p-5 space-y-4">
        <div className="flex gap-3">
          <div>
            <label className="text-sm font-medium text-[var(--brand-brown)] mb-1 block">Icon</label>
            <select value={icon} onChange={(e) => setIcon(e.target.value)}
              className="px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]">
              {ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium text-[var(--brand-brown)] mb-1 block">Parent Category Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]" />
            {name.trim() !== parent.name && subCount > 0 && (
              <p className="text-xs text-[var(--brand-olive)] mt-1">Renaming will update {subCount} sub-categories</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-[var(--brand-brown)] mb-2 block">Default Serving Style</label>
          <div className="flex gap-2 flex-wrap">
            {SERVING_STYLES.map((style) => (
              <button key={style.value} onClick={() => {
                setServingStyle(style.value);
                if (style.value === "BTB" || style.value === "NONE") setPourSizes([]);
              }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  servingStyle === style.value
                    ? style.value === "BTG" ? "bg-purple-600 text-white" :
                      style.value === "BTB" ? "bg-blue-600 text-white" :
                      style.value === "STANDARD" ? "bg-[var(--brand-olive)] text-white" :
                      "bg-[var(--brand-brown)] text-white"
                    : "bg-[var(--brand-cream)] text-[var(--ink-muted)] hover:bg-[var(--line)]"
                }`}>{style.label}</button>
            ))}
          </div>
          <p className="text-xs text-[var(--ink-muted)] mt-2">New sub-categories will inherit this by default</p>
        </div>
      </div>

      {showPourEditor && (
        <div className="bg-white border border-[var(--line)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--brand-brown)] mb-3">Default Pour Sizes</h2>
          {pourSizes.length > 0 && (
            <div className="space-y-2 mb-4">
              {pourSizes.map((ps, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-[var(--brand-cream)] rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-[var(--brand-brown)]">{ps.label}</span>
                    <span className="text-xs text-[var(--ink-muted)]">{ps.amount === 0 ? "(full container)" : `${ps.amount}${ps.unit || "oz"}`}</span>
                  </div>
                  <button onClick={() => setPourSizes(pourSizes.filter((_, j) => j !== i))} className="p-1 text-[var(--ink-muted)] hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-[var(--ink-muted)] mb-1 block">Pour Name</label>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Standard, 5oz Glass"
                className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPourSize(); } }} />
            </div>
            {!isFullContainer && (
              <div className="w-24">
                <label className="text-xs text-[var(--ink-muted)] mb-1 block">Ounces</label>
                <input type="number" step="0.01" value={newOz} onChange={(e) => setNewOz(e.target.value)} placeholder="oz"
                  className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPourSize(); } }} />
              </div>
            )}
            <label className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--ink-muted)] cursor-pointer">
              <input type="checkbox" checked={isFullContainer} onChange={(e) => setIsFullContainer(e.target.checked)}
                className="rounded border-[var(--line)] text-[var(--brand-olive)] focus:ring-[var(--brand-olive)]" /> Full container
            </label>
            <button onClick={addPourSize} className="flex items-center gap-1 px-3 py-2 bg-[var(--line)] hover:bg-[var(--line)] text-[var(--brand-brown)] rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] disabled:bg-[var(--line)] text-white rounded-lg text-sm font-medium transition-colors">
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
        </button>
        <button onClick={() => router.push("/dashboard/settings/categories")}
          className="px-4 py-2.5 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] text-sm">Cancel</button>
      </div>
    </div>
  );
}
