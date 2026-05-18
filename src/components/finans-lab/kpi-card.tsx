import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  change?: number; // percentage, e.g. 8.2 means +8.2%
  muted?: boolean; // show as placeholder when no data yet
}

export function KpiCard({ label, value, change, muted }: KpiCardProps) {
  const isUp = change !== undefined && change > 0;
  const isDown = change !== undefined && change < 0;
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const trendColor = isUp
    ? "text-emerald-600"
    : isDown
    ? "text-red-500"
    : "text-[var(--ink-muted)]";

  return (
    <div className="bg-white border border-[var(--line)] rounded-xl p-4">
      <p className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${
          muted ? "text-[var(--ink-muted)]" : "text-[var(--brand-brown)]"
        }`}
      >
        {value}
      </p>
      {change !== undefined && !muted && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
          <span>
            {isUp ? "+" : ""}
            {change.toFixed(1)}%
          </span>
          <span className="text-[var(--ink-muted)]">vs last week</span>
        </div>
      )}
    </div>
  );
}
