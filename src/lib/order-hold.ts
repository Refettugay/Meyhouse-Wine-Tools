// "Hold until next order" + merging one store's orders into one.
//
// A held order (status HELD) waits off the Review list. The next count for
// that store (staff "Send to manager" or a manager submit) brings it back:
// its lines join the open order, and for a product in both, the NEWER count
// wins. Plain helpers (not server actions) — callers check rights first.

import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
export type LogActor = Pick<Prisma.OrderActivityLogCreateManyInput, "actorId" | "actorName" | "actorKind" | "source">;

// Move everything from the OLDER order into the NEWER one, then delete the
// older order. Same product (not a transfer line) in both → the newer line
// stays, the older one goes. Returns how many older lines were replaced.
export async function mergeOrderInto(tx: Tx, olderId: string, newerId: string): Promise<{ moved: number; replaced: number }> {
  const [older, newer] = await Promise.all([
    tx.orderListItem.findMany({ where: { orderListId: olderId }, select: { id: true, ingredientId: true, transferFromLocationId: true } }),
    tx.orderListItem.findMany({ where: { orderListId: newerId }, select: { ingredientId: true, transferFromLocationId: true } }),
  ]);
  const inNewer = new Set(newer.filter((l) => !l.transferFromLocationId).map((l) => l.ingredientId));
  const replace = older.filter((l) => !l.transferFromLocationId && inNewer.has(l.ingredientId)).map((l) => l.id);
  const move = older.filter((l) => !replace.includes(l.id)).map((l) => l.id);
  if (replace.length) await tx.orderListItem.deleteMany({ where: { id: { in: replace } } });
  if (move.length) await tx.orderListItem.updateMany({ where: { id: { in: move } }, data: { orderListId: newerId } });
  await tx.orderCountEntry.updateMany({ where: { orderListId: olderId }, data: { orderListId: newerId } });
  await tx.orderStaffRequest.updateMany({ where: { orderListId: olderId }, data: { orderListId: newerId } });
  await tx.orderList.delete({ where: { id: olderId } });
  return { moved: move.length, replaced: replace.length };
}

// Bring a store's held order(s) back before a new count lands. If the store
// already has an open (SUBMITTED) order, the held lines merge into it (the
// open order is newer, so it wins); otherwise the newest held order simply
// reopens. Returns the open order id, or null when nothing was held.
export async function absorbHeld(tx: Tx, organizationId: string, locationId: string, actor: LogActor): Promise<string | null> {
  const held = await tx.orderList.findMany({
    where: { organizationId, locationId, status: "HELD" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (held.length === 0) return null;
  const open = await tx.orderList.findFirst({
    where: { organizationId, locationId, status: "SUBMITTED" },
    orderBy: { submittedAt: "desc" },
    select: { id: true },
  });
  let targetId: string;
  let rest = held;
  if (open) {
    targetId = open.id;
  } else {
    targetId = held[0].id;
    rest = held.slice(1);
    await tx.orderList.update({ where: { id: targetId }, data: { status: "SUBMITTED" } });
  }
  const logs: Prisma.OrderActivityLogCreateManyInput[] = [];
  for (const h of rest) {
    const r = await mergeOrderInto(tx, h.id, targetId);
    logs.push({
      organizationId, locationId, orderListId: targetId, entity: "ORDER", action: "merge_held", ...actor,
      note: `Held order joined this order: ${r.moved} line(s) kept, ${r.replaced} replaced by the newer count`,
    });
  }
  if (!open) {
    logs.push({ organizationId, locationId, orderListId: targetId, entity: "ORDER", action: "unhold", field: "status", oldValue: "HELD", newValue: "SUBMITTED", ...actor, note: "Back for the next order" });
  }
  await tx.orderActivityLog.createMany({ data: logs });
  return targetId;
}
