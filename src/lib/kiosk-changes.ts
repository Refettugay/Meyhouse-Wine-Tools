// Kiosk item changes (press-and-hold menu) as shown in Admin. Server-only —
// reads the ordering activity log (source staff_count, entity PRODUCT).
import { prisma } from "@/lib/db";

import type { KioskChange } from "@/lib/kiosk-changes-types";
export type { KioskChange };

const FIELD: Record<string, string> = {
  par: "Par", area1: "Area 1", shelf1: "Shelf 1", area2: "Area 2", shelf2: "Shelf 2", note: "Note",
  markedForRemoval: "Remove mark",
};
const ACTION: Record<string, string> = {
  mark_to_remove: "Remove mark", cancel_phase_out: "Remove mark",
  move_to_database: "Moved to Product Database", hard_delete: "Permanently deleted",
};

export async function loadKioskChanges(orgId: string, opts: { ingredientId?: string; take?: number } = {}): Promise<KioskChange[]> {
  const rows = await prisma.orderActivityLog.findMany({
    where: {
      organizationId: orgId,
      source: "staff_count",
      entity: "PRODUCT",
      ...(opts.ingredientId ? { ingredientId: opts.ingredientId } : {}),
    },
    orderBy: { at: "desc" },
    take: Math.min(opts.take ?? 50, 300),
    select: { id: true, at: true, locationId: true, actorName: true, note: true, ingredientId: true, action: true, field: true, oldValue: true, newValue: true },
  });
  const locIds = [...new Set(rows.map((r) => r.locationId).filter((x): x is string => !!x))];
  const locs = locIds.length ? await prisma.location.findMany({ where: { id: { in: locIds } }, select: { id: true, name: true } }) : [];
  const storeName = (id: string | null) => (locs.find((l) => l.id === id)?.name ?? "").replace("Meyhouse ", "");
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    store: storeName(r.locationId),
    who: r.actorName || "Staff",
    item: r.note || "",
    ingredientId: r.ingredientId,
    what: (r.field && FIELD[r.field]) || ACTION[r.action] || r.action,
    from: r.oldValue,
    to: r.newValue,
  }));
}
