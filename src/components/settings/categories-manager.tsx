"use client";

import { useState } from "react";
import Link from "next/link";
import {
  deleteSubCategory,
  updateSubCategory,
  addSubCategory,
  updateParentCategory,
} from "@/lib/actions/settings";
import {
  type CategoriesConfig,
  type SubCategory,
  type ParentCategory,
  type PourSize,
  POUR_NAMES,
  POUR_UNITS,
  SUGGESTED_SIZES,
  getPourSizesSummary,
} from "@/lib/category-types";
import { Plus, Trash2, Search, X, ChevronDown, ChevronRight, Settings2 } from "lucide-react";

function PourChip({ ps, onRemove }: { ps: PourSize; onRemove: () => void }) {
  const amt = ps.amount ?? (ps as any).oz ?? 0;
  const u = ps.unit || (amt > 0 ? "oz" : "");
  const display = amt === 0 ? ps.label : `${ps.label} · ${amt}${u}`;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-[#FAF7F1] text-[var(--brand-olive-hover)] border border-[var(--brand-olive)] px-2 py-1 rounded-full">
      {display}
      <button onClick={onRemove} className="text-[var(--brand-olive)] hover:text-red-500"><X className="w-3 h-3" /></button>
    </span>
  );
}

function InlinePourAdder({ onAdd, onCancel }: { onAdd: (ps: PourSize) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("Glass");
  const [customLabel, setCustomLabel] = useState("");
  const [sizeSelection, setSizeSelection] = useState("__custom__"); // preset key or "__custom__"
  const [customAmount, setCustomAmount] = useState("");
  const [customUnit, setCustomUnit] = useState("oz");

  const isCustomName = label === "__custom__";
  const finalLabel = isCustomName ? customLabel.trim() : label;
  const suggestions = SUGGESTED_SIZES[label] || [];
  const hasSuggestions = suggestions.length > 0;

  function handleLabelChange(newLabel: string) {
    setLabel(newLabel);
    setSizeSelection("__custom__");
    setCustomAmount("");
    // Auto-select first suggested size if available
    const sug = SUGGESTED_SIZES[newLabel];
    if (sug && sug.length > 0) {
      setSizeSelection("0"); // first suggestion
    }
  }

  function handleAdd() {
    if (!finalLabel) return;

    let amount: number;
    let unit: string;

    if (sizeSelection !== "__custom__" && hasSuggestions) {
      const idx = parseInt(sizeSelection);
      const sug = suggestions[idx];
      if (!sug) return;
      amount = sug.amount;
      unit = sug.unit;
    } else {
      amount = parseFloat(customAmount);
      unit = customUnit;
      if (isNaN(amount) || amount <= 0) return;
    }

    onAdd({ label: finalLabel, amount, unit });
  }

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {/* Name dropdown */}
      <select value={label} onChange={(e) => handleLabelChange(e.target.value)}
        className="px-2 py-1 text-xs border border-[var(--line)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]">
        {POUR_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
        <option value="__custom__">Custom...</option>
      </select>
      {isCustomName && (
        <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)}
          placeholder="Name" autoFocus
          className="w-20 px-2 py-1 text-xs border border-[var(--line)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]"
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") onCancel(); }} />
      )}

      {/* Size: suggested dropdown OR custom input */}
      {hasSuggestions ? (
        <select value={sizeSelection} onChange={(e) => setSizeSelection(e.target.value)}
          className="px-2 py-1 text-xs border border-[var(--line)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]">
          {suggestions.map((s, i) => (
            <option key={i} value={String(i)}>{s.label}</option>
          ))}
          <option value="__custom__">Custom size...</option>
        </select>
      ) : null}

      {/* Custom size inputs (shown when no suggestions or "Custom size" selected) */}
      {(!hasSuggestions || sizeSelection === "__custom__") && (
        <>
          <input type="number" step="0.01" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="Size" autoFocus={!isCustomName}
            className="w-16 px-2 py-1 text-xs border border-[var(--line)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]"
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") onCancel(); }} />
          <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value)}
            className="px-2 py-1 text-xs border border-[var(--line)] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]">
            {POUR_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </>
      )}

      <button onClick={handleAdd}
        className="px-2 py-1 text-xs bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded font-medium">Add</button>
      <button onClick={onCancel}
        className="px-2 py-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink-muted)]">Cancel</button>
    </div>
  );
}

