import { KpiCard } from "@/components/finans-lab/kpi-card";
import { AlertTriangle, Sparkles, TrendingUp } from "lucide-react";

export default async function FinansLabOverviewPage() {
  return (
    <div className="max-w-7xl">
      {/* Period header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">This Week</h2>
          <p className="text-xs text-stone-500">
            No data loaded yet — placeholders shown below
          </p>
        </div>
        <div className="text-sm text-stone-500">Apr 13 – 19, 2026</div>
      </div>

      {/* KPI Cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <KpiCard label="Net Sales" value="—" muted />
        <KpiCard label="Avg Check" value="—" muted />
        <KpiCard label="Bev Mix %" value="—" muted />
        <KpiCard label="Top Server" value="—" muted />
      </div>

      {/* Two-column: Alerts + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="font-semibold text-stone-900">Alerts</h3>
          </div>
          <div className="space-y-2 text-sm text-stone-500">
            <p className="text-stone-400 italic">
              No alerts yet. Alerts will appear when data is connected.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-stone-400">
              <li>• Items needing repricing</li>
              <li>• Dusty shelf (60+ days no sale)</li>
              <li>• Budget overruns</li>
              <li>• Server KPI drops</li>
            </ul>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="font-semibold text-stone-900">Quick Actions</h3>
          </div>
          <div className="space-y-2">
            <button
              disabled
              className="w-full text-left px-3 py-2 rounded-lg border border-stone-200 text-sm text-stone-400 cursor-not-allowed"
            >
              View Weekly Executive Summary
            </button>
            <button
              disabled
              className="w-full text-left px-3 py-2 rounded-lg border border-stone-200 text-sm text-stone-400 cursor-not-allowed"
            >
              Run Server KPI Scoring
            </button>
            <button
              disabled
              className="w-full text-left px-3 py-2 rounded-lg border border-stone-200 text-sm text-stone-400 cursor-not-allowed"
            >
              Export Pricing Report
            </button>
          </div>
        </div>
      </div>

      {/* Trend chart placeholder */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <h3 className="font-semibold text-stone-900">
            Weekly Trend (last 8 weeks)
          </h3>
        </div>
        <div className="h-48 flex items-center justify-center bg-stone-50 rounded-lg text-stone-400 text-sm">
          Chart will appear here once sales data is loaded
        </div>
      </div>
    </div>
  );
}
