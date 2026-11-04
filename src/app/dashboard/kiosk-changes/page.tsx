import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { loadKioskChanges } from "@/lib/kiosk-changes";
import { KioskChangeLine } from "@/components/product/kiosk-changes-strip";

// Admin: "Recent kiosk changes" — every par / area / shelf / note / remove-mark
// change made from the staff kiosk's press-and-hold menu, newest first.
export const dynamic = "force-dynamic";

export default async function KioskChangesPage() {
  const session = await requireAuth();
  const changes = await loadKioskChanges(session.organizationId, { take: 200 });
  return (
    <div className="h-full overflow-y-auto px-4 lg:px-8 py-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium text-[var(--brand-brown)]">Recent kiosk changes</h1>
            <p className="text-sm text-[var(--ink-muted)]">Changes staff made from the count kiosk (press and hold an item). Pacific time, newest first.</p>
          </div>
          <Link href="/dashboard/products" className="text-sm text-[var(--brand-olive)] hover:underline shrink-0">← Products</Link>
        </div>
        <div className="bg-white border border-[var(--line)] rounded-xl px-4 py-3">
          {changes.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No kiosk changes yet.</p>
          ) : (
            <ul className="space-y-1">
              {changes.map((c) => <KioskChangeLine key={c.id} c={c} showItem />)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
