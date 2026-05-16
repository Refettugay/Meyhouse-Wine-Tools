"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wine,
  FlaskConical,
  Settings,
  LayoutDashboard,
  Truck,
  TrendingUp,
  DollarSign,
} from "lucide-react";
import { canSeePricingHub } from "@/lib/permissions";

const baseNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/recipes", label: "Recipes", icon: Wine },
  { href: "/dashboard/products", label: "Product Hub", icon: FlaskConical },
];

const pricingHubItem = {
  href: "/dashboard/pricing-hub",
  label: "Pricing Hub",
  icon: DollarSign,
};

const tailNavItems = [
  { href: "/dashboard/finans-lab", label: "Finance Hub", icon: TrendingUp },
  { href: "/dashboard/vendors", label: "Vendors", icon: Truck },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  organizationName: string;
  userName: string;
  role: string;
  permissions?: Record<string, unknown>;
}

export function Sidebar({ organizationName, userName, role, permissions }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    ...baseNavItems,
    ...(canSeePricingHub({ role, permissions }) ? [pricingHubItem] : []),
    ...tailNavItems,
  ];

  return (
    <aside className="flex flex-col w-16 fixed inset-y-0 left-0 bg-white border-r border-stone-200 z-40 overflow-visible">
      {/* Logo — clickable, jumps back to the Sophra launcher where the user
          can switch between Beverage, Schedule, and any future tool. Plain
          anchor (not Next Link) because the launcher is on a different
          subdomain. */}
      <a
        href="https://app.runsophra.com"
        title="Sophra home · switch apps"
        className="p-3 border-b border-stone-200 relative group block hover:bg-amber-50 transition-colors"
      >
        <h1 className="text-lg font-bold text-amber-500 text-center">M</h1>
      </a>

      {/* Navigation */}
      <nav className="flex-1 p-1 space-y-1 overflow-visible">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group/item relative flex items-center h-10 rounded-lg whitespace-nowrap transition-all duration-200 w-full hover:w-48 hover:z-50 hover:shadow-lg hover:border hover:border-stone-200 ${
                isActive
                  ? "bg-amber-600/10 text-amber-500 hover:bg-amber-50"
                  : "text-stone-500 hover:text-stone-900 hover:bg-white"
              }`}
            >
              <div className="w-14 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium hidden group-hover/item:inline pr-4">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="p-2 border-t border-stone-200" title={`${userName} · ${role}`}>
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center text-sm font-medium text-white flex-shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </aside>
  );
}
