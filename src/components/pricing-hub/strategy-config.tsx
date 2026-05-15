"use client";

import { useState, useTransition } from "react";
import {
  updateStrategyType,
  updateTiers,
  updateRoundingMode,
} from "@/lib/actions/beverage-matrix";
import type { BeverageTabKey } from "@/lib/beverage-pricing-defaults";
import type {
  CostTier,
  StrategyType,
  RoundingMode,
  StrategyConfig,
} from "@/lib/pricing-strategies";
import {
  Settings,
  X,
  Plus,
  Trash2,
  Check,
  Pencil,
  Sparkles,
} from "lucide-react";

interface Props {
  tab: BeverageTabKey;
  tabLabel: string;
  initialConfig: StrategyConfig;
}

const STRATEGY_OPTIONS: {
  value: StrategyType;
  label: string;
  description: string;
  badge?: string;
}[] = [
  {
    value: "flat",
    label: "Flat percentage",
    description: "Single target cost % for every item. Simple — column header controls it.",
  },
  {
    value: "tiered",
    label: "Tiered by bottle cost",
    description:
      "Target % adjusts with bottle cost — cheaper bottles use a lower cost % (higher markup), expensive bottles higher cost % (lower markup). Keeps premium bottles sellable.",
  },
  {
    value: "hybrid",
    label: "Tiered + smart rounding",
    description:
      "Tiered pricing plus automatic rounding to nearest $5 or $10. Recommended for fine dining.",
    badge: "Recommended",
  },
  {
    value: "ai-dynamic",
    label: "AI Dynamic (coming soon)",
    description:
      "Uses actual sales data (velocity, rotation, seasonality) to auto-optimize prices. Requires POS/Toast API integration.",
    badge: "Soon",
  },
];

const ROUNDING_OPTIONS: { value: RoundingMode; label: string }[] = [
  { value: "none", label: "No rounding (e.g. $48.25)" },
  { value: "nearest-5", label: "Nearest $5 ($50)" },
  { value: "nearest-10", label: "Nearest $10 ($50)" },
  { value: "charm-99", label: "Charm .99 ($49.99) — not fine dining" },
];

