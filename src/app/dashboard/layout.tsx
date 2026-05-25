import { requireAuth } from "@/lib/session";
import { SophraRail } from "@/components/layout/sophra-rail";
import { SophraTopBar } from "@/components/layout/sophra-top-bar";

// Phase 2 Stage B chrome: SophraRail is the always-visible Sophra tool rail
// on the outermost left (Home / Schedule / Beverage). SophraTopBar replaces
// the old vertical Sidebar — section nav now lives as pill tabs in the top
// bar; Settings moved to the gear icon on the right. Mirrors Schedule's
// (owner)/layout.tsx so the two apps share one chrome.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <div className="flex flex-1 min-h-0">
      <SophraRail active="beverage" />
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        <SophraTopBar
          role={session.role}
          fullName={session.userName}
          permissions={session.permissions}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
