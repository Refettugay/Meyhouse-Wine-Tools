"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { canSeePricingHub } from "@/lib/permissions";
import { MobileToolSwitcher } from "./mobile-tool-switcher";

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL || "https://runsophra.com";

type Tab = { href: string; label: string };

// Section nav for the Beverage tool. Settings used to be a sidebar item —
// it now lives as the gear icon on the right (matches Schedule).
const BASE_TABS: Tab[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/recipes", label: "Recipes" },
  { href: "/dashboard/products", label: "Product Hub" },
];

const PRICING_HUB_TAB: Tab = {
  href: "/dashboard/pricing-hub",
  label: "Pricing Hub",
};

const TAIL_TABS: Tab[] = [
  { href: "/dashboard/finans-lab", label: "Finance Hub" },
  { href: "/dashboard/vendors", label: "Vendors" },
];

export function SophraTopBar({
  role,
  fullName,
  permissions,
}: {
  role: string;
  fullName: string;
  permissions?: Record<string, unknown>;
}) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    ...BASE_TABS,
    ...(canSeePricingHub({ role, permissions }) ? [PRICING_HUB_TAB] : []),
    ...TAIL_TABS,
  ];

  // Active match: exact OR prefix for nested routes. /dashboard itself only
  // matches exactly so it doesn't light up on every sub-page.
  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const settingsActive =
    pathname === "/dashboard/settings" ||
    pathname.startsWith("/dashboard/settings/");

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Cookies scoped to .runsophra.com clear across all Sophra apps; the
    // marketing site is the unified exit point (matches sign-out-button.tsx).
    window.location.href = MARKETING_URL;
  }

  return (
    <header
      className="sophra-top-bar sticky top-0 z-40 flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6"
      style={{
        backgroundColor: "var(--brand-cream)",
        borderColor: "var(--line)",
      }}
    >
      {/* Mobile-only cross-tool dropdown — sits left of the eyebrow.
          Desktop has the sophra-rail sidebar for the same purpose. */}
      <div className="sm:hidden shrink-0">
        <MobileToolSwitcher active="beverage" />
      </div>

      <span className="eyebrow shrink-0">Beverage</span>
      <span
        aria-hidden
        className="hidden h-[18px] w-px shrink-0 sm:block"
        style={{ background: "var(--line)" }}
      />

      {/* Tab strip. Wrapping div is `relative` so the right-edge fade can sit
          on top of the nav without clipping the section tabs. Scrollbar is
          hidden via the .tab-scroll utility — overflow-x-auto stays so wheel
          + touch scrolling still works. */}
      <div className="relative flex flex-1 min-w-0">
        <nav className="tab-scroll flex flex-1 min-w-0 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="section-tab"
              aria-current={isActive(tab.href) ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-4"
          style={{
            background:
              "linear-gradient(to right, transparent, var(--brand-cream))",
          }}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <Link
          href="/dashboard/settings"
          aria-label="Settings"
          title="Settings"
          aria-current={settingsActive ? "page" : undefined}
          className="icon-btn"
          style={
            settingsActive
              ? {
                  backgroundColor: "var(--brand-olive)",
                  color: "var(--brand-cream)",
                }
              : undefined
          }
        >
          <Settings className="h-4 w-4" strokeWidth={1.75} />
        </Link>

        <div className="hidden items-center gap-2 sm:flex">
          <span
            className="text-[13px] font-medium"
            style={{ color: "var(--brand-brown)" }}
          >
            {fullName}
          </span>
          <span className="role-pill">{role}</span>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="signout-link"
          title="Sign out"
        >
          <LogOut className="h-4 w-4 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
