"use client";

import { useMemo, useState, useTransition } from "react";
import {
  updateRecipeMenuPrice,
  updateRecipeCostTarget,
  updateCategoryCostTarget,
  applySuggestedPriceToRecipe,
  type PricingRow,
} from "@/lib/actions/pricing-tool";
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
} from "lucide-react";

type Category = {
  id: string;
  name: string;
  sortOrder: number;
  defaultCostTargetPct: number | null;
};

type SortField = "category" | "name" | "cost" | "price" | "costPct" | "status";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "over" | "near" | "on-target" | "under" | "no-price" | "no-cost" | "no-target";

interface Props {
  initialRows: PricingRow[];
  categories: Category[];
  /**
   * Read-only mirror mode. When true:
   * - All inline edits are disabled
   * - Cost, Cost %, Target %, Suggested columns are hidden
   * - Status + Menu Price + Category + Recipe name remain visible
   */
  readOnly?: boolean;
}

const STATUS_CONFIG: Record<
  PricingRow["status"],
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
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
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
    color: "text-stone-600",
    bg: "bg-stone-100",
    border: "border-stone-200",
    icon: Edit3,
  },
  "no-cost": {
    label: "No Cost",
    color: "text-stone-600",
    bg: "bg-stone-100",
    border: "border-stone-200",
    icon: Edit3,
  },
  "no-target": {
    label: "No Target",
    color: "text-stone-600",
    bg: "bg-stone-100",
    border: "border-stone-200",
    icon: Edit3,
  },
};

