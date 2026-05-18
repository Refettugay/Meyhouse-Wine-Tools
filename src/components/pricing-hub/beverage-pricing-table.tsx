"use client";

import { useMemo, useState, useTransition } from "react";
import {
  updatePrice,
  addPourSize,
  deletePourSize,
  applySuggestedPrice,
  seedDefaultPoursForAllInTab,
  seedDefaultPoursForIngredient,
  updateTabDefault,
} from "@/lib/actions/beverage-pricing";
import type {
  BeverageRow,
  BeverageIngredientWithoutPours,
  BeverageTabKey,
} from "@/lib/beverage-pricing-defaults";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  TrendingDown,
  Sparkles,
  Edit3,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  RefreshCw,
} from "lucide-react";

type SortField = "ingredient" | "label" | "cost" | "price" | "costPct" | "status";
type SortDir = "asc" | "desc";
type StatusFilter =
  | "all"
  | "over"
  | "near"
  | "on-target"
  | "under"
  | "no-price"
  | "no-cost"
  | "no-target";

interface Props {
  tab: BeverageTabKey;
  initialRows: BeverageRow[];
  initialOrphans: BeverageIngredientWithoutPours[];
  initialTabDefaultPct: number;
}

const STATUS_CONFIG: Record<
  BeverageRow["status"],
  { label: string; color: string; bg: string; border: string; icon: React.ElementType }
> = {
  over: {
    label: "Over Target",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: AlertCircle,
  },
  near: {
    label: "Near Target",
    color: "text-[var(--brand-olive-hover)]",
    bg: "bg-[#FAF7F1]",
    border: "border-[var(--brand-olive)]",
    icon: AlertTriangle,
  },
  "on-target": {
    label: "On Target",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: CheckCircle2,
  },
  under: {
    label: "Under Target",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: TrendingDown,
  },
  "no-price": {
    label: "No Price",
    color: "text-[var(--ink-muted)]",
    bg: "bg-[var(--brand-cream)]",
    border: "border-[var(--line)]",
    icon: Edit3,
  },
  "no-cost": {
    label: "No Cost",
    color: "text-[var(--ink-muted)]",
    bg: "bg-[var(--brand-cream)]",
    border: "border-[var(--line)]",
    icon: Edit3,
  },
  "no-target": {
    label: "No Target",
    color: "text-[var(--ink-muted)]",
    bg: "bg-[var(--brand-cream)]",
    border: "border-[var(--line)]",
    icon: Edit3,
  },
};

