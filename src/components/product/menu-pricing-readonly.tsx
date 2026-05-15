"use client";

import { useEffect, useState } from "react";
import {
  getPricingRows,
  getCategoriesWithTargets,
  type PricingRow,
} from "@/lib/actions/pricing-tool";
import { PricingToolTable } from "@/components/finans-lab/pricing-tool-table";
import { Lock, DollarSign } from "lucide-react";

type Category = {
  id: string;
  name: string;
  sortOrder: number;
  defaultCostTargetPct: number | null;
};

export function MenuPricingReadOnly() {
  const [rows, setRows] = useState<PricingRow[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [r, c] = await Promise.all([
          getPricingRows(),
          getCategoriesWithTargets(),
        ]);
        if (mounted) {
          setRows(r);
          setCategories(c);
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-6 text-center">
        <p className="text-sm text-red-600">Failed to load pricing: {error}</p>
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-6 text-center">
        <DollarSign className="w-8 h-8 text-stone-300 mx-auto mb-2 animate-pulse" />
        <p className="text-sm text-stone-500">Loading menu prices…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-stone-600">
        <Lock className="w-3.5 h-3.5 text-stone-400" />
        <span>
          Read-only view. To change menu prices or cost targets, use the
          <span className="font-semibold"> Pricing Hub</span>.
        </span>
      </div>
      <PricingToolTable initialRows={rows} categories={categories} readOnly />
    </div>
  );
}