function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function PricingToolTable({ initialRows, categories, readOnly = false }: Props) {
  const [rows, setRows] = useState<PricingRow[]>(initialRows);
  const [cats, setCats] = useState<Category[]>(categories);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("category");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [editingCategoryTarget, setEditingCategoryTarget] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<string>("");
  const [targetDraft, setTargetDraft] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const filteredSorted = useMemo(() => {
    let list = [...rows];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (categoryFilter !== "all") {
      list = list.filter((r) => r.categoryId === categoryFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "category":
          cmp = a.categorySortOrder - b.categorySortOrder;
          if (cmp === 0) cmp = a.name.localeCompare(b.name);
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "cost":
          cmp = a.costCents - b.costCents;
          break;
        case "price":
          cmp = (a.menuPriceCents ?? -1) - (b.menuPriceCents ?? -1);
          break;
        case "costPct":
          cmp = (a.actualCostPct ?? 999) - (b.actualCostPct ?? 999);
          break;
        case "status": {
          const order: Record<PricingRow["status"], number> = {
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
  }, [rows, search, categoryFilter, statusFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const counts = { over: 0, near: 0, onTarget: 0, under: 0, noPrice: 0, noCost: 0, noTarget: 0 };
    for (const r of rows) {
      if (r.status === "over") counts.over++;
      else if (r.status === "near") counts.near++;
      else if (r.status === "on-target") counts.onTarget++;
      else if (r.status === "under") counts.under++;
      else if (r.status === "no-price") counts.noPrice++;
      else if (r.status === "no-cost") counts.noCost++;
      else if (r.status === "no-target") counts.noTarget++;
    }
    return counts;
  }, [rows]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
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

  const startEditPrice = (row: PricingRow) => {
    setEditingPrice(row.recipeId);
    setPriceDraft(row.menuPriceCents !== null ? (row.menuPriceCents / 100).toFixed(2) : "");
  };

  const savePrice = (recipeId: string) => {
    const cleaned = priceDraft.trim();
    const value = cleaned === "" ? null : parseFloat(cleaned);
    if (value !== null && (isNaN(value) || value < 0)) {
      setEditingPrice(null);
      return;
    }
    startTransition(async () => {
      await updateRecipeMenuPrice(recipeId, value);
      setRows((prev) =>
        prev.map((r) => {
          if (r.recipeId !== recipeId) return r;
          const menuPriceCents = value === null ? null : Math.round(value * 100);
          const actualCostPct =
            menuPriceCents !== null && menuPriceCents > 0
              ? (r.costCents / menuPriceCents) * 100
              : null;
          const status: PricingRow["status"] =
            r.costCents === 0
              ? "no-cost"
              : menuPriceCents === null || menuPriceCents === 0
              ? "no-price"
              : r.costTargetPct === null
              ? "no-target"
              : actualCostPct === null
              ? "no-price"
              : actualCostPct - r.costTargetPct > 3
              ? "over"
              : actualCostPct - r.costTargetPct > 0
              ? "near"
              : actualCostPct - r.costTargetPct >= -5
              ? "on-target"
              : "under";
          return { ...r, menuPriceCents, actualCostPct, status };
        })
      );
      setEditingPrice(null);
    });
  };

  const startEditTarget = (row: PricingRow) => {
    setEditingTarget(row.recipeId);
    setTargetDraft(row.costTargetPct !== null ? row.costTargetPct.toString() : "");
  };

  const saveRecipeTarget = (recipeId: string) => {
    const cleaned = targetDraft.trim();
    const value = cleaned === "" ? null : parseFloat(cleaned);
    if (value !== null && (isNaN(value) || value < 0 || value > 100)) {
      setEditingTarget(null);
      return;
    }
    startTransition(async () => {
      await updateRecipeCostTarget(recipeId, value);
      setRows((prev) =>
        prev.map((r) => {
          if (r.recipeId !== recipeId) return r;
          const categoryDefault = cats.find((c) => c.id === r.categoryId)?.defaultCostTargetPct ?? null;
          const effective = value ?? categoryDefault;
          const actualCostPct =
            r.menuPriceCents !== null && r.menuPriceCents > 0
              ? (r.costCents / r.menuPriceCents) * 100
              : null;
          const suggestedPriceCents =
            effective !== null && effective > 0 && r.costCents > 0
              ? Math.round(Math.round(r.costCents / (effective / 100)) / 50) * 50
              : null;
          const status: PricingRow["status"] =
            r.costCents === 0
              ? "no-cost"
              : r.menuPriceCents === null || r.menuPriceCents === 0
              ? "no-price"
              : effective === null
              ? "no-target"
              : actualCostPct === null
              ? "no-price"
              : actualCostPct - effective > 3
              ? "over"
              : actualCostPct - effective > 0
              ? "near"
              : actualCostPct - effective >= -5
              ? "on-target"
              : "under";
          return {
            ...r,
            costTargetPct: effective,
            costTargetSource: value !== null ? "recipe" : categoryDefault !== null ? "category" : "none",
            actualCostPct,
            suggestedPriceCents,
            status,
          };
        })
      );
      setEditingTarget(null);
    });
  };

  const saveCategoryTarget = (categoryId: string) => {
    const cleaned = targetDraft.trim();
    const value = cleaned === "" ? null : parseFloat(cleaned);
    if (value !== null && (isNaN(value) || value < 0 || value > 100)) {
      setEditingCategoryTarget(null);
      return;
    }
    startTransition(async () => {
      await updateCategoryCostTarget(categoryId, value);
      setCats((prev) => prev.map((c) => (c.id === categoryId ? { ...c, defaultCostTargetPct: value } : c)));
      setRows((prev) =>
        prev.map((r) => {
          if (r.categoryId !== categoryId) return r;
          if (r.costTargetSource === "recipe") return r; // recipe-level override wins
          const actualCostPct =
            r.menuPriceCents !== null && r.menuPriceCents > 0
              ? (r.costCents / r.menuPriceCents) * 100
              : null;
          const suggestedPriceCents =
            value !== null && value > 0 && r.costCents > 0
              ? Math.round(Math.round(r.costCents / (value / 100)) / 50) * 50
              : null;
          const status: PricingRow["status"] =
            r.costCents === 0
              ? "no-cost"
              : r.menuPriceCents === null || r.menuPriceCents === 0
              ? "no-price"
              : value === null
              ? "no-target"
              : actualCostPct === null
              ? "no-price"
              : actualCostPct - value > 3
              ? "over"
              : actualCostPct - value > 0
              ? "near"
              : actualCostPct - value >= -5
              ? "on-target"
              : "under";
          return {
            ...r,
            costTargetPct: value,
            costTargetSource: value !== null ? "category" : "none",
            actualCostPct,
            suggestedPriceCents,
            status,
          };
        })
      );
      setEditingCategoryTarget(null);
    });
  };

  const applySuggestion = (recipeId: string) => {
    startTransition(async () => {
      await applySuggestedPriceToRecipe(recipeId);
      setRows((prev) =>
        prev.map((r) => {
          if (r.recipeId !== recipeId || r.suggestedPriceCents === null) return r;
          const menuPriceCents = r.suggestedPriceCents;
          const actualCostPct =
            menuPriceCents > 0 ? (r.costCents / menuPriceCents) * 100 : null;
          return { ...r, menuPriceCents, actualCostPct, status: "on-target" };
        })
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* Summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <StatPill label="Over Target" count={stats.over} status="over" onClick={() => setStatusFilter("over")} active={statusFilter === "over"} />
        <StatPill label="Near Target" count={stats.near} status="near" onClick={() => setStatusFilter("near")} active={statusFilter === "near"} />
        <StatPill label="On Target" count={stats.onTarget} status="on-target" onClick={() => setStatusFilter("on-target")} active={statusFilter === "on-target"} />
        <StatPill label="Under Target" count={stats.under} status="under" onClick={() => setStatusFilter("under")} active={statusFilter === "under"} />
        <StatPill label="No Price" count={stats.noPrice} status="no-price" onClick={() => setStatusFilter("no-price")} active={statusFilter === "no-price"} />
        <StatPill label="No Cost" count={stats.noCost} status="no-cost" onClick={() => setStatusFilter("no-cost")} active={statusFilter === "no-cost"} />
        <StatPill label="No Target" count={stats.noTarget} status="no-target" onClick={() => setStatusFilter("no-target")} active={statusFilter === "no-target"} />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipe…"
            className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
        >
          <option value="all">All Categories</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.defaultCostTargetPct !== null ? ` (target ${c.defaultCostTargetPct}%)` : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setSearch("");
            setCategoryFilter("all");
            setStatusFilter("all");
          }}
          className="px-3 py-2 border border-stone-300 rounded-lg text-sm text-stone-600 hover:bg-stone-50"
        >
          Clear filters
        </button>
      </div>

      {/* Category-level targets banner (only when a single category is filtered, and not read-only) */}
      {!readOnly && categoryFilter !== "all" && (() => {
        const cat = cats.find((c) => c.id === categoryFilter);
        if (!cat) return null;
        const editing = editingCategoryTarget === cat.id;
        return (
          <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium text-amber-900">{cat.name}</span>
              <span className="text-amber-700 mx-2">·</span>
              <span className="text-stone-600">Category default target:</span>
              {editing ? (
                <input
                  type="number"
                  step="0.1"
                  autoFocus
                  value={targetDraft}
                  onChange={(e) => setTargetDraft(e.target.value)}
                  onBlur={() => saveCategoryTarget(cat.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveCategoryTarget(cat.id);
                    if (e.key === "Escape") setEditingCategoryTarget(null);
                  }}
                  className="ml-2 w-20 px-2 py-0.5 border border-amber-400 rounded text-sm"
                  placeholder="%"
                />
              ) : (
                <button
                  onClick={() => {
                    setEditingCategoryTarget(cat.id);
                    setTargetDraft(cat.defaultCostTargetPct?.toString() ?? "");
                  }}
                  className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-amber-100 font-medium text-amber-900"
                >
                  {cat.defaultCostTargetPct !== null ? `${cat.defaultCostTargetPct}%` : "Set…"}
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-xs text-amber-700/80">
              Applies to all recipes in this category unless the recipe has its own target.
            </p>
          </div>
        );
      })()}

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">
                <th className="px-3 py-2 cursor-pointer whitespace-nowrap" onClick={() => toggleSort("category")}>
                  Category <SortIcon field="category" />
                </th>
                <th className="px-3 py-2 cursor-pointer whitespace-nowrap" onClick={() => toggleSort("name")}>
                  Recipe <SortIcon field="name" />
                </th>
                {!readOnly && (
                  <th className="px-3 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort("cost")}>
                    Cost <SortIcon field="cost" />
                  </th>
                )}
                <th className="px-3 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort("price")}>
                  Menu Price <SortIcon field="price" />
                </th>
                {!readOnly && (
                  <th className="px-3 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort("costPct")}>
                    Cost % <SortIcon field="costPct" />
                  </th>
                )}
                {!readOnly && <th className="px-3 py-2 text-right whitespace-nowrap">Target %</th>}
                {!readOnly && <th className="px-3 py-2 text-right whitespace-nowrap">Suggested</th>}
                <th className="px-3 py-2 cursor-pointer whitespace-nowrap" onClick={() => toggleSort("status")}>
                  Status <SortIcon field="status" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredSorted.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 4 : 8} className="px-3 py-12 text-center text-stone-400 italic">
                    No recipes match your filters.
                  </td>
                </tr>
              )}
              {filteredSorted.map((row) => {
                const cfg = STATUS_CONFIG[row.status];
                const StatusIcon = cfg.icon;
                const canApplySuggestion =
                  row.suggestedPriceCents !== null &&
                  row.suggestedPriceCents !== row.menuPriceCents;
                return (
                  <tr key={row.recipeId} className="hover:bg-stone-50/70">
                    <td className="px-3 py-2 text-stone-600 whitespace-nowrap">{row.categoryName}</td>
                    <td className="px-3 py-2 text-stone-900 font-medium">{row.name}</td>
                    {!readOnly && (
                      <td className="px-3 py-2 text-right text-stone-700 font-mono tabular-nums">
                        {row.costCents === 0 ? "—" : formatCents(row.costCents)}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      {!readOnly && editingPrice === row.recipeId ? (
                        <input
                          type="number"
                          step="0.25"
                          autoFocus
                          value={priceDraft}
                          onChange={(e) => setPriceDraft(e.target.value)}
                          onBlur={() => savePrice(row.recipeId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") savePrice(row.recipeId);
                            if (e.key === "Escape") setEditingPrice(null);
                          }}
                          className="w-24 px-2 py-0.5 border border-amber-400 rounded text-right text-sm font-mono"
                        />
                      ) : readOnly ? (
                        <span className="font-mono tabular-nums text-stone-900 font-medium">
                          {formatCents(row.menuPriceCents)}
                        </span>
                      ) : (
                        <button
                          onClick={() => startEditPrice(row)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-amber-50 font-mono tabular-nums"
                        >
                          {formatCents(row.menuPriceCents)}
                          <Pencil className="w-3 h-3 opacity-40" />
                        </button>
                      )}
                    </td>
                    {!readOnly && (
                      <td
                        className={`px-3 py-2 text-right font-mono tabular-nums ${
                          row.status === "over"
                            ? "text-red-700 font-semibold"
                            : row.status === "near"
                            ? "text-amber-700"
                            : row.status === "on-target"
                            ? "text-emerald-700"
                            : row.status === "under"
                            ? "text-blue-700"
                            : "text-stone-400"
                        }`}
                      >
                        {row.actualCostPct !== null ? `${row.actualCostPct.toFixed(1)}%` : "—"}
                      </td>
                    )}
                    {!readOnly && (
                      <td className="px-3 py-2 text-right">
                        {editingTarget === row.recipeId ? (
                          <input
                            type="number"
                            step="0.5"
                            autoFocus
                            value={targetDraft}
                            onChange={(e) => setTargetDraft(e.target.value)}
                            onBlur={() => saveRecipeTarget(row.recipeId)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRecipeTarget(row.recipeId);
                              if (e.key === "Escape") setEditingTarget(null);
                            }}
                            className="w-20 px-2 py-0.5 border border-amber-400 rounded text-right text-sm font-mono"
                          />
                        ) : (
                          <button
                            onClick={() => startEditTarget(row)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-amber-50 font-mono tabular-nums ${
                              row.costTargetSource === "category" ? "text-stone-500 italic" : ""
                            }`}
                            title={
                              row.costTargetSource === "category"
                                ? "Inherited from category default"
                                : row.costTargetSource === "recipe"
                                ? "Custom target for this recipe"
                                : "No target set"
                            }
                          >
                            {row.costTargetPct !== null ? `${row.costTargetPct}%` : "—"}
                            <Pencil className="w-3 h-3 opacity-40" />
                          </button>
                        )}
                      </td>
                    )}
                    {!readOnly && (
                      <td className="px-3 py-2 text-right text-stone-700 font-mono tabular-nums">
                        {row.suggestedPriceCents !== null ? (
                          <div className="flex items-center justify-end gap-1">
                            <span>{formatCents(row.suggestedPriceCents)}</span>
                            {canApplySuggestion && (
                              <button
                                onClick={() => applySuggestion(row.recipeId)}
                                disabled={isPending}
                                className="p-1 rounded hover:bg-amber-100 text-amber-600"
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
                    )}
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!readOnly && (
        <p className="text-xs text-stone-400 text-center">
          Over Target = actual cost % is more than 3% above target · Near Target = within 3% above · On Target
          = up to 5% below target · Under Target = more than 5% below (you can charge more)
        </p>
      )}
    </div>
  );
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
  status: PricingRow["status"];
  onClick: () => void;
  active: boolean;
}) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <button
      onClick={() => (active ? onClick() : onClick())}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
        active ? `${cfg.bg} ${cfg.border} shadow-sm` : "bg-white border-stone-200 hover:border-stone-300"
      }`}
    >
      <Icon className={`w-4 h-4 ${cfg.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-stone-500 truncate">{label}</p>
        <p className={`text-base font-bold ${cfg.color}`}>{count}</p>
      </div>
    </button>
  );
}
