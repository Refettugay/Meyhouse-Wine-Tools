"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Martini,
  Grape,
  Wine,
  GlassWater,
  Beer,
  CupSoda,
  UtensilsCrossed,
  FlaskConical,
  Database,
} from "lucide-react";

const tabs = [
  {
    href: "/dashboard/pricing-hub",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/dashboard/pricing-hub/cocktails",
    label: "Cocktails",
    icon: Martini,
  },
  {
    href: "/dashboard/pricing-hub/wine-btg",
    label: "Wine BTG",
    icon: Grape,
  },
  {
    href: "/dashboard/pricing-hub/wine-btb",
    label: "Wine BTB",
    icon: Wine,
  },
  {
    href: "/dashboard/pricing-hub/wine-half",
    label: "Wine Half",
    icon: Wine,
  },
  {
    href: "/dashboard/pricing-hub/spirits",
    label: "Spirits",
    icon: GlassWater,
  },
  {
    href: "/dashboard/pricing-hub/beer",
    label: "Beer",
    icon: Beer,
  },
  {
    href: "/dashboard/pricing-hub/na",
    label: "NA / Soft",
    icon: CupSoda,
  },
  {
    href: "/dashboard/pricing-hub/food",
    label: "Food",
    icon: UtensilsCrossed,
  },
  {
    href: "/dashboard/pricing-hub/homemade",
    label: "Homemade",
    icon: FlaskConical,
  },
  {
    href: "/dashboard/pricing-hub/data",
    label: "Sales Data",
    icon: Database,
  },
];

export function PricingHubTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 bg-[var(--brand-cream)] rounded-lg p-1 mb-4 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              isActive
                ? "bg-white text-[var(--brand-olive)] shadow-sm"
                : "text-[var(--ink-muted)] hover:text-[var(--brand-brown)]"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
