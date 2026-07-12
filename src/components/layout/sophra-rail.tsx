import Link from "next/link";
import { Home, Calendar, Wine, LineChart, Coins, Plus } from "lucide-react";

const LAUNCHER_URL =
  process.env.NEXT_PUBLIC_LAUNCHER_URL || "https://app.runsophra.com";
const SCHEDULE_URL =
  process.env.NEXT_PUBLIC_SCHEDULE_URL || "https://schedule.runsophra.com";

function SophraMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="-32 -32 64 64"
      role="img"
      aria-label="Sophra"
    >
      <circle r="27.5" fill="none" stroke="#4A5D27" strokeWidth="10" />
      <line x1="-5.5" y1="13" x2="-5.5" y2="-5" stroke="#4A5D27" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="-8.5" y1="-5" x2="-8.5" y2="-15" stroke="#4A5D27" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="-5.5" y1="-5" x2="-5.5" y2="-16" stroke="#4A5D27" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="-2.5" y1="-5" x2="-2.5" y2="-15" stroke="#4A5D27" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="13" x2="5.5" y2="-3" stroke="#4A5D27" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5.5,-3 L9,-4 L9,-15 L3,-15 L3,-5.5 Z" fill="#4A5D27" />
    </svg>
  );
}

// Mirror of scheduling/src/components/SophraRail.tsx. Keep visual + structure
// identical so Beverage and Schedule read as one product family. The Beverage
// tile uses next/link (same-origin); Home and Schedule are cross-subdomain so
// they use plain <a> for a full page nav.
export function SophraRail({
  active = "beverage",
}: {
  active?: "home" | "schedule" | "beverage" | "finance" | "tips";
}) {
  return (
    <aside
      className="hidden sm:flex flex-col items-center gap-1 border-r px-2 py-3.5 shrink-0"
      style={{
        width: 76,
        backgroundColor: "var(--brand-cream)",
        borderColor: "var(--line)",
      }}
    >
      <a
        href={LAUNCHER_URL}
        aria-label="Sophra home"
        className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-[rgba(74,93,39,0.08)]"
      >
        <SophraMark />
      </a>

      <div className="my-1 h-px w-7" style={{ background: "var(--line)" }} />

      <a
        href={LAUNCHER_URL}
        aria-current={active === "home" ? "page" : undefined}
        className="rail-button"
      >
        <Home size={18} strokeWidth={1.75} />
        <span>Home</span>
      </a>

      <a
        href={SCHEDULE_URL}
        aria-current={active === "schedule" ? "page" : undefined}
        className="rail-button"
      >
        <Calendar size={18} strokeWidth={1.75} />
        <span>Schedule</span>
      </a>

      <Link
        href="/dashboard"
        aria-current={active === "beverage" ? "page" : undefined}
        className="rail-button"
      >
        <Wine size={18} strokeWidth={1.75} />
        <span>Beverage</span>
      </Link>

      <Link
        href="/dashboard/finans-lab"
        aria-current={active === "finance" ? "page" : undefined}
        className="rail-button"
      >
        <LineChart size={18} strokeWidth={1.75} />
        <span>Finance</span>
      </Link>

      <a
        href={`${LAUNCHER_URL}/tips`}
        aria-current={active === "tips" ? "page" : undefined}
        className="rail-button"
      >
        <Coins size={18} strokeWidth={1.75} />
        <span>Tips</span>
      </a>

      <span
        aria-disabled="true"
        title="More tools coming"
        className="rail-button rail-button-disabled"
      >
        <Plus size={18} strokeWidth={1.75} />
      </span>
    </aside>
  );
}
