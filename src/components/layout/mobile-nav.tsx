"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wine,
  FlaskConical,
  DollarSign,
  Package,
  LayoutDashboard,
} from "lucide-react";

const mobileNavItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/recipes", label: "Recipes", icon: Wine },
  { href: "/dashboard/products", label: "Products", icon: FlaskConical },
  { href: "/dashboard/inventory", label: "Inventory", icon: Package },
  // "Inventory & Ordering" shortened to "Inventory" in the mobile nav bar
  { href: "/dashboard/pricing", label: "Pricing", icon: DollarSign },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--line)] z-50">
      <div className="flex items-center justify-around">
        {mobileNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center py-2 px-3 text-xs ${
                isActive ? "text-[var(--brand-olive)]" : "text-[var(--ink-muted)]"
              }`}
            >
              <item.icon className="w-5 h-5 mb-1" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
