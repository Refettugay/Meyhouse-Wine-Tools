"use client";

import { useState, useRef, useEffect } from "react";
import { Home, Calendar, Wine, Coins, Users, ChevronDown } from "lucide-react";

// Cross-subdomain navigation. Home and Team live on the launcher subdomain,
// Schedule on its own, Beverage is this app. Plain <a> for all so the full
// page boundary is crossed cleanly across subdomains.
const LAUNCHER_URL =
  process.env.NEXT_PUBLIC_LAUNCHER_URL || "https://app.runsophra.com";
const SCHEDULE_URL =
  process.env.NEXT_PUBLIC_SCHEDULE_URL || "https://schedule.runsophra.com";

// Mobile-only tool-switcher pill. Mirrors the launcher's component verbatim;
// Beverage is the active tool here so its own link is the same-origin "/".
export function MobileToolSwitcher({
  active = "beverage",
}: {
  active?: "home" | "schedule" | "beverage" | "team" | "tips";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeIcon =
    active === "schedule" ? (
      <Calendar size={14} strokeWidth={1.75} />
    ) : active === "beverage" ? (
      <Wine size={14} strokeWidth={1.75} />
    ) : active === "team" ? (
      <Users size={14} strokeWidth={1.75} />
    ) : active === "tips" ? (
      <Coins size={14} strokeWidth={1.75} />
    ) : (
      <Home size={14} strokeWidth={1.75} />
    );
  const activeLabel =
    active === "schedule"
      ? "Schedule"
      : active === "beverage"
        ? "Beverage"
        : active === "team"
          ? "Team"
          : active === "tips"
            ? "Tips"
            : "Home";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="tool-box"
      >
        {activeIcon}
        <span>{activeLabel}</span>
        <ChevronDown size={12} strokeWidth={2} />
      </button>

      {open && (
        <div role="menu" className="popdown" style={{ left: 0 }}>
          <div className="popdown-eyebrow">Sophra tools</div>
          <a
            href={LAUNCHER_URL}
            aria-current={active === "home" ? "page" : undefined}
            className="popdown-item"
            onClick={() => setOpen(false)}
          >
            <Home size={16} strokeWidth={1.75} />
            <span>Home</span>
          </a>
          <a
            href={SCHEDULE_URL}
            aria-current={active === "schedule" ? "page" : undefined}
            className="popdown-item"
            onClick={() => setOpen(false)}
          >
            <Calendar size={16} strokeWidth={1.75} />
            <span>Schedule</span>
          </a>
          <a
            href="/"
            aria-current={active === "beverage" ? "page" : undefined}
            className="popdown-item"
            onClick={() => setOpen(false)}
          >
            <Wine size={16} strokeWidth={1.75} />
            <span>Beverage</span>
          </a>
          <a
            href={`${LAUNCHER_URL}/tips`}
            aria-current={active === "tips" ? "page" : undefined}
            className="popdown-item"
            onClick={() => setOpen(false)}
          >
            <Coins size={16} strokeWidth={1.75} />
            <span>Tips</span>
          </a>
          <a
            href={`${LAUNCHER_URL}/team`}
            aria-current={active === "team" ? "page" : undefined}
            className="popdown-item"
            onClick={() => setOpen(false)}
          >
            <Users size={16} strokeWidth={1.75} />
            <span>Team</span>
          </a>
        </div>
      )}
    </div>
  );
}