export function CategoriesManager({
  config,
  subCounts,
}: {
  config: CategoriesConfig;
  subCounts: Record<string, number>;
}) {
  const [search, setSearch] = useState("");
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [addingPourFor, setAddingPourFor] = useState<string | null>(null); // sub name or "parent:ParentName"
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [editingSubName, setEditingSubName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [error, setError] = useState("");

  function toggleParent(name: string) {
    const s = new Set(collapsedParents);
    if (s.has(name)) s.delete(name); else s.add(name);
    setCollapsedParents(s);
  }

  const grouped = config.parents.map((parent) => ({
    parent,
    subs: config.subs
      .filter((s) => s.parent === parent.name)
      .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => !search || g.subs.length > 0);

  async function handleRemovePour(sub: SubCategory, pourIndex: number) {
    await updateSubCategory(sub.name, { ...sub, pourSizes: sub.pourSizes.filter((_, i) => i !== pourIndex) });
  }

  async function handleAddPour(sub: SubCategory, ps: PourSize) {
    await updateSubCategory(sub.name, { ...sub, pourSizes: [...sub.pourSizes, ps] });
    setAddingPourFor(null);
  }

  async function handleRenameSub(sub: SubCategory) {
    const trimmed = editNameValue.trim();
    if (!trimmed || trimmed === sub.name) { setEditingSubName(null); return; }
    setError("");
    const result = await updateSubCategory(sub.name, { ...sub, name: trimmed });
    if (result?.error) { setError(result.error); return; }
    setEditingSubName(null);
  }

  async function handleDeleteSub(name: string) {
    const count = subCounts[name] || 0;
    if (count > 0 && !confirm(`Delete "${name}"? Removes category from ${count} product(s).`)) return;
    await deleteSubCategory(name);
  }

  async function handleAddSub(parentName: string) {
    if (!newSubName.trim()) return;
    setError("");
    const parent = config.parents.find((p) => p.name === parentName);
    const result = await addSubCategory({
      name: newSubName.trim(),
      parent: parentName,
      servingStyle: parent?.defaultServingStyle || "STANDARD",
      pourSizes: parent?.defaultPourSizes || [],
    });
    if (result?.error) { setError(result.error); return; }
    setAddingSubFor(null);
    setNewSubName("");
  }

  async function handleParentPourRemove(parent: ParentCategory, idx: number) {
    const removedPour = parent.defaultPourSizes[idx];
    const newPours = parent.defaultPourSizes.filter((_, i) => i !== idx);
    await updateParentCategory(parent.name, { ...parent, defaultPourSizes: newPours });
    // Also remove from all subs that have this exact pour
    const subsOfParent = config.subs.filter((s) => s.parent === parent.name);
    for (const sub of subsOfParent) {
      const matchIdx = sub.pourSizes.findIndex((ps) => ps.label === removedPour.label && ps.amount === removedPour.amount && ps.unit === removedPour.unit);
      if (matchIdx !== -1) {
        await updateSubCategory(sub.name, { ...sub, pourSizes: sub.pourSizes.filter((_, i) => i !== matchIdx) });
      }
    }
  }

  async function handleParentPourAdd(parent: ParentCategory, ps: PourSize) {
    // Add to parent defaults
    await updateParentCategory(parent.name, { ...parent, defaultPourSizes: [...parent.defaultPourSizes, ps] });
    // Propagate to all subs under this parent
    const subsOfParent = config.subs.filter((s) => s.parent === parent.name);
    for (const sub of subsOfParent) {
      await updateSubCategory(sub.name, { ...sub, pourSizes: [...sub.pourSizes, ps] });
    }
    setAddingPourFor(null);
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
          <input type="text" placeholder={`Search ${config.subs.length} categories...`}
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] text-sm" />
        </div>
        <Link href="/dashboard/settings/categories/new"
          className="flex items-center gap-1 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add Category
        </Link>
      </div>

      {grouped.map(({ parent, subs }) => {
        const isCollapsed = collapsedParents.has(parent.name);
        return (
          <div key={parent.name} className="bg-white border border-[var(--line)] rounded-xl">
            {/* Parent header */}
            <div className="px-4 py-3 bg-[var(--brand-cream)] border-b border-[var(--line)] rounded-t-xl">
              <div className="flex items-center justify-between">
                <button onClick={() => toggleParent(parent.name)} className="flex items-center gap-2 hover:text-[var(--brand-olive)] transition-colors">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-[var(--ink-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--ink-muted)]" />}
                  <span className="text-lg">{parent.icon}</span>
                  <h3 className="font-semibold text-sm">{parent.name}</h3>
                  <span className="text-xs text-[var(--ink-muted)]">({subs.length})</span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--ink-muted)]">Default:</span>
                  {parent.defaultPourSizes.map((ps, i) => {
                    const amt = ps.amount ?? (ps as any).oz ?? 0;
                    const u = ps.unit || (amt > 0 ? "oz" : "");
                    const display = amt === 0 ? ps.label : `${ps.label} · ${amt}${u}`;
                    return (
                      <span key={i} className="inline-flex items-center gap-0.5 text-xs bg-[var(--line)] text-[var(--brand-brown)] px-1.5 py-0.5 rounded">
                        {display}
                        <button onClick={() => handleParentPourRemove(parent, i)}
                          className="text-[var(--ink-muted)] hover:text-red-500 ml-0.5"><X className="w-3 h-3" /></button>
                      </span>
                    );
                  })}
                  {addingPourFor === `parent:${parent.name}` ? (
                    <InlinePourAdder
                      onAdd={(ps) => handleParentPourAdd(parent, ps)}
                      onCancel={() => setAddingPourFor(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingPourFor(`parent:${parent.name}`)}
                      className="inline-flex items-center gap-0.5 text-xs text-[var(--ink-muted)] hover:text-[var(--brand-olive)] border border-dashed border-[var(--line)] hover:border-[var(--brand-olive)] px-2 py-1 rounded-full transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  )}
                  <Link href={`/dashboard/settings/categories/parent/${encodeURIComponent(parent.name)}`}
                    className="p-1 text-[var(--ink-muted)] hover:text-[var(--brand-olive)]" title="Edit parent"><Settings2 className="w-4 h-4" /></Link>
                </div>
              </div>
            </div>

            {/* Sub-categories */}
            {!isCollapsed && (
              <div>
                {subs.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-[var(--ink-muted)] uppercase border-b border-[var(--line)]">
                        <th className="text-left px-4 py-1.5 font-medium w-[180px]">Sub-Category</th>
                        <th className="text-left px-2 py-1.5 font-medium">Pour Sizes</th>
                        <th className="text-right px-3 py-1.5 font-medium w-[50px]">Items</th>
                        <th className="w-[36px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {subs.map((sub) => {
                        const count = subCounts[sub.name] || 0;
                        return (
                          <tr key={sub.name} className="hover:bg-[var(--brand-cream)] group">
                            <td className="px-4 py-2.5">
                              {editingSubName === sub.name ? (
                                <input
                                  value={editNameValue}
                                  onChange={(e) => setEditNameValue(e.target.value)}
                                  onBlur={() => handleRenameSub(sub)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRenameSub(sub);
                                    if (e.key === "Escape") setEditingSubName(null);
                                  }}
                                  className="w-full px-2 py-0.5 text-sm font-medium bg-[#FAF7F1] border border-[var(--brand-olive)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  className="font-medium text-[var(--brand-brown)] cursor-pointer hover:text-[var(--brand-olive)] transition-colors"
                                  onClick={() => { setEditingSubName(sub.name); setEditNameValue(sub.name); }}
                                  title="Click to rename"
                                >
                                  {sub.name}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {sub.pourSizes.map((ps, i) => (
                                  <PourChip key={i} ps={ps} onRemove={() => handleRemovePour(sub, i)} />
                                ))}
                                {addingPourFor === sub.name ? (
                                  <InlinePourAdder
                                    onAdd={(ps) => handleAddPour(sub, ps)}
                                    onCancel={() => setAddingPourFor(null)}
                                  />
                                ) : (
                                  <button
                                    onClick={() => setAddingPourFor(sub.name)}
                                    className="inline-flex items-center gap-0.5 text-xs text-[var(--ink-muted)] hover:text-[var(--brand-olive)] border border-dashed border-[var(--line)] hover:border-[var(--brand-olive)] px-2 py-1 rounded-full transition-colors"
                                  >
                                    <Plus className="w-3 h-3" /> Add
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className="text-xs text-[var(--ink-muted)]">{count}</span>
                            </td>
                            <td className="px-2 py-2.5">
                              <button onClick={() => handleDeleteSub(sub.name)}
                                className="p-1 text-[var(--ink-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* Add sub-category */}
                <div className="px-4 py-2.5 border-t border-[var(--line)]">
                  {addingSubFor === parent.name ? (
                    <div className="flex items-center gap-2">
                      <input value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
                        placeholder={`New ${parent.name} sub-category...`} autoFocus
                        className="flex-1 px-3 py-1.5 text-sm border border-[var(--line)] rounded-lg bg-[var(--brand-cream)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddSub(parent.name); if (e.key === "Escape") { setAddingSubFor(null); setNewSubName(""); } }} />
                      <button onClick={() => handleAddSub(parent.name)}
                        className="px-3 py-1.5 text-xs bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg font-medium">Add</button>
                      <button onClick={() => { setAddingSubFor(null); setNewSubName(""); }}
                        className="px-3 py-1.5 text-xs text-[var(--ink-muted)]">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingSubFor(parent.name); setNewSubName(""); setError(""); }}
                      className="flex items-center gap-1 text-xs text-[var(--ink-muted)] hover:text-[var(--brand-olive)] transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add sub-category
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
