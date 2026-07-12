"use client";

import { usePathname } from "next/navigation";
import { SophraRail } from "./sophra-rail";

// The dashboard layout is a shared server layout wrapping both the Beverage
// tool and the Finance Hub (/dashboard/finans-lab). SophraRail stays a
// presentational mirror of Schedule's rail, so this client wrapper derives the
// active rail item from the current route: Finance under finans-lab, Beverage
// everywhere else in /dashboard.
export function SophraRailActive() {
  const pathname = usePathname();
  const active = pathname.startsWith("/dashboard/finans-lab")
    ? "finance"
    : "beverage";
  return <SophraRail active={active} />;
}
