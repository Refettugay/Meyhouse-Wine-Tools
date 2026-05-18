import { getPricingRows } from "@/lib/actions/pricing-tool";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Edit3,
  Martini,
  Grape,
  Wine,
  GlassWater,
  Beer,
  CupSoda,
  UtensilsCrossed,
  FlaskConical,
} from "lucide-react";
import Link from "next/link";

export default async function PricingHubOverviewPage() {
  const rows = await getPricingRows();

  const stats = {
    total: rows.length,
    over: rows.filter((r) => r.status === "over").length,
    near: rows.filter((r) => r.status === "near").length,
    onTarget: rows.filter((r) => r.status === "on-target").length,
    under: rows.filter((r) => r.status === "under").length,
    noPrice: rows.filter((r) => r.status === "no-price").length,
    noCost: rows.filter((r) => r.status === "no-cost").length,
    noTarget: rows.filter((r) => r.status === "no-target").length,
  };

  const attentionCount = stats.over + stats.near + stats.noPrice + stats.noTarget;

  const shortcuts: {
    href: string;
    label: string;
    icon: React.ElementType;
    description: string;
    status: "ready" | "soon";
  }[] = [
    {
      href: "/dashboard/pricing-hub/cocktails",
      label: "Cocktails",
      icon: Martini,
      description: "House & Classic cocktail recipes",
      status: "ready",
    },
    {
      href: "/dashboard/pricing-hub/homemade",
      label: "Homemade Ingredients",
      icon: FlaskConical,
      description: "Sub-recipes that produce ingredients",
      status: "ready",
    },
    {
      href: "/dashboard/pricing-hub/food",
      label: "Food",
      icon: UtensilsCrossed,
      description: "Food recipes (mezze, mains, desserts)",
      status: "ready",
    },
    {
      href: "/dashboard/pricing-hub/wine-btg",
      label: "Wine BTG",
      icon: Grape,
      description: "By-the-glass wine pours (5oz / 8oz / btl)",
      status: "soon",
    },
    {
      href: "/dashboard/pricing-hub/wine-btb",
      label: "Wine BTB",
      icon: Wine,
      description: "By-the-bottle wine list (single price per bottle)",
      status: "soon",
    },
    {
      href: "/dashboard/pricing-hub/spirits",
      label: "Spirits",
      icon: GlassWater,
      description: "Spirit pours by category (raki multi-pour)",
      status: "soon",
    },
    {
      href: "/dashboard/pricing-hub/beer",
      label: "Beer",
      icon: Beer,
      description: "Bottle, draft, and can pricing",
      status: "soon",
    },
    {
      href: "/dashboard/pricing-hub/na",
      label: "NA / Soft Drinks",
      icon: CupSoda,
      description: "Soft drinks, mocktails, NA beverages",
      status: "soon",
    },
  ];

  return (
    <div className="max-w-7xl space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Over Target"
          value={stats.over}
          sublabel="3%+ above cost target"
          icon={AlertCircle}
          color="red"
        />
        <StatCard
          label="Near Target"
          value={stats.near}
          sublabel="Up to 3% above"
          icon={AlertTriangle}
          color="amber"
        />
        <StatCard
          label="On Target"
          value={stats.onTarget}
          sublabel="In the sweet spot"
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          label="Under Target"
          value={stats.under}
          sublabel="Could charge more"
          icon={TrendingDown}
          color="blue"
        />
      </div>

      {/* Missing data stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Missing Price"
          value={stats.noPrice}
          sublabel="Menu price not set"
          icon={Edit3}
          color="stone"
        />
        <StatCard
          label="Missing Cost"
          value={stats.noCost}
          sublabel="Recipe cost cannot be calculated"
          icon={Edit3}
          color="stone"
        />
        <StatCard
          label="Missing Target"
          value={stats.noTarget}
          sublabel="Cost target not set"
          icon={Edit3}
          color="stone"
        />
      </div>

      {/* Attention banner */}
      {attentionCount > 0 && (
        <div className="bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--brand-olive)] mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-[var(--brand-olive-hover)]">
              {attentionCount} item{attentionCount === 1 ? "" : "s"} need your attention
            </p>
            <p className="text-sm text-[var(--brand-olive-hover)]/80 mt-0.5">
              Click into each pricing tab below to review items that are over target, near target, or
              missing price/target info.
            </p>
          </div>
        </div>
      )}

      {/* Tabs overview */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--ink-muted)] uppercase tracking-wide mb-3">
          Pricing Categories
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shortcuts.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`group relative block bg-white border rounded-xl p-4 transition-colors ${
                  s.status === "ready"
                    ? "border-[var(--line)] hover:border-[var(--brand-olive)]"
                    : "border-[var(--line)]/60 hover:border-[var(--line)]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      s.status === "ready" ? "bg-[#FAF7F1]" : "bg-[var(--brand-cream)]"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        s.status === "ready" ? "text-[var(--brand-olive)]" : "text-[var(--ink-muted)]"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-[var(--brand-brown)]">{s.label}</h3>
                      {s.status === "soon" && (
                        <span className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-[var(--brand-cream)] text-[var(--ink-muted)]">
                          Soon
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--ink-muted)] mt-0.5">{s.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  sublabel: string;
  icon: React.ElementType;
  color: "red" | "amber" | "emerald" | "blue" | "stone";
}) {
  const colorStyles: Record<typeof color, { bg: string; border: string; text: string; iconBg: string }> = {
    red: {
      bg: "bg-white",
      border: "border-red-200",
      text: "text-red-700",
      iconBg: "bg-red-50",
    },
    amber: {
      bg: "bg-white",
      border: "border-[var(--brand-olive)]",
      text: "text-[var(--brand-olive-hover)]",
      iconBg: "bg-[#FAF7F1]",
    },
    emerald: {
      bg: "bg-white",
      border: "border-emerald-200",
      text: "text-emerald-700",
      iconBg: "bg-emerald-50",
    },
    blue: {
      bg: "bg-white",
      border: "border-blue-200",
      text: "text-blue-700",
      iconBg: "bg-blue-50",
    },
    stone: {
      bg: "bg-white",
      border: "border-[var(--line)]",
      text: "text-[var(--brand-brown)]",
      iconBg: "bg-[var(--brand-cream)]",
    },
  };
  const c = colorStyles[color];
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-4 flex items-start gap-3`}>
      <div className={`w-9 h-9 rounded-lg ${c.iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${c.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${c.text}`}>{value}</p>
        <p className="text-xs text-[var(--ink-muted)] mt-0.5">{sublabel}</p>
      </div>
    </div>
  );
}
