"use client";

import { useMemo, useState, useTransition } from "react";
import {
  updateCellPrice,
  updateCellTarget,
  updateColumnTarget,
  updateTabDefaultTarget,
  updateIngredientName,
  updateIngredientBottleSize,
  updateIngredientBottleCost,
  addPourToIngredient,
  removePourFromIngredient,
  seedDefaultPoursForOrphan,
  seedDefaultPoursForAllOrphans,
  applyCellSuggestedPrice,
} from "@/lib/actions/beverage-matrix";
import type {
  BeverageMatrixData,
  BeverageTabKey,
  MatrixProductRow,
  MatrixPourCell,
  MatrixPourColumn,
} from "@/lib/beverage-pricing-defaults";
import {
  Search,
  Pencil,
  Sparkles,
  Plus,
  Trash2,
  Undo2,
  RefreshCw,
  X,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

interface Props {
  tab: BeverageTabKey;
  initial: BeverageMatrixData;
  locations: { id: string; name: string }[];
  selectedLocationId: string; // "all" or a real location id
}

// Alternating column colors so each pour block is easy to scan
const COLUMN_TINTS = [
  { bg: "bg-sky-50/50", head: "bg-sky-100/70" },
  { bg: "bg-emerald-50/50", head: "bg-emerald-100/70" },
  { bg: "bg-purple-50/50", head: "bg-purple-100/70" },
  { bg: "bg-[#FAF7F1]", head: "bg-[rgba(74,93,39,0.12)]" },
  { bg: "bg-rose-50/50", head: "bg-rose-100/70" },
];

function formatCents(c: number | null | undefined): string {
  if (c === null || c === undefined) return "—";
  return `$${(c / 100).toFixed(2)}`;
}

function statusColorClass(status: MatrixPourCell["status"] | null): string {
  switch (status) {
    case "over":
      return "text-red-700 font-semibold bg-red-50/60";
    case "near":
      return "text-[var(--brand-olive-hover)] bg-[#FAF7F1]";
    case "on-target":
      return "text-emerald-700 bg-emerald-50/50";
    case "under":
      return "text-blue-700 bg-blue-50/50";
    default:
      return "text-[var(--ink-muted)]";
  }
}

export function BeverageMatrix({ tab, initial, locations, selectedLocationId }: Props) {
  const [data, setData] = useState<BeverageMatrixData>(initial);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  // Editing state (keyed by target id)
  const [editingPrice, setEditingPrice] = useState<string | null>(null); // priceId
  const [editingCellTarget, setEditingCellTarget] = useState<string | null>(null); // priceId
  const [editingColumnTarget, setEditingColumnTarget] = useState<string | null>(null); // label
  const [editingName, setEditingName] = useState<string | null>(null); // ingredientId
  const [editingBottleSize, setEditingBottleSize] = useState<string | null>(null);
  const [editingBottleCost, setEditingBottleCost] = useState<string | null>(null);
  const [editingTabDefault, setEditingTabDefault] = useState(false);
  const [draft, setDraft] = useState("");

  const [addingPourFor, setAddingPourFor] = useState<string | null>(null); // ingredientId
  const [newPourLabel, setNewPourLabel] = useState("");
  const [newPourMl, setNewPourMl] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  type SortField = "product" | "category" | "vendor";
  type SortDir = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("product");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filteredProducts = useMemo(() => {
    let list = data.products;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.vendorName && p.vendorName.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
      );
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "product":
          cmp = a.name.localeCompare(b.name);
          break;
        case "category":
          cmp = (a.category ?? "").localeCompare(b.category ?? "");
          if (cmp === 0) cmp = a.name.localeCompare(b.name);
          break;
        case "vendor":
          cmp = (a.vendorName ?? "").localeCompare(b.vendorName ?? "");
          if (cmp === 0) cmp = a.name.localeCompare(b.name);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data.products, search, sortField, sortDir]);

  const stats = useMemo(() => {
    let over = 0, near = 0, onTarget = 0, under = 0, noPrice = 0, noCost = 0;
    for (const p of data.products) {
      for (const cell of Object.values(p.cellsByLabel)) {
        if (cell.status === "over") over++;
        else if (cell.status === "near") near++;
        else if (cell.status === "on-target") onTarget++;
        else if (cell.status === "under") under++;
        else if (cell.status === "no-price") noPrice++;
        else if (cell.status === "no-cost") noCost++;
      }
    }
    return { over, near, onTarget, under, noPrice, noCost };
  }, [data.products]);

  // ===================== Cell recomputation helpers =====================
  function recomputeCellStatus(cell: MatrixPourCell, cost: number | null): MatrixPourCell {
    const actual =
      cost !== null && cell.menuPriceCents && cell.menuPriceCents > 0
        ? (cost / cell.menuPriceCents) * 100
        : null;
    const suggested =
      cost !== null && cost > 0 && cell.effectiveTargetPct > 0
        ? Math.round(Math.round(cost / (cell.effectiveTargetPct / 100)) / 50) * 50
        : null;
    let status: MatrixPourCell["status"];
    if (cost === null || cost === 0) status = "no-cost";
    else if (cell.menuPriceCents === null || cell.menuPriceCents === 0) status = "no-price";
    else {
      const diff = actual! - cell.effectiveTargetPct;
      if (diff > 3) status = "over";
      else if (diff > 0) status = "near";
      else if (diff >= -5) status = "on-target";
      else status = "under";
    }
    return {
      ...cell,
      costPerPourCents: cost,
      actualCostPct: actual,
      suggestedPriceCents: suggested,
      status,
    };
  }

  function recomputeRowCosts(row: MatrixProductRow): MatrixProductRow {
    const cells: Record<string, MatrixPourCell> = {};
    for (const [label, cell] of Object.entries(row.cellsByLabel)) {
      const cost =
        row.bottleCostCents && row.bottleSizeMl && cell.pourMl
          ? Math.round((row.bottleCostCents / row.bottleSizeMl) * cell.pourMl)
          : null;
      cells[label] = recomputeCellStatus(cell, cost);
    }
    return { ...row, cellsByLabel: cells };
  }

  // ===================== Mutations =====================

  const savePrice = (priceId: string) => {
    const cleaned = draft.trim();
    const val = cleaned === "" ? null : parseFloat(cleaned);
    if (val !== null && (isNaN(val) || val < 0)) {
      setEditingPrice(null);
      return;
    }
    const cents = val === null ? null : Math.round(val * 100);
    startTransition(async () => {
      await updateCellPrice(priceId, cents);
      setData((prev) => updateCell(prev, priceId, (cell) => recomputeCellStatus({ ...cell, menuPriceCents: cents }, cell.costPerPourCents)));
      setEditingPrice(null);
    });
  };

  const saveCellTarget = (priceId: string) => {
    const cleaned = draft.trim();
    const val = cleaned === "" ? null : parseFloat(cleaned);
    if (val !== null && (isNaN(val) || val < 0 || val > 100)) {
      setEditingCellTarget(null);
      return;
    }
    startTransition(async () => {
      await updateCellTarget(priceId, val);
      setData((prev) => updateCell(prev, priceId, (cell) => {
        const label = cell.label;
        const column = prev.pourColumns.find((c) => c.label === label);
        const columnDefault = column?.columnTargetPct ?? prev.tabDefaultPct;
        const effective = val ?? columnDefault;
        return recomputeCellStatus({ ...cell, rowTargetPct: val, effectiveTargetPct: effective }, cell.costPerPourCents);
      }));
      setEditingCellTarget(null);
    });
  };

  const saveColumnTarget = (label: string) => {
    const cleaned = draft.trim();
    const val = cleaned === "" ? null : parseFloat(cleaned);
    if (val !== null && (isNaN(val) || val < 0 || val > 100)) {
      setEditingColumnTarget(null);
      return;
    }
    startTransition(async () => {
      await updateColumnTarget(tab, label, val);
      setData((prev) => {
        const newCol = (val ?? prev.tabDefaultPct);
        const pourColumns = prev.pourColumns.map((c) =>
          c.label === label ? { ...c, columnTargetPct: newCol, isFromTabConfig: val !== null } : c
        );
        const products = prev.products.map((p) => {
          const cell = p.cellsByLabel[label];
          if (!cell) return p;
          // If row has its own override, keep it; otherwise inherit new column target
          const nextEff = cell.rowTargetPct ?? newCol;
          const updatedCell = recomputeCellStatus({ ...cell, effectiveTargetPct: nextEff }, cell.costPerPourCents);
          return { ...p, cellsByLabel: { ...p.cellsByLabel, [label]: updatedCell } };
        });
        return { ...prev, pourColumns, products };
      });
      setEditingColumnTarget(null);
    });
  };

  const saveTabDefault = () => {
    const cleaned = draft.trim();
    const val = cleaned === "" ? null : parseFloat(cleaned);
    if (val !== null && (isNaN(val) || val < 0 || val > 100)) {
      setEditingTabDefault(false);
      return;
    }
    startTransition(async () => {
      await updateTabDefaultTarget(tab, val);
      setData((prev) => {
        const effective = val ?? prev.tabDefaultPct; // server applies fallback if null
        const pourColumns = prev.pourColumns.map((c) =>
          c.isFromTabConfig ? c : { ...c, columnTargetPct: effective }
        );
        const products = prev.products.map((p) => {
          const cells: Record<string, MatrixPourCell> = {};
          for (const [lbl, cell] of Object.entries(p.cellsByLabel)) {
            const col = pourColumns.find((c) => c.label === lbl);
            const colTarget = col?.columnTargetPct ?? effective;
            const nextEff = cell.rowTargetPct ?? colTarget;
            cells[lbl] = recomputeCellStatus({ ...cell, effectiveTargetPct: nextEff }, cell.costPerPourCents);
          }
          return { ...p, cellsByLabel: cells };
        });
        return { ...prev, tabDefaultPct: effective, pourColumns, products };
      });
      setEditingTabDefault(false);
    });
  };

  const saveName = (ingredientId: string) => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setEditingName(null);
      return;
    }
    startTransition(async () => {
      const res = await updateIngredientName(ingredientId, trimmed);
      if (res.error) {
        alert(res.error);
      } else {
        setData((prev) => ({
          ...prev,
          products: prev.products.map((p) =>
            p.ingredientId === ingredientId ? { ...p, name: trimmed } : p
          ),
        }));
      }
      setEditingName(null);
    });
  };

  const saveBottleSize = (ingredientId: string) => {
    const cleaned = draft.trim();
    const val = cleaned === "" ? null : parseFloat(cleaned);
    if (val !== null && (isNaN(val) || val < 0)) {
      setEditingBottleSize(null);
      return;
    }
    startTransition(async () => {
      await updateIngredientBottleSize(ingredientId, val);
      setData((prev) => ({
        ...prev,
        products: prev.products.map((p) => {
          if (p.ingredientId !== ingredientId) return p;
          const updated = { ...p, bottleSizeMl: val };
          return recomputeRowCosts(updated);
        }),
      }));
      setEditingBottleSize(null);
    });
  };

  const saveBottleCost = (ingredientId: string) => {
    const cleaned = draft.trim();
    const val = cleaned === "" ? null : parseFloat(cleaned);
    if (val !== null && (isNaN(val) || val < 0)) {
      setEditingBottleCost(null);
      return;
    }
    const cents = val === null ? null : Math.round(val * 100);
    startTransition(async () => {
      await updateIngredientBottleCost(ingredientId, cents);
      setData((prev) => ({
        ...prev,
        products: prev.products.map((p) => {
          if (p.ingredientId !== ingredientId) return p;
          const updated = { ...p, bottleCostCents: cents };
          return recomputeRowCosts(updated);
        }),
      }));
      setEditingBottleCost(null);
    });
  };

  const applyCellSuggestion = (priceId: string) => {
    startTransition(async () => {
      const res = await applyCellSuggestedPrice(priceId);
      if (res.success && res.appliedCents !== undefined) {
        setData((prev) =>
          updateCell(prev, priceId, (cell) =>
            recomputeCellStatus({ ...cell, menuPriceCents: res.appliedCents! }, cell.costPerPourCents)
          )
        );
      }
    });
  };

  const submitAddPour = (ingredientId: string) => {
    const lbl = newPourLabel.trim();
    const ml = parseFloat(newPourMl);
    if (!lbl || isNaN(ml) || ml <= 0) {
      setAddError("Label and pour (ml) are required");
      return;
    }
    startTransition(async () => {
      const res = await addPourToIngredient(ingredientId, lbl, ml);
      if (res.error) {
        setAddError(res.error);
        return;
      }
      setAddingPourFor(null);
      setNewPourLabel("");
      setNewPourMl("");
      setAddError(null);
      window.location.reload();
    });
  };

  const removePour = (priceId: string) => {
    if (!confirm("Remove this pour size? Its menu price will be lost.")) return;
    startTransition(async () => {
      await removePourFromIngredient(priceId);
      setData((prev) => ({
        ...prev,
        products: prev.products.map((p) => {
          const entries = Object.entries(p.cellsByLabel).filter(([, c]) => c.priceId !== priceId);
          return { ...p, cellsByLabel: Object.fromEntries(entries) };
        }),
      }));
    });
  };

  const resetCellTarget = (priceId: string) => {
    startTransition(async () => {
      await updateCellTarget(priceId, null);
      setData((prev) =>
        updateCell(prev, priceId, (cell) => {
          const col = prev.pourColumns.find((c) => c.label === cell.label);
          const colTarget = col?.columnTargetPct ?? prev.tabDefaultPct;
          return recomputeCellStatus({ ...cell, rowTargetPct: null, effectiveTargetPct: colTarget }, cell.costPerPourCents);
        })
      );
    });
  };

  const resetColumnTarget = (label: string) => {
    startTransition(async () => {
      await updateColumnTarget(tab, label, null);
      setData((prev) => {
        const pourColumns = prev.pourColumns.map((c) =>
          c.label === label ? { ...c, columnTargetPct: prev.tabDefaultPct, isFromTabConfig: false } : c
        );
        const products = prev.products.map((p) => {
          const cell = p.cellsByLabel[label];
          if (!cell) return p;
          const nextEff = cell.rowTargetPct ?? prev.tabDefaultPct;
          const updatedCell = recomputeCellStatus({ ...cell, effectiveTargetPct: nextEff }, cell.costPerPourCents);
          return { ...p, cellsByLabel: { ...p.cellsByLabel, [label]: updatedCell } };
        });
        return { ...prev, pourColumns, products };
      });
    });
  };

  // ===================== Render =====================

  const handleLocationChange = (newValue: string) => {
    const url = new URL(window.location.href);
    if (newValue === "all") {
      url.searchParams.delete("location");
    } else {
      url.searchParams.set("location", newValue);
    }
    window.location.href = url.toString();
  };

  return (
    <div className="space-y-4">
      {/* Location selector */}
      <div className="bg-white border border-[var(--line)] rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm flex items-center gap-2">
          <span className="text-[var(--ink-muted)] font-medium">Location:</span>
          <select
            value={selectedLocationId}
            onChange={(e) => handleLocationChange(e.target.value)}
            className="px-3 py-1.5 border border-[var(--line)] rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] focus:border-[var(--brand-olive)] bg-white"
          >
            <option value="all">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-[var(--ink-muted)]">
          {selectedLocationId === "all"
            ? `Showing products across all ${locations.length} locations`
            : `Showing products assigned to ${locations.find((l) => l.id === selectedLocationId)?.name ?? "location"} only`}
        </p>
      </div>

      {/* Header with tab default */}
      <div className="bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm">
          <span className="text-[var(--ink-muted)]">Tab default target cost %:</span>
          {editingTabDefault ? (
            <input
              type="number"
              step="0.5"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveTabDefault}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTabDefault();
                if (e.key === "Escape") setEditingTabDefault(false);
              }}
              className="ml-2 w-20 px-2 py-0.5 border border-[var(--brand-olive)] rounded text-sm"
              placeholder="%"
            />
          ) : (
            <button
              onClick={() => {
                setEditingTabDefault(true);
                setDraft(data.tabDefaultPct.toString());
              }}
              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[rgba(74,93,39,0.12)] font-bold text-[var(--brand-olive-hover)]"
            >
              {data.tabDefaultPct}%
              <Pencil className="w-3 h-3" />
            </button>
          )}
          <span className="ml-3 text-xs text-[var(--brand-olive-hover)]/80">
            Applies to any pour column / cell that has no specific override.
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
        <StatChip label="Over" value={stats.over} color="text-red-700 bg-red-50" />
        <StatChip label="Near" value={stats.near} color="text-[var(--brand-olive-hover)] bg-[#FAF7F1]" />
        <StatChip label="On Target" value={stats.onTarget} color="text-emerald-700 bg-emerald-50" />
        <StatChip label="Under" value={stats.under} color="text-blue-700 bg-blue-50" />
        <StatChip label="No Price" value={stats.noPrice} color="text-[var(--ink-muted)] bg-[var(--brand-cream)]" />
        <StatChip label="No Cost" value={stats.noCost} color="text-[var(--ink-muted)] bg-[var(--brand-cream)]" />
      </div>

      {/* Filters + bulk seed */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or vendor…"
            className="w-full pl-9 pr-3 py-2 border border-[var(--line)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] focus:border-[var(--brand-olive)]"
          />
        </div>
        {data.orphans.length > 0 && (
          <button
            onClick={() => {
              startTransition(async () => {
                await seedDefaultPoursForAllOrphans(tab);
                window.location.reload();
              });
            }}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-3 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            Seed defaults for {data.orphans.length} orphans
          </button>
        )}
      </div>

      {/* Main matrix table */}
      <div className="bg-white border border-[var(--line)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide border-b border-[var(--line)]">
                <th
                  className="px-3 py-2 bg-[var(--brand-cream)] whitespace-nowrap cursor-pointer select-none hover:bg-[var(--brand-cream)]"
                  onClick={() => toggleSort("product")}
                >
                  Product
                  {sortField === "product" ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="w-3 h-3 inline ml-1" />
                    ) : (
                      <ArrowDown className="w-3 h-3 inline ml-1" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" />
                  )}
                </th>
                <th
                  className="px-3 py-2 bg-[var(--brand-cream)] whitespace-nowrap cursor-pointer select-none hover:bg-[var(--brand-cream)]"
                  onClick={() => toggleSort("category")}
                >
                  Category
                  {sortField === "category" ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="w-3 h-3 inline ml-1" />
                    ) : (
                      <ArrowDown className="w-3 h-3 inline ml-1" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" />
                  )}
                </th>
                <th
                  className="px-3 py-2 bg-[var(--brand-cream)] whitespace-nowrap cursor-pointer select-none hover:bg-[var(--brand-cream)]"
                  onClick={() => toggleSort("vendor")}
                >
                  Vendor
                  {sortField === "vendor" ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="w-3 h-3 inline ml-1" />
                    ) : (
                      <ArrowDown className="w-3 h-3 inline ml-1" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" />
                  )}
                </th>
                <th className="px-3 py-2 bg-[var(--brand-cream)] text-right whitespace-nowrap">Btl Size</th>
                <th className="px-3 py-2 bg-[var(--brand-cream)] text-right whitespace-nowrap">Btl Cost $</th>
                {data.pourColumns.map((col, idx) => {
                  const tint = COLUMN_TINTS[idx % COLUMN_TINTS.length];
                  return (
                    <th key={col.label} colSpan={2} className={`px-2 py-2 text-center whitespace-nowrap border-l border-[var(--line)] ${tint.head}`}>
                      <div className="font-bold text-[var(--brand-brown)] text-sm normal-case">{col.label}</div>
                      <div className="flex items-center justify-center gap-1 mt-0.5">
                        <span className="text-[10px] font-normal text-[var(--ink-muted)]">target:</span>
                        {editingColumnTarget === col.label ? (
                          <input
                            type="number"
                            step="0.5"
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => saveColumnTarget(col.label)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveColumnTarget(col.label);
                              if (e.key === "Escape") setEditingColumnTarget(null);
                            }}
                            className="w-14 px-1 py-0 border border-[var(--brand-olive)] rounded text-xs"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setEditingColumnTarget(col.label);
                              setDraft(col.columnTargetPct.toString());
                            }}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-white/60 text-xs font-bold ${
                              col.isFromTabConfig ? "text-[var(--brand-brown)]" : "italic text-[var(--ink-muted)]"
                            }`}
                            title={col.isFromTabConfig ? "Column-specific target" : `Inherited from tab default (${data.tabDefaultPct}%)`}
                          >
                            {col.columnTargetPct}%
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        )}
                        {col.isFromTabConfig && (
                          <button
                            onClick={() => resetColumnTarget(col.label)}
                            className="text-[var(--ink-muted)] hover:text-[var(--brand-brown)]"
                            title="Reset to tab default"
                          >
                            <Undo2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-2 bg-[var(--brand-cream)] whitespace-nowrap">Actions</th>
              </tr>
              <tr className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wide border-b border-[var(--line)]">
                <th className="px-3 py-1 bg-[var(--brand-cream)]"></th>
                <th className="px-3 py-1 bg-[var(--brand-cream)]"></th>
                <th className="px-3 py-1 bg-[var(--brand-cream)]"></th>
                <th className="px-3 py-1 bg-[var(--brand-cream)]"></th>
                <th className="px-3 py-1 bg-[var(--brand-cream)]"></th>
                {data.pourColumns.flatMap((col, idx) => {
                  const tint = COLUMN_TINTS[idx % COLUMN_TINTS.length];
                  return [
                    <th key={`${col.label}-cost-sub`} className={`px-2 py-1 text-right border-l border-[var(--line)] ${tint.head}`}>Cost %</th>,
                    <th key={`${col.label}-price-sub`} className={`px-2 py-1 text-right ${tint.head}`}>Menu Price</th>,
                  ];
                })}
                <th className="px-3 py-1 bg-[var(--brand-cream)]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5 + data.pourColumns.length * 2 + 1} className="px-3 py-12 text-center text-[var(--ink-muted)] italic">
                    {data.products.length === 0
                      ? "No products in this tab yet. Use the orphan seeder or check BTG markers in Product Hub."
                      : "No products match your search."}
                  </td>
                </tr>
              )}
              {filteredProducts.map((row) => (
                <tr key={row.ingredientId} className="hover:bg-[var(--brand-cream)]">
                  {/* Product name (editable) */}
                  <td className="px-3 py-2 text-[var(--brand-brown)] font-medium">
                    {editingName === row.ingredientId ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => saveName(row.ingredientId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveName(row.ingredientId);
                          if (e.key === "Escape") setEditingName(null);
                        }}
                        className="w-full px-2 py-0.5 border border-[var(--brand-olive)] rounded text-sm"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingName(row.ingredientId);
                          setDraft(row.name);
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#FAF7F1] text-left"
                      >
                        {row.name}
                        <Pencil className="w-3 h-3 opacity-40" />
                      </button>
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-3 py-2 text-[var(--ink-muted)] whitespace-nowrap">
                    {row.category ?? "—"}
                  </td>

                  {/* Vendor */}
                  <td className="px-3 py-2 text-[var(--ink-muted)] whitespace-nowrap">
                    {row.vendorName ?? "—"}
                  </td>

                  {/* Btl Size */}
                  <td className="px-3 py-2 text-right text-[var(--brand-brown)] font-mono tabular-nums whitespace-nowrap">
                    {editingBottleSize === row.ingredientId ? (
                      <input
                        type="number"
                        step="1"
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => saveBottleSize(row.ingredientId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveBottleSize(row.ingredientId);
                          if (e.key === "Escape") setEditingBottleSize(null);
                        }}
                        className="w-20 px-2 py-0.5 border border-[var(--brand-olive)] rounded text-right text-sm font-mono"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingBottleSize(row.ingredientId);
                          setDraft(row.bottleSizeMl?.toString() ?? "");
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#FAF7F1] font-mono tabular-nums"
                      >
                        {row.bottleSizeMl !== null ? `${row.bottleSizeMl}ml` : "—"}
                        <Pencil className="w-3 h-3 opacity-40" />
                      </button>
                    )}
                  </td>

                  {/* Btl Cost */}
                  <td className="px-3 py-2 text-right text-[var(--brand-brown)] font-mono tabular-nums whitespace-nowrap">
                    {editingBottleCost === row.ingredientId ? (
                      <input
                        type="number"
                        step="0.25"
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => saveBottleCost(row.ingredientId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveBottleCost(row.ingredientId);
                          if (e.key === "Escape") setEditingBottleCost(null);
                        }}
                        className="w-24 px-2 py-0.5 border border-[var(--brand-olive)] rounded text-right text-sm font-mono"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingBottleCost(row.ingredientId);
                          setDraft(row.bottleCostCents !== null ? (row.bottleCostCents / 100).toFixed(2) : "");
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#FAF7F1] font-mono tabular-nums"
                      >
                        {formatCents(row.bottleCostCents)}
                        <Pencil className="w-3 h-3 opacity-40" />
                      </button>
                    )}
                  </td>

                  {/* Pour columns (Cost % + Menu Price for each pour) */}
                  {data.pourColumns.flatMap((col, idx) => {
                    const tint = COLUMN_TINTS[idx % COLUMN_TINTS.length];
                    const cell = row.cellsByLabel[col.label];
                    if (!cell) {
                      return [
                        <td key={`${row.ingredientId}-${col.label}-cost-empty`} className={`px-2 py-2 text-center border-l border-[var(--line)] ${tint.bg} text-[var(--ink-muted)]`}>
                          —
                        </td>,
                        <td key={`${row.ingredientId}-${col.label}-price-empty`} className={`px-2 py-2 text-center ${tint.bg}`}>
                          <button
                            onClick={() => {
                              // Tek tıkla bu pour'u ekle — dialog açma, doğrudan column'un varsayılan pourMl'si ile ekle
                              startTransition(async () => {
                                const res = await addPourToIngredient(row.ingredientId, col.label, col.pourMl);
                                if (res.error) {
                                  alert(res.error);
                                  return;
                                }
                                window.location.reload();
                              });
                            }}
                            disabled={isPending}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[rgba(74,93,39,0.12)] text-xs text-[var(--ink-muted)] hover:text-[var(--brand-olive-hover)] disabled:opacity-50"
                            title={`Add ${col.label} pour (${col.pourMl}ml) for this product`}
                          >
                            <Plus className="w-3 h-3" />
                            add
                          </button>
                        </td>,
                      ];
                    }
                    // Cost % cell (editable — override)
                    return [
                        <td
                          key={`${cell.priceId}-cost`}
                          className={`px-2 py-2 text-right border-l border-[var(--line)] ${tint.bg} ${statusColorClass(cell.status)} whitespace-nowrap`}
                        >
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="font-mono tabular-nums text-xs">
                              {cell.actualCostPct !== null ? (
                                `${cell.actualCostPct.toFixed(1)}%`
                              ) : cell.costPerPourCents !== null ? (
                                <span className="text-[var(--ink-muted)] text-[10px]">
                                  cost {formatCents(cell.costPerPourCents)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </div>
                            {editingCellTarget === cell.priceId ? (
                              <input
                                type="number"
                                step="0.5"
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={() => saveCellTarget(cell.priceId)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveCellTarget(cell.priceId);
                                  if (e.key === "Escape") setEditingCellTarget(null);
                                }}
                                className="w-14 px-1 py-0 border border-[var(--brand-olive)] rounded text-[10px]"
                                placeholder="target"
                              />
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingCellTarget(cell.priceId);
                                  setDraft(cell.rowTargetPct !== null ? cell.rowTargetPct.toString() : "");
                                }}
                                className={`inline-flex items-center gap-0.5 text-[10px] ${
                                  cell.rowTargetPct !== null ? "font-bold text-[var(--brand-brown)]" : "italic text-[var(--ink-muted)]"
                                }`}
                                title={cell.rowTargetPct !== null ? "Row-level override" : `Inherited (${cell.effectiveTargetPct}%)`}
                              >
                                target {cell.effectiveTargetPct}%
                                <Pencil className="w-2 h-2" />
                                {cell.rowTargetPct !== null && (
                                  <span
                                    className="ml-0.5 text-[var(--ink-muted)] hover:text-[var(--brand-brown)]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      resetCellTarget(cell.priceId);
                                    }}
                                  >
                                    <Undo2 className="w-2 h-2" />
                                  </span>
                                )}
                              </button>
                            )}
                          </div>
                        </td>,
                        <td
                          key={`${cell.priceId}-price`}
                          className={`px-2 py-2 text-right ${tint.bg} whitespace-nowrap`}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {editingPrice === cell.priceId ? (
                              <input
                                type="number"
                                step="0.25"
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={() => savePrice(cell.priceId)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") savePrice(cell.priceId);
                                  if (e.key === "Escape") setEditingPrice(null);
                                }}
                                className="w-20 px-1 py-0.5 border border-[var(--brand-olive)] rounded text-right text-xs font-mono"
                              />
                            ) : cell.menuPriceCents !== null ? (
                              <button
                                onClick={() => {
                                  setEditingPrice(cell.priceId);
                                  setDraft((cell.menuPriceCents! / 100).toFixed(2));
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/60 font-mono tabular-nums"
                              >
                                {formatCents(cell.menuPriceCents)}
                                <Pencil className="w-3 h-3 opacity-40" />
                              </button>
                            ) : cell.suggestedPriceCents !== null ? (
                              <button
                                onClick={() => applyCellSuggestion(cell.priceId)}
                                disabled={isPending}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[rgba(74,93,39,0.12)] text-[var(--brand-olive-hover)] font-mono tabular-nums italic"
                                title={`Click to apply suggested price ${formatCents(cell.suggestedPriceCents)}`}
                              >
                                <Sparkles className="w-3 h-3" />→ {formatCents(cell.suggestedPriceCents)}
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingPrice(cell.priceId);
                                  setDraft("");
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/60 font-mono tabular-nums text-[var(--ink-muted)]"
                              >
                                —
                                <Pencil className="w-3 h-3 opacity-40" />
                              </button>
                            )}
                            {cell.menuPriceCents !== null &&
                              cell.suggestedPriceCents !== null &&
                              cell.suggestedPriceCents !== cell.menuPriceCents && (
                                <button
                                  onClick={() => applyCellSuggestion(cell.priceId)}
                                  disabled={isPending}
                                  className="p-0.5 rounded hover:bg-[rgba(74,93,39,0.12)] text-[var(--brand-olive)]"
                                  title={`Replace with suggested price ${formatCents(cell.suggestedPriceCents)}`}
                                >
                                  <Sparkles className="w-3 h-3" />
                                </button>
                              )}
                            <button
                              onClick={() => removePour(cell.priceId)}
                              className="p-0.5 rounded hover:bg-red-50 text-[var(--ink-muted)] hover:text-red-500"
                              title="Remove this pour size"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </td>,
                      ];
                    })}

                  {/* Actions */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      onClick={() => {
                        setAddingPourFor(row.ingredientId);
                        setNewPourLabel("");
                        setNewPourMl("");
                        setAddError(null);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--brand-cream)] hover:bg-[rgba(74,93,39,0.12)] text-[var(--brand-brown)] text-xs"
                      title="Add a pour size for this product"
                    >
                      <Plus className="w-3 h-3" />
                      Add pour
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add pour dialog */}
      {addingPourFor && (
        <div className="bg-white border border-[var(--brand-olive)] rounded-xl p-4 shadow-md">
          <h3 className="font-semibold text-sm mb-3">
            Add pour size for{" "}
            {data.products.find((p) => p.ingredientId === addingPourFor)?.name}
          </h3>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-[var(--ink-muted)] mb-1">Label</label>
              <input
                value={newPourLabel}
                onChange={(e) => setNewPourLabel(e.target.value)}
                placeholder="e.g. 2oz, 10oz, btl"
                className="px-3 py-1.5 border border-[var(--line)] rounded-lg text-sm w-36"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-muted)] mb-1">Pour (ml)</label>
              <input
                type="number"
                step="0.1"
                value={newPourMl}
                onChange={(e) => setNewPourMl(e.target.value)}
                placeholder="59"
                className="px-3 py-1.5 border border-[var(--line)] rounded-lg text-sm w-28"
              />
            </div>
            <button
              onClick={() => submitAddPour(addingPourFor)}
              disabled={isPending}
              className="px-3 py-1.5 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => {
                setAddingPourFor(null);
                setNewPourLabel("");
                setNewPourMl("");
                setAddError(null);
              }}
              className="px-3 py-1.5 border border-[var(--line)] text-[var(--ink-muted)] rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
          {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
          <p className="text-xs text-[var(--ink-muted)] mt-2">
            Common conversions: 1oz = 29.6ml · 2oz = 59ml · 3oz = 89ml · 5oz = 148ml · 6oz = 177ml · 8oz = 237ml · 750ml = btl
          </p>
        </div>
      )}

      {/* Orphans section — products that match this tab but have no pour row */}
      {data.orphans.length > 0 && (
        <div className="bg-white border border-dashed border-[var(--line)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--brand-cream)] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[var(--brand-olive)]" />
            <h3 className="font-semibold text-sm">
              Items without pour sizes yet ({data.orphans.length})
            </h3>
            <span className="text-xs text-[var(--ink-muted)]">· Click any row to add default pours</span>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--brand-cream)] border-b border-[var(--line)] sticky top-0">
                <tr className="text-left text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2 text-right">Btl $</th>
                  <th className="px-3 py-2 text-right">Size</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {data.orphans.map((o) => (
                  <tr key={o.ingredientId} className="hover:bg-[#FAF7F1]">
                    <td className="px-3 py-1.5 text-[var(--brand-brown)] font-medium">{o.name}</td>
                    <td className="px-3 py-1.5 text-[var(--ink-muted)]">{o.category ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--ink-muted)]">{o.vendorName ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right text-[var(--brand-brown)] font-mono tabular-nums">{formatCents(o.bottleCostCents)}</td>
                    <td className="px-3 py-1.5 text-right text-[var(--brand-brown)] font-mono tabular-nums whitespace-nowrap">{o.bottleSizeMl ? `${o.bottleSizeMl}ml` : "—"}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() => {
                          startTransition(async () => {
                            await seedDefaultPoursForOrphan(o.ingredientId, tab);
                            window.location.reload();
                          });
                        }}
                        disabled={isPending}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white text-xs font-medium disabled:opacity-50"
                      >
                        <Plus className="w-3 h-3" />
                        Seed default pours
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--ink-muted)] text-center">
        Click any cell to edit. Column title → edit tab-wide pour target. Cell target → per-item override. Btl Cost / Btl Size change recomputes every pour&apos;s cost instantly.
      </p>
    </div>
  );
}

// ===================== Helpers =====================

function updateCell(
  data: BeverageMatrixData,
  priceId: string,
  mutate: (cell: MatrixPourCell) => MatrixPourCell
): BeverageMatrixData {
  return {
    ...data,
    products: data.products.map((p) => {
      let changed = false;
      const cells: Record<string, MatrixPourCell> = {};
      for (const [lbl, cell] of Object.entries(p.cellsByLabel)) {
        if (cell.priceId === priceId) {
          cells[lbl] = mutate(cell);
          changed = true;
        } else {
          cells[lbl] = cell;
        }
      }
      return changed ? { ...p, cellsByLabel: cells } : p;
    }),
  };
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 ${color}`}>
      <span className="font-medium">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
