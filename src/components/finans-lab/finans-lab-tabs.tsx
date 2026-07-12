"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Users,
  Package,
  Wallet,
  FileText,
} from "lucide-react";

const tabs = [
  {
    href: "/dashboard/finans-lab",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/dashboard/finans-lab/sales",
    label: "Sales Data",
    icon: Database,
  },
  {
    href: "/dashboard/finans-lab/covers",
    label: "Covers",
    icon: Users,
  },
  {
    href: "/dashboard/finans-lab/inventory",
    label: "Inventory Insights",
    icon: Package,
  },
  {
    href: "/dashboard/finans-lab/server-kpis",
    label: "Server KPIs",
    icon: Users,
  },
  {
    href: "/dashboard/finans-lab/budget",
    label: "Budget",
    icon: Wallet,
  },
  {
    href: "/dashboard/finans-lab/reports",
    label: "Reports",
    icon: FileText,
  },
];

export function FinanceHubTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 bg-[var(--brand-cream)] rounded-lg p-1 mb-4">
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
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
