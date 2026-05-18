"use client";

import Image from "next/image";
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

export function Sidebar({ organizationName: _organizationName, userName, role, permissions }: SidebarProps) {
  const pathname = usePathname();
  void _organizationName;

  const navItems = [
    ...baseNavItems,
    ...(canSeePricingHub({ role, permissions }) ? [pricingHubItem] : []),
    ...tailNavItems,
  ];

  return (
    <aside
      className="flex flex-col w-16 fixed inset-y-0 left-0 z-40 overflow-visible"
      style={{
        background: "var(--brand-cream)",
        borderRight: "1px solid var(--line)",
      }}
    >
      {/* Sophra icon — clickable, jumps back to the launcher where users can
          switch between Beverage, Schedule, and any future tool. Plain
          anchor (not Next Link) because launcher is on a different subdomain. */}
      <a
        href="https://app.runsophra.com"
        title="Sophra home · switch apps"
        className="p-3 relative group block transition-colors"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div className="flex items-center justify-center h-7">
          <Image
            src="/brand/icon.svg"
            alt="Sophra"
            width={28}
            height={28}
            priority
          />
        </div>
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
              className="group/item relative flex items-center h-10 rounded-lg whitespace-nowrap transition-all duration-200 w-full hover:w-48 hover:z-50 hover:shadow-lg"
              style={
                isActive
                  ? {
                      background: "var(--brand-olive)",
                      color: "var(--brand-cream)",
                    }
                  : {
                      color: "var(--brand-brown)",
                      background: "transparent",
                    }
              }
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.6)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <div className="w-14 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5" strokeWidth={1.7} />
              </div>
              <span className="text-sm font-medium hidden group-hover/item:inline pr-4">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div
        className="p-2"
        style={{ borderTop: "1px solid var(--line)" }}
        title={`${userName} · ${role}`}
      >
        <div className="flex items-center justify-center">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
            style={{
              background: "var(--brand-olive)",
              color: "var(--brand-cream)",
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </aside>
  );
}
