"use client";

import { useState, useTransition } from "react";
import {
  updateCostingMethod,
  updateKpiExcludedEmployees,
  updateKpiSpecialAccounts,
  type CostingMethod,
} from "@/lib/actions/finans-lab";
import { Check, Plus, X } from "lucide-react";

interface Props {
  initialMethod: CostingMethod;
  initialExcluded: string[];
  initialSpecial: string[];
}

const METHODS: { value: CostingMethod; label: string; description: string; recommended?: boolean }[] = [
  {
    value: "WAC",
    label: "Weighted Average Cost (WAC)",
    description:
      "Every purchase is averaged. Simple and smooth — recommended for bars and restaurants.",
    recommended: true,
  },
  {
    value: "FIFO",
    label: "First In, First Out (FIFO)",
    description:
      "Older stock is used first. Matches physical reality for perishables.",
  },
  {
    value: "LIFO",
    label: "Last In, First Out (LIFO)",
    description:
      "Newest stock is used first. Rarely used outside tax accounting.",
  },
];

export function CostingMethodForm({
  initialMethod,
  initialExcluded,
  initialSpecial,
}: Props) {
  const [method, setMethod] = useState<CostingMethod>(initialMethod);
  const [excluded, setExcluded] = useState<string[]>(initialExcluded);
  const [special, setSpecial] = useState<string[]>(initialSpecial);
  const [newExcluded, setNewExcluded] = useState("");
  const [newSpecial, setNewSpecial] = useState("");
  const [savedMethod, setSavedMethod] = useState<CostingMethod>(initialMethod);
  const [isPending, startTransition] = useTransition();

  const saveMethod = (next: CostingMethod) => {
    setMethod(next);
    startTransition(async () => {
      const res = await updateCostingMethod(next);
      if (res.success) setSavedMethod(next);
    });
  };

  const addExcluded = () => {
    const name = newExcluded.trim();
    if (!name || excluded.includes(name)) return;
    const next = [...excluded, name];
    setExcluded(next);
    setNewExcluded("");
    startTransition(async () => {
      await updateKpiExcludedEmployees(next);
    });
  };

  const removeExcluded = (name: string) => {
    const next = excluded.filter((n) => n !== name);
    setExcluded(next);
    startTransition(async () => {
      await updateKpiExcludedEmployees(next);
    });
  };

  const addSpecial = () => {
    const name = newSpecial.trim();
    if (!name || special.includes(name)) return;
    const next = [...special, name];
    setSpecial(next);
    setNewSpecial("");
    startTransition(async () => {
      await updateKpiSpecialAccounts(next);
    });
  };

  const removeSpecial = (name: string) => {
    const next = special.filter((n) => n !== name);
    setSpecial(next);
    startTransition(async () => {
      await updateKpiSpecialAccounts(next);
    });
  };

  return (
    <div className="space-y-6">
      {/* Costing Method */}
      <section className="bg-white border border-[var(--line)] rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold">Costing Method</h2>
          {savedMethod === method && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--ink-muted)] mb-4">
          How inventory cost is calculated for Pricing Hub and Inventory
          Insights.
        </p>
        <div className="space-y-2">
          {METHODS.map((m) => (
            <label
              key={m.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                method === m.value
                  ? "border-[var(--brand-olive)] bg-[#FAF7F1]"
                  : "border-[var(--line)] hover:border-[var(--line)]"
              }`}
            >
              <input
                type="radio"
                name="costingMethod"
                value={m.value}
                checked={method === m.value}
                onChange={() => saveMethod(m.value)}
                disabled={isPending}
                className="mt-0.5 accent-[var(--brand-olive)]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{m.label}</span>
                  {m.recommended && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 bg-[rgba(74,93,39,0.12)] text-[var(--brand-olive-hover)] rounded">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">{m.description}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* KPI Excluded Employees */}
      <section className="bg-white border border-[var(--line)] rounded-xl p-5">
        <h2 className="font-semibold mb-1">KPI Excluded Employees</h2>
        <p className="text-xs text-[var(--ink-muted)] mb-4">
          Employees listed here are removed from Server KPI scoring. Use for
          managers, directors, and trainees who don&apos;t serve tables full-time.
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          {excluded.length === 0 && (
            <p className="text-xs text-[var(--ink-muted)] italic">No one excluded yet.</p>
          )}
          {excluded.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--brand-cream)] text-[var(--brand-brown)] text-xs"
            >
              {name}
              <button
                onClick={() => removeExcluded(name)}
                disabled={isPending}
                className="text-[var(--ink-muted)] hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={newExcluded}
            onChange={(e) => setNewExcluded(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addExcluded();
              }
            }}
            placeholder="Employee name (e.g. Refet Tugay)"
            className="flex-1 px-3 py-1.5 border border-[var(--line)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] focus:border-[var(--brand-olive)]"
          />
          <button
            onClick={addExcluded}
            disabled={isPending || !newExcluded.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--brand-olive)] text-white text-sm font-medium hover:bg-[var(--brand-olive-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </section>

      {/* KPI Special Accounts */}
      <section className="bg-white border border-[var(--line)] rounded-xl p-5">
        <h2 className="font-semibold mb-1">KPI Special Accounts</h2>
        <p className="text-xs text-[var(--ink-muted)] mb-4">
          Accounts shown separately from the main leaderboard. Typically PDR
          Banquet, Online Ordering, or other system accounts that don&apos;t
          represent a single server.
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          {special.length === 0 && (
            <p className="text-xs text-[var(--ink-muted)] italic">
              No special accounts defined.
            </p>
          )}
          {special.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-100"
            >
              {name}
              <button
                onClick={() => removeSpecial(name)}
                disabled={isPending}
                className="text-blue-400 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={newSpecial}
            onChange={(e) => setNewSpecial(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSpecial();
              }
            }}
            placeholder="Account name"
            className="flex-1 px-3 py-1.5 border border-[var(--line)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] focus:border-[var(--brand-olive)]"
          />
          <button
            onClick={addSpecial}
            disabled={isPending || !newSpecial.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--brand-olive)] text-white text-sm font-medium hover:bg-[var(--brand-olive-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </section>
    </div>
  );
}