function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function BeveragePricingTable({
  tab,
  initialRows,
  initialOrphans,
  initialTabDefaultPct,
}: Props) {
  const [rows, setRows] = useState<BeverageRow[]>(initialRows);
  const [orphans, setOrphans] = useState<BeverageIngredientWithoutPours[]>(initialOrphans);
  const [tabDefault, setTabDefault] = useState<number>(initialTabDefaultPct);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("ingredient");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [isPending, startTransition] = useTransition();

  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState("");
  const [editingTabDefault, setEditingTabDefault] = useState(false);
  const [tabDefaultDraft, setTabDefaultDraft] = useState("");

  const [showAddFor, setShowAddFor] = useState<string | null>(null); // ingredientId
  const [newLabel, setNewLabel] = useState("");
  const [newPourMl, setNewPourMl] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const filteredSorted = useMemo(() => {
    let list = [...rows];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.ingredientName.toLowerCase().includes(q) ||
          (r.vendorName && r.vendorName.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "ingredient":
          cmp = a.ingredientName.localeCompare(b.ingredientName);
          if (cmp === 0) cmp = a.sortOrder - b.sortOrder;
          break;
        case "label":
          cmp = a.label.localeCompare(b.label);
          break;
        case "cost":
          cmp = (a.costPerPourCents ?? -1) - (b.costPerPourCents ?? -1);
          break;
        case "price":
          cmp = (a.menuPriceCents ?? -1) - (b.menuPriceCents ?? -1);
          break;
        case "costPct":
          cmp = (a.actualCostPct ?? 999) - (b.actualCostPct ?? 999);
          break;
        case "status": {
          const order: Record<BeverageRow["status"], number> = {
            over: 0,
            near: 1,
            "no-target": 2,
            "no-price": 3,
            "no-cost": 4,
            "on-target": 5,
            under: 6,
          };
          cmp = order[a.status] - order[b.status];
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, search, statusFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const c = { over: 0, near: 0, onTarget: 0, under: 0, noPrice: 0, noCost: 0, noTarget: 0 };
    for (const r of rows) {
      if (r.status === "over") c.over++;
      else if (r.status === "near") c.near++;
      else if (r.status === "on-target") c.onTarget++;
      else if (r.status === "under") c.under++;
      else if (r.status === "no-price") c.noPrice++;
      else if (r.status === "no-cost") c.noCost++;
      else if (r.status === "no-target") c.noTarget++;
    }
    return c;
  }, [rows]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-1" />
    );
  };

  // ===================== MUTATIONS (with local state re-computation) =====================

  const recomputeRow = (row: BeverageRow, overrides: Partial<BeverageRow>): BeverageRow => {
    const next = { ...row, ...overrides };
    const { costPerPourCents, menuPriceCents, costTargetPct } = next;
    const actualCostPct =
      costPerPourCents !== null && menuPriceCents && menuPriceCents > 0
        ? (costPerPourCents / menuPriceCents) * 100
        : null;
    const suggestedPriceCents =
      costPerPourCents !== null && costPerPourCents > 0 && costTargetPct && costTargetPct > 0
        ? Math.round(Math.round(costPerPourCents / (costTargetPct / 100)) / 50) * 50
        : null;
    let status: BeverageRow["status"];
    if (costPerPourCents === null || costPerPourCents === 0) status = "no-cost";
    else if (menuPriceCents === null || menuPriceCents === 0) status = "no-price";
    else if (costTargetPct === null || costTargetPct === undefined) status = "no-target";
    else {
      const diff = actualCostPct! - costTargetPct;
      if (diff > 3) status = "over";
      else if (diff > 0) status = "near";
      else if (diff >= -5) status = "on-target";
      else status = "under";
    }
    return { ...next, actualCostPct, suggestedPriceCents, status };
  };

  const savePrice = (priceId: string) => {
    const cleaned = priceDraft.trim();
    const dollars = cleaned === "" ? null : parseFloat(cleaned);
    if (dollars !== null && (isNaN(dollars) || dollars < 0)) {
      setEditingPrice(null);
      return;
    }
    const cents = dollars === null ? null : Math.round(dollars * 100);
    startTransition(async () => {
      await updatePrice(priceId, { menuPriceCents: cents });
      setRows((prev) => prev.map((r) => (r.priceId !== priceId ? r : recomputeRow(r, { menuPriceCents: cents }))));
      setEditingPrice(null);
    });
  };

  const saveRowTarget = (priceId: string) => {
    const cleaned = targetDraft.trim();
    const val = cleaned === "" ? null : parseFloat(cleaned);
    if (val !== null && (isNaN(val) || val < 0 || val > 100)) {
      setEditingTarget(null);
      return;
    }
    startTransition(async () => {
      await updatePrice(priceId, { costTargetPct: val });
      setRows((prev) =>
        prev.map((r) => {
          if (r.priceId !== priceId) return r;
          const effective = val ?? tabDefault;
          return recomputeRow(r, {
            costTargetPct: effective,
            costTargetSource: val !== null ? "row" : "tab",
          });
        })
      );
      setEditingTarget(null);
    });
  };

  const saveTabDefault = () => {
    const cleaned = tabDefaultDraft.trim();
    const val = cleaned === "" ? null : parseFloat(cleaned);
    if (val !== null && (isNaN(val) || val < 0 || val > 100)) {
      setEditingTabDefault(false);
      return;
    }
    startTransition(async () => {
      const res = await updateTabDefault(tab, val);
      if (res.success) {
        const effective = val ?? tabDefault; // updateTabDefault falls back to hardcoded default if null
        setTabDefault(effective);
        setRows((prev) =>
          prev.map((r) => {
            if (r.costTargetSource === "row") return r;
            return recomputeRow(r, { costTargetPct: effective });
          })
        );
      }
      setEditingTabDefault(false);
    });
  };

  const applySuggestion = (priceId: string) => {
    startTransition(async () => {
      const res = await applySuggestedPrice(priceId);
      if (res.success && res.appliedCents !== undefined) {
        setRows((prev) =>
          prev.map((r) => (r.priceId !== priceId ? r : recomputeRow(r, { menuPriceCents: res.appliedCents! })))
        );
      }
    });
  };

  const removeRow = (priceId: string) => {
    if (!confirm("Remove this pour size? Menu price will be lost.")) return;
    startTransition(async () => {
      await deletePourSize(priceId);
      setRows((prev) => prev.filter((r) => r.priceId !== priceId));
    });
  };

  const handleAddPour = (ingredientId: string) => {
    const lbl = newLabel.trim();
    const ml = parseFloat(newPourMl);
    if (!lbl) {
      setAddError("Label required");
      return;
    }
    if (isNaN(ml) || ml <= 0) {
      setAddError("Pour size in ml required");
      return;
    }
    setAddError(null);
    startTransition(async () => {
      const res = await addPourSize(ingredientId, lbl, ml);
      if (res.error) {
        setAddError(res.error);
        return;
      }
      setShowAddFor(null);
      setNewLabel("");
      setNewPourMl("");
      // Reload — simplest: force re-fetch by page refresh. But for now, do a soft redirect via window.
      window.location.reload();
    });
  };

  const seedOrphan = (ingredientId: string) => {
    startTransition(async () => {
      await seedDefaultPoursForIngredient(ingredientId, tab);
      window.location.reload();
    });
  };

  const seedAllOrphans = () => {
    startTransition(async () => {
      await seedDefaultPoursForAllInTab(tab);
      window.location.reload();
    });
  };

  // ===================== RENDER =====================

  return (
    <div className="space-y-4">
      {/* Tab default banner */}
      <div className="bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm">
          <span className="font-semibold text-[var(--brand-olive-hover)] capitalize">{tabLabel(tab)}</span>
          <span className="text-[var(--brand-olive-hover)] mx-2">·</span>
          <span className="text-[var(--ink-muted)]">Default target cost %:</span>
          {editingTabDefault ? (
            <input
              type="number"
              step="0.5"
              autoFocus
              value={tabDefaultDraft}
              onChange={(e) => setTabDefaultDraft(e.target.value)}
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
                setTabDefaultDraft(tabDefault.toString());
              }}
              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[rgba(74,93,39,0.12)] font-bold text-[var(--brand-olive-hover)]"
            >
              {tabDefault}%
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--brand-olive-hover)]/80">
          Applies to every pour unless the row has its own override.
        </p>
      </div>

      {/* Stats pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <StatPill label="Over" count={stats.over} status="over" onClick={() => setStatusFilter("over")} active={statusFilter === "over"} />
        <StatPill label="Near" count={stats.near} status="near" onClick={() => setStatusFilter("near")} active={statusFilter === "near"} />
        <StatPill label="On Target" count={stats.onTarget} status="on-target" onClick={() => setStatusFilter("on-target")} active={statusFilter === "on-target"} />
        <StatPill label="Under" count={stats.under} status="under" onClick={() => setStatusFilter("under")} active={statusFilter === "under"} />
        <StatPill label="No Price" count={stats.noPrice} status="no-price" onClick={() => setStatusFilter("no-price")} active={statusFilter === "no-price"} />
        <StatPill label="No Cost" count={stats.noCost} status="no-cost" onClick={() => setStatusFilter("no-cost")} active={statusFilter === "no-cost"} />
        <StatPill label="No Target" count={stats.noTarget} status="no-target" onClick={() => setStatusFilter("no-target")} active={statusFilter === "no-target"} />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredient or vendor…"
            className="w-full pl-9 pr-3 py-2 border border-[var(--line)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] focus:border-[var(--brand-olive)]"
          />
        </div>
        <button
          onClick={() => {
            setSearch("");
            setStatusFilter("all");
          }}
          className="px-3 py-2 border border-[var(--line)] rounded-lg text-sm text-[var(--ink-muted)] hover:bg-[var(--brand-cream)]"
        >
          Clear filters
        </button>
        {orphans.length > 0 && (
          <button
            onClick={seedAllOrphans}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            Seed default pours ({orphans.length} items)
          </button>
        )}
      </div>

      {/* Orphans — items without any pour row yet, shown as a compact table */}
      {orphans.length > 0 && (
        <div className="bg-white border border-dashed border-[var(--line)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--brand-cream)] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[var(--brand-olive)]" />
            <h3 className="font-semibold text-sm">
              Items without pour sizes yet ({orphans.length})
            </h3>
            <span className="text-xs text-[var(--ink-muted)]">
              · Click any row to seed its default pour sizes
            </span>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--brand-cream)] border-b border-[var(--line)] sticky top-0">
                <tr className="text-left text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                  <th className="px-3 py-2 whitespace-nowrap">Product</th>
                  <th className="px-3 py-2 whitespace-nowrap">Vendor</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Bottle $</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Size</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {orphans.map((o) => (
                  <tr key={o.ingredientId} className="hover:bg-[#FAF7F1]">
                    <td className="px-3 py-1.5 text-[var(--brand-brown)] font-medium">
                      {o.ingredientName}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--ink-muted)] whitespace-nowrap">
                      {o.vendorName ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[var(--brand-brown)] font-mono tabular-nums">
                      {o.bottleCostCents !== null
                        ? `$${(o.bottleCostCents / 100).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[var(--brand-brown)] font-mono tabular-nums whitespace-nowrap">
                      {o.bottleSizeMl !== null ? `${o.bottleSizeMl}ml` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => seedOrphan(o.ingredientId)}
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

      {/* Main table */}
      <div className="bg-white border border-[var(--line)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--brand-cream)] border-b border-[var(--line)]">
              <tr className="text-left text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                <th className="px-3 py-2 cursor-pointer whitespace-nowrap" onClick={() => toggleSort("ingredient")}>
                  Ingredient <SortIcon field="ingredient" />
                </th>
                <th className="px-3 py-2 cursor-pointer whitespace-nowrap" onClick={() => toggleSort("label")}>
                  Pour <SortIcon field="label" />
                </th>
                <th className="px-3 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort("cost")}>
                  Cost <SortIcon field="cost" />
                </th>
                <th className="px-3 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort("price")}>
                  Menu Price <SortIcon field="price" />
                </th>
                <th className="px-3 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort("costPct")}>
                  Cost % <SortIcon field="costPct" />
                </th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Target %</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Suggested</th>
                <th className="px-3 py-2 cursor-pointer whitespace-nowrap" onClick={() => toggleSort("status")}>
                  Status <SortIcon field="status" />
                </th>
                <th className="px-3 py-2 whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {filteredSorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-[var(--ink-muted)] italic">
                    {rows.length === 0
                      ? "No pour rows yet. Seed defaults above, or add a pour size from the orphans list."
                      : "No rows match your filters."}
                  </td>
                </tr>
              )}
              {filteredSorted.map((row) => {
                const cfg = STATUS_CONFIG[row.status];
                const StatusIcon = cfg.icon;
                const canApply =
                  row.suggestedPriceCents !== null &&
                  row.suggestedPriceCents !== row.menuPriceCents;
                return (
                  <tr key={row.priceId} className="hover:bg-[var(--brand-cream)]">
                    <td className="px-3 py-2 text-[var(--brand-brown)] font-medium">
                      <div>{row.ingredientName}</div>
                      {row.vendorName && (
                        <div className="text-xs text-[var(--ink-muted)]">{row.vendorName}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--brand-brown)] whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--brand-cream)] text-xs">
                        {row.label}
                        <span className="text-[var(--ink-muted)]">· {row.pourMl}ml</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--brand-brown)] font-mono tabular-nums">
                      {formatCents(row.costPerPourCents)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editingPrice === row.priceId ? (
                        <input
                          type="number"
                          step="0.25"
                          autoFocus
                          value={priceDraft}
                          onChange={(e) => setPriceDraft(e.target.value)}
                          onBlur={() => savePrice(row.priceId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") savePrice(row.priceId);
                            if (e.key === "Escape") setEditingPrice(null);
                          }}
                          className="w-24 px-2 py-0.5 border border-[var(--brand-olive)] rounded text-right text-sm font-mono"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingPrice(row.priceId);
                            setPriceDraft(
                              row.menuPriceCents !== null
                                ? (row.menuPriceCents / 100).toFixed(2)
                                : ""
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#FAF7F1] font-mono tabular-nums"
                        >
                          {formatCents(row.menuPriceCents)}
                          <Pencil className="w-3 h-3 opacity-40" />
                        </button>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono tabular-nums ${
                        row.status === "over"
                          ? "text-red-700 font-semibold"
                          : row.status === "near"
                          ? "text-[var(--brand-olive-hover)]"
                          : row.status === "on-target"
                          ? "text-emerald-700"
                          : row.status === "under"
                          ? "text-blue-700"
                          : "text-[var(--ink-muted)]"
                      }`}
                    >
                      {row.actualCostPct !== null ? `${row.actualCostPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editingTarget === row.priceId ? (
                        <input
                          type="number"
                          step="0.5"
                          autoFocus
                          value={targetDraft}
                          onChange={(e) => setTargetDraft(e.target.value)}
                          onBlur={() => saveRowTarget(row.priceId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRowTarget(row.priceId);
                            if (e.key === "Escape") setEditingTarget(null);
                          }}
                          className="w-20 px-2 py-0.5 border border-[var(--brand-olive)] rounded text-right text-sm font-mono"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingTarget(row.priceId);
                            setTargetDraft(
                              row.costTargetSource === "row" && row.costTargetPct !== null
                                ? row.costTargetPct.toString()
                                : ""
                            );
                          }}
                          title={
                            row.costTargetSource === "tab"
                              ? `Inherited from tab default (${tabDefault}%)`
                              : "Custom override for this pour"
                          }
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#FAF7F1] font-mono tabular-nums ${
                            row.costTargetSource === "tab" ? "text-[var(--ink-muted)] italic" : ""
                          }`}
                        >
                          {row.costTargetPct !== null ? `${row.costTargetPct.toFixed(1)}%` : "—"}
                          <Pencil className="w-3 h-3 opacity-40" />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--brand-brown)] font-mono tabular-nums">
                      {row.suggestedPriceCents !== null ? (
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatCents(row.suggestedPriceCents)}</span>
                          {canApply && (
                            <button
                              onClick={() => applySuggestion(row.priceId)}
                              disabled={isPending}
                              className="p-1 rounded hover:bg-[rgba(74,93,39,0.12)] text-[var(--brand-olive)]"
                              title="Apply suggested price"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {row.costTargetSource === "row" && (
                        <button
                          onClick={() => {
                            startTransition(async () => {
                              await updatePrice(row.priceId, { costTargetPct: null });
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.priceId !== row.priceId
                                    ? r
                                    : recomputeRow(r, {
                                        costTargetPct: tabDefault,
                                        costTargetSource: "tab",
                                      })
                                )
                              );
                            });
                          }}
                          disabled={isPending}
                          className="p-1 rounded hover:bg-[var(--brand-cream)] text-[var(--ink-muted)] mr-1"
                          title="Reset to tab default"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => removeRow(row.priceId)}
                        disabled={isPending}
                        className="p-1 rounded hover:bg-red-50 text-red-500"
                        title="Delete this pour size"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add pour size picker (appears when clicking "add" on a row-expanded ingredient) */}
      {showAddFor && (
        <div className="bg-white border border-[var(--brand-olive)] rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-3">Add pour size</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-[var(--ink-muted)] mb-1">Label</label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. 2oz"
                className="px-3 py-1.5 border border-[var(--line)] rounded-lg text-sm w-32"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-muted)] mb-1">Pour (ml)</label>
              <input
                type="number"
                value={newPourMl}
                onChange={(e) => setNewPourMl(e.target.value)}
                placeholder="59"
                className="px-3 py-1.5 border border-[var(--line)] rounded-lg text-sm w-28"
              />
            </div>
            <button
              onClick={() => handleAddPour(showAddFor)}
              disabled={isPending}
              className="px-3 py-1.5 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddFor(null);
                setNewLabel("");
                setNewPourMl("");
                setAddError(null);
              }}
              className="px-3 py-1.5 border border-[var(--line)] text-[var(--ink-muted)] rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
          {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
        </div>
      )}

      <p className="text-xs text-[var(--ink-muted)] text-center">
        Over = 3%+ above target · Near = within 3% above · On Target = up to 5% below · Under = 5%+ below (room to charge more)
      </p>
    </div>
  );
}

function tabLabel(tab: BeverageTabKey): string {
  switch (tab) {
    case "wine-btg":
      return "Wine BTG";
    case "wine-btb":
      return "Wine BTB";
    case "wine-half":
      return "Wine Half Bottle";
    case "spirits":
      return "Spirits";
    case "beer":
      return "Beer";
    case "na":
      return "NA / Soft";
  }
}

function StatPill({
  label,
  count,
  status,
  onClick,
  active,
}: {
  label: string;
  count: number;
  status: BeverageRow["status"];
  onClick: () => void;
  active: boolean;
}) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
        active ? `${cfg.bg} ${cfg.border} shadow-sm` : "bg-white border-[var(--line)] hover:border-[var(--line)]"
      }`}
    >
      <Icon className={`w-4 h-4 ${cfg.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[var(--ink-muted)] truncate">{label}</p>
        <p className={`text-base font-bold ${cfg.color}`}>{count}</p>
      </div>
    </button>
  );
}