export function StrategyConfigPanel({ tab, tabLabel, initialConfig }: Props) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<StrategyConfig>(initialConfig);
  const [isPending, startTransition] = useTransition();

  const handleTypeChange = (next: StrategyType) => {
    setConfig((c) => ({ ...c, type: next }));
    startTransition(async () => {
      await updateStrategyType(tab, next);
      // No reload needed — matrix refetches on revalidate
      window.location.reload();
    });
  };

  const handleRoundingChange = (next: RoundingMode) => {
    setConfig((c) => ({ ...c, rounding: next }));
    startTransition(async () => {
      await updateRoundingMode(tab, next);
      window.location.reload();
    });
  };

  const currentStrategy = STRATEGY_OPTIONS.find((s) => s.value === config.type);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-300 bg-white hover:border-amber-500/40 text-sm text-stone-700"
      >
        <Settings className="w-4 h-4 text-amber-600" />
        Strategy: <span className="font-semibold">{currentStrategy?.label ?? "Flat"}</span>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
              <div>
                <h2 className="text-lg font-bold text-stone-900">
                  Pricing Strategy — {tabLabel}
                </h2>
                <p className="text-xs text-stone-500">
                  Choose how suggested prices are calculated for this tab.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-stone-100"
              >
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Strategy selector */}
              <section>
                <h3 className="text-sm font-semibold text-stone-600 uppercase tracking-wide mb-3">
                  Strategy
                </h3>
                <div className="space-y-2">
                  {STRATEGY_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        config.type === opt.value
                          ? "border-amber-500 bg-amber-50/40"
                          : "border-stone-200 hover:border-stone-300"
                      } ${opt.value === "ai-dynamic" ? "opacity-60" : ""}`}
                    >
                      <input
                        type="radio"
                        name="strategy"
                        value={opt.value}
                        checked={config.type === opt.value}
                        onChange={() => handleTypeChange(opt.value)}
                        disabled={isPending || opt.value === "ai-dynamic"}
                        className="mt-0.5 accent-amber-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{opt.label}</span>
                          {opt.badge === "Recommended" && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                              Recommended
                            </span>
                          )}
                          {opt.badge === "Soon" && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 bg-stone-200 text-stone-600 rounded">
                              Soon
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">{opt.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              {/* Rounding mode (only for Hybrid) */}
              {config.type === "hybrid" && (
                <section>
                  <h3 className="text-sm font-semibold text-stone-600 uppercase tracking-wide mb-3">
                    Price rounding
                  </h3>
                  <div className="space-y-2">
                    {ROUNDING_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                          config.rounding === opt.value
                            ? "border-amber-500 bg-amber-50/40"
                            : "border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="rounding"
                          value={opt.value}
                          checked={config.rounding === opt.value}
                          onChange={() => handleRoundingChange(opt.value)}
                          className="accent-amber-600"
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {/* Tier editor (Tiered / Hybrid) */}
              {(config.type === "tiered" || config.type === "hybrid") && (
                <TierEditor
                  tab={tab}
                  initialTiers={config.tiers ?? []}
                  onSaved={() => window.location.reload()}
                />
              )}
            </div>

            <div className="px-6 py-3 border-t border-stone-200 flex justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================================
// TIER EDITOR
// =============================================================================

function TierEditor({
  tab,
  initialTiers,
  onSaved,
}: {
  tab: BeverageTabKey;
  initialTiers: CostTier[];
  onSaved: () => void;
}) {
  const [tiers, setTiers] = useState<CostTier[]>(initialTiers);
  const [saving, startSave] = useTransition();
  const [dirty, setDirty] = useState(false);

  const updateTier = (idx: number, patch: Partial<CostTier>) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const newMin = last ? (last.maxCents ?? last.minCents + 5000) : 0;
    setTiers((prev) => [
      ...prev,
      {
        minCents: newMin,
        maxCents: null,
        targetPct: 30,
        label: "New tier",
      },
    ]);
    setDirty(true);
  };

  const removeTier = (idx: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const save = () => {
    startSave(async () => {
      await updateTiers(tab, tiers);
      setDirty(false);
      onSaved();
    });
  };

  const formatCents = (c: number) => `$${(c / 100).toFixed(0)}`;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">
          Cost Tiers
        </h3>
        <button
          onClick={addTier}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-stone-300 hover:bg-stone-50"
        >
          <Plus className="w-3 h-3" />
          Add tier
        </button>
      </div>
      <p className="text-xs text-stone-500 mb-3">
        Bottle cost ranges and their target cost %. Lower % = higher markup.
        For best results, make cheap bottles have LOW % (aggressive markup) and
        expensive bottles HIGH % (gentler markup).
      </p>
      <div className="overflow-hidden rounded-lg border border-stone-200">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-xs text-stone-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Label</th>
              <th className="px-3 py-2 text-right">Min $</th>
              <th className="px-3 py-2 text-right">Max $</th>
              <th className="px-3 py-2 text-right">Target %</th>
              <th className="px-3 py-2 text-right">Sample</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {tiers.map((t, idx) => {
              const sampleCost = Math.max(t.minCents, 100);
              const markup = t.targetPct > 0 ? Math.round(sampleCost / (t.targetPct / 100)) : 0;
              return (
                <tr key={idx}>
                  <td className="px-3 py-1.5">
                    <input
                      value={t.label ?? ""}
                      onChange={(e) => updateTier(idx, { label: e.target.value })}
                      className="w-full px-2 py-1 border border-stone-300 rounded text-sm"
                      placeholder="label"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      step="1"
                      value={(t.minCents / 100).toFixed(0)}
                      onChange={(e) =>
                        updateTier(idx, { minCents: Math.round(parseFloat(e.target.value || "0") * 100) })
                      }
                      className="w-20 px-2 py-1 border border-stone-300 rounded text-right text-sm font-mono"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      step="1"
                      placeholder="∞"
                      value={t.maxCents !== null ? (t.maxCents / 100).toFixed(0) : ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        updateTier(idx, {
                          maxCents: v === "" ? null : Math.round(parseFloat(v) * 100),
                        });
                      }}
                      className="w-20 px-2 py-1 border border-stone-300 rounded text-right text-sm font-mono"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="99"
                      value={t.targetPct}
                      onChange={(e) =>
                        updateTier(idx, { targetPct: parseFloat(e.target.value || "0") })
                      }
                      className="w-20 px-2 py-1 border border-stone-300 rounded text-right text-sm font-mono"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-stone-500 font-mono">
                    {formatCents(sampleCost)} → {formatCents(markup)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => removeTier(idx)}
                      className="p-1 rounded hover:bg-red-50 text-stone-400 hover:text-red-500"
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

      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-stone-500">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </p>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          Save tiers
        </button>
      </div>
    </section>
  );
}
