"use server";

// Approve → Approved orders → Ordered → Order history (2026-11-03).
//
// * Approve moves the selected stores' cart lines into the approver's ACTIVE
//   approved list (one normal OrderList per store, status APPROVED, linked by
//   OrderList.approvedOrderId) and empties those carts. Approving again adds
//   into the same list: same store + item + unit (not yet ordered) adds up.
// * Ordered on a vendor card writes that vendor's not-yet-ordered lines into
//   the 8-week history (business date, America/Los_Angeles). Undo removes
//   exactly those entries (they hang off the Ordered event).
// * Clear all moves the list into Order history (last 8 kept). Clearing,
//   restoring and pruning never touch the 8-week history.
// Every step is logged in OrderActivityLog (also drives the live refresh).

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { loadApprovedFor, loadCartFor, shortStore } from "@/lib/order-cart";
import { sourceTag } from "@/lib/order-cart-types";

type Session = Awaited<ReturnType<typeof requireAuth>>;
type Tx = Prisma.TransactionClient;
const STORE_TZ = "America/Los_Angeles";
const HISTORY_KEEP = 8;

function revalidate() {
  revalidatePath("/dashboard/products");
}

async function orderStoreIds(session: Session): Promise<string[]> {
  const rows = await prisma.orderingStoreScope.findMany({
    where: { profileId: session.userId, access: "ORDER", location: { organizationId: session.organizationId } },
    select: { locationId: true },
  });
  return rows.map((r) => r.locationId);
}

function logRow(session: Session, d: Omit<Prisma.OrderActivityLogCreateManyInput, "organizationId" | "actorId" | "actorName" | "actorKind" | "source">) {
  return { organizationId: session.organizationId, actorId: session.userId, actorName: session.userName, actorKind: "manager", source: "approved", ...d };
}

async function fresh(session: Session) {
  const [cart, approved] = await Promise.all([
    loadCartFor(session.organizationId, await orderStoreIds(session)),
    loadApprovedFor(session.organizationId, session.userId),
  ]);
  return { cart, approved };
}

// Today's business date in store time, as a DATE value.
function businessDate(now = new Date()) {
  return new Date(`${now.toLocaleDateString("en-CA", { timeZone: STORE_TZ })}T00:00:00.000Z`);
}

// ---------------------------------------------------------------------------
// Approve (Order Cart → Approved orders)
// ---------------------------------------------------------------------------

export async function approveCart(locationIds: string[]) {
  const session = await requireAuth();
  const mine = new Set(await orderStoreIds(session));
  const stores = [...new Set((Array.isArray(locationIds) ? locationIds : []).filter((id) => mine.has(id)))];
  if (stores.length === 0) return { error: "Pick at least one of your stores in the cart." };

  const locNames = new Map((await prisma.location.findMany({ where: { organizationId: session.organizationId }, select: { id: true, name: true } })).map((l) => [l.id, shortStore(l.name)]));
  const storeName = (id: string | null) => (id ? locNames.get(id) ?? "" : "");
  const now = new Date();

  const result = await prisma.$transaction(
    async (tx) => {
      // One approve at a time per organization: a second tap / device waits,
      // then finds the lines already gone.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"cart-approve:" + session.organizationId}))`;
      const lines = await tx.orderCartLine.findMany({
        where: { organizationId: session.organizationId, locationId: { in: stores } },
        include: { sources: { orderBy: { at: "asc" } } },
      });
      const live = lines.filter((l) => l.qty > 0);
      if (live.length === 0) {
        if (lines.length > 0) await tx.orderCartLine.deleteMany({ where: { id: { in: lines.map((l) => l.id) } } });
        return { approved: 0 };
      }
      const ingredients = new Map(
        (await tx.ingredient.findMany({
          where: { id: { in: [...new Set(live.map((l) => l.ingredientId))] } },
          select: { id: true, name: true, vendor: true, bottleCostCents: true, casePackSize: true, vendorRef: { select: { name: true } } },
        })).map((i) => [i.id, i]),
      );

      // My ACTIVE list (created when missing; unique per person).
      let ao = await tx.approvedOrder.findFirst({
        where: { organizationId: session.organizationId, approvedById: session.userId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!ao) {
        ao = await tx.approvedOrder.create({
          data: { organizationId: session.organizationId, approvedById: session.userId, approvedByName: session.userName, approvedAt: now, firstApprovedAt: now },
          select: { id: true },
        });
      } else {
        await tx.approvedOrder.update({ where: { id: ao.id }, data: { approvedAt: now, approvedByName: session.userName } });
      }

      // One OrderList per store in this approved list.
      const orderIdByStore = new Map<string, string>();
      const orderFor = async (locationId: string) => {
        if (orderIdByStore.has(locationId)) return orderIdByStore.get(locationId)!;
        const existing = await tx.orderList.findFirst({ where: { approvedOrderId: ao!.id, locationId }, select: { id: true } });
        const id = existing?.id ?? (await tx.orderList.create({
          data: {
            organizationId: session.organizationId, locationId, approvedOrderId: ao!.id,
            name: `${storeName(locationId)} - ${now.toLocaleDateString("en-US", { timeZone: STORE_TZ })}`,
            status: "APPROVED", source: "cart",
            createdBy: session.userId, createdByName: session.userName,
            submittedAt: now, submittedById: session.userId, submittedByName: session.userName,
            approvedAt: now, approvedBy: session.userId, approvedByName: session.userName,
          },
          select: { id: true },
        })).id;
        if (existing) await tx.orderList.update({ where: { id }, data: { status: "APPROVED", approvedAt: now, approvedBy: session.userId, approvedByName: session.userName } });
        orderIdByStore.set(locationId, id);
        return id;
      };

      const logs: Prisma.OrderActivityLogCreateManyInput[] = [];
      for (const l of live) {
        const ing = ingredients.get(l.ingredientId);
        const vendor = l.vendor || ing?.vendorRef?.name || ing?.vendor || "No Vendor";
        const moved = l.sources.find((s) => s.kind === "moved_in" && s.fromLocationId && s.fromLocationId !== l.locationId);
        const summary = l.sources.filter((s) => s.kind !== "moved_in").map((s) => sourceTag(s, storeName, null)).join(" + ") || null;
        const orderListId = await orderFor(l.locationId);
        const transferFrom = moved?.fromLocationId ?? null;

        // Same item + unit (+ same transfer) not yet ordered → add into it.
        const same = await tx.orderListItem.findFirst({
          where: { orderListId, ingredientId: l.ingredientId, unit: l.unit, orderedEventId: null, status: { not: "REJECTED" }, transferFromLocationId: transferFrom },
          select: { id: true, quantityNeeded: true, sourceSummary: true },
        });
        if (same) {
          await tx.orderListItem.update({
            where: { id: same.id },
            data: {
              quantityNeeded: Math.round((same.quantityNeeded + l.qty) * 100) / 100,
              sourceSummary: [same.sourceSummary, summary].filter(Boolean).join(" + ") || null,
            },
          });
        } else {
          await tx.orderListItem.create({
            data: {
              orderListId, ingredientId: l.ingredientId, vendor, quantityNeeded: l.qty, unit: l.unit, status: "PENDING",
              source: "cart", sourceSummary: summary,
              countedStock: l.sources.find((s) => s.countedStock !== null)?.countedStock ?? null,
              parSnapshot: l.sources.find((s) => s.parSnapshot !== null)?.parSnapshot ?? null,
              ...(transferFrom
                ? {
                    transferFromLocationId: transferFrom, transferToLocationId: l.locationId,
                    transferNote: `FOR ${storeName(transferFrom).toUpperCase()} · TRANSFER`, transferStatus: "PENDING",
                    movedById: moved?.actorId ?? null, movedByName: moved?.actorName ?? null, movedAt: moved?.at ?? now,
                    unitCostCentsSnapshot: ing?.bottleCostCents ?? null, casePackSizeSnapshot: ing?.casePackSize ?? null,
                  }
                : {}),
            },
          });
        }
        logs.push(logRow(session, {
          locationId: l.locationId, orderListId, ingredientId: l.ingredientId, entity: "LINE", action: "approve_line",
          newValue: `${l.qty} ${l.unit}`, note: summary,
        }));
      }

      // Desktop counts are committed to inventory on approve (as the old
      // manager "Submit" did). Kiosk counts never touch stock (unchanged).
      for (const l of live) {
        for (const s of l.sources) {
          if (s.kind !== "desktop" || s.countedStock === null) continue;
          const inv = await tx.inventoryItem.findUnique({
            where: { locationId_ingredientId: { locationId: l.locationId, ingredientId: l.ingredientId } },
            select: { id: true },
          });
          if (!inv) continue;
          await tx.inventoryItem.update({ where: { id: inv.id }, data: { currentStock: s.countedStock, lastCountedAt: s.at } });
          await tx.stockCount.create({ data: { inventoryItemId: inv.id, count: s.countedStock, countedAt: s.at, countedBy: s.actorName || session.userName } });
        }
      }

      await tx.orderCartLine.deleteMany({ where: { id: { in: lines.map((l) => l.id) } } });
      for (const loc of new Set(live.map((l) => l.locationId))) {
        logs.push(logRow(session, {
          locationId: loc, orderListId: orderIdByStore.get(loc), entity: "ORDER", action: "approve_cart",
          note: `${live.filter((l) => l.locationId === loc).length} line(s) approved from the Order Cart`,
        }));
      }
      await tx.orderActivityLog.createMany({ data: logs });
      return { approved: live.length };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );

  revalidate();
  if (result.approved === 0) return { error: "Nothing to approve — the cart for these stores is empty (it may have just been approved).", ...(await fresh(session)) };
  return { success: true, approvedCount: result.approved, ...(await fresh(session)) };
}

// ---------------------------------------------------------------------------
// Ordered / Undo (per vendor card)
// ---------------------------------------------------------------------------

async function myApproved(session: Session, approvedOrderId: string, statuses: string[]) {
  return prisma.approvedOrder.findFirst({
    where: { id: approvedOrderId, organizationId: session.organizationId, approvedById: session.userId, status: { in: statuses } },
    select: { id: true },
  });
}

async function syncOrderListStatus(tx: Tx, approvedOrderId: string) {
  const lists = await tx.orderList.findMany({
    where: { approvedOrderId },
    select: { id: true, items: { where: { status: { not: "REJECTED" } }, select: { orderedEventId: true } } },
  });
  for (const o of lists) {
    const all = o.items.length > 0 && o.items.every((i) => i.orderedEventId);
    await tx.orderList.update({ where: { id: o.id }, data: { status: all ? "ORDERED" : "APPROVED" } });
  }
}

export async function markVendorOrdered(approvedOrderId: string, vendorName: string) {
  const session = await requireAuth();
  if (typeof vendorName !== "string" || !vendorName) return { error: "Vendor missing." };
  if (!(await myApproved(session, approvedOrderId, ["ACTIVE"]))) return { error: "This approved list changed — refresh the page." };
  const now = new Date();
  const day = businessDate(now);

  const written = await prisma.$transaction(async (tx) => {
    // Double-tap / two devices: one at a time per approved list; the second
    // finds nothing left to mark.
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"ordered:" + approvedOrderId}))`;
    const items = await tx.orderListItem.findMany({
      where: { orderList: { approvedOrderId }, orderedEventId: null, status: { not: "REJECTED" } },
      select: {
        id: true, ingredientId: true, quantityNeeded: true, unit: true, vendor: true,
        orderList: { select: { locationId: true } },
        ingredient: { select: { casePackSize: true, vendor: true, vendorRef: { select: { name: true } } } },
      },
    });
    const mine = items.filter((i) => (i.vendor || i.ingredient.vendorRef?.name || i.ingredient.vendor || "No Vendor") === vendorName);
    if (mine.length === 0) return 0;
    const ev = await tx.orderOrderedEvent.create({
      data: { approvedOrderId, vendorName, orderedAt: now, orderedById: session.userId, orderedByName: session.userName },
      select: { id: true },
    });
    await tx.orderListItem.updateMany({ where: { id: { in: mine.map((i) => i.id) } }, data: { orderedEventId: ev.id } });
    await tx.orderHistoryEntry.createMany({
      data: mine.map((i) => {
        const cps = i.ingredient.casePackSize ?? 0;
        const qtyCases = i.unit === "case" ? i.quantityNeeded : cps > 1 ? Math.round((i.quantityNeeded / cps) * 1000) / 1000 : null;
        return {
          organizationId: session.organizationId, locationId: i.orderList.locationId, ingredientId: i.ingredientId,
          businessDate: day, qty: i.quantityNeeded, unit: i.unit, qtyCases, orderedEventId: ev.id, orderListItemId: i.id, source: "ordered",
        };
      }),
    });
    await syncOrderListStatus(tx, approvedOrderId);
    await tx.orderActivityLog.createMany({
      data: [...new Set(mine.map((i) => i.orderList.locationId))].map((loc) =>
        logRow(session, { locationId: loc, entity: "VENDOR", action: "ordered", note: `${vendorName} · ${mine.filter((i) => i.orderList.locationId === loc).length} line(s) added to 8-week history` }),
      ),
    });
    return mine.length;
  });
  revalidate();
  return { success: true, written, ...(await fresh(session)) };
}

// Undo: removes exactly the history entries that Ordered tap wrote (they are
// deleted with the event) and puts the lines back to not-ordered.
export async function undoVendorOrdered(approvedOrderId: string, vendorName: string) {
  const session = await requireAuth();
  if (!(await myApproved(session, approvedOrderId, ["ACTIVE"]))) return { error: "This approved list changed — refresh the page." };
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"ordered:" + approvedOrderId}))`;
    const events = await tx.orderOrderedEvent.findMany({ where: { approvedOrderId, vendorName }, select: { id: true } });
    if (events.length === 0) return;
    const ids = events.map((e) => e.id);
    await tx.orderListItem.updateMany({ where: { orderedEventId: { in: ids } }, data: { orderedEventId: null } });
    await tx.orderHistoryEntry.deleteMany({ where: { orderedEventId: { in: ids } } });
    await tx.orderOrderedEvent.deleteMany({ where: { id: { in: ids } } });
    await syncOrderListStatus(tx, approvedOrderId);
    await tx.orderActivityLog.create({ data: logRow(session, { entity: "VENDOR", action: "undo_ordered", note: `${vendorName} · removed from 8-week history` }) as Prisma.OrderActivityLogUncheckedCreateInput });
  });
  revalidate();
  return { success: true, ...(await fresh(session)) };
}

// ---------------------------------------------------------------------------
// Clear all / Order history / Restore
// ---------------------------------------------------------------------------

// Keep the newest 8 cleared lists; older ones are hidden (status PRUNED) —
// their order rows and 8-week history entries stay untouched.
async function prune(tx: Tx, session: Session) {
  const cleared = await tx.approvedOrder.findMany({
    where: { organizationId: session.organizationId, approvedById: session.userId, status: "CLEARED" },
    orderBy: { clearedAt: "desc" },
    select: { id: true },
  });
  const extra = cleared.slice(HISTORY_KEEP).map((c) => c.id);
  if (extra.length > 0) await tx.approvedOrder.updateMany({ where: { id: { in: extra } }, data: { status: "PRUNED" } });
}

export async function clearApproved(approvedOrderId: string) {
  const session = await requireAuth();
  if (!(await myApproved(session, approvedOrderId, ["ACTIVE"]))) return { error: "This approved list changed — refresh the page.", ...(await fresh(session)) };
  await prisma.$transaction(async (tx) => {
    const res = await tx.approvedOrder.updateMany({
      where: { id: approvedOrderId, status: "ACTIVE" },
      data: { status: "CLEARED", clearedAt: new Date(), clearedByName: session.userName },
    });
    if (res.count === 0) return;
    await prune(tx, session);
    await tx.orderActivityLog.create({ data: logRow(session, { entity: "APPROVED", action: "clear_all", note: "Moved to Order history" }) as Prisma.OrderActivityLogUncheckedCreateInput });
  });
  revalidate();
  return { success: true, ...(await fresh(session)) };
}

// Restore an Order history entry into Approved orders (with its Ordered
// states). If a list is already showing: replace=false asks first; replace=true
// sends the current list to Order history.
export async function restoreApproved(approvedOrderId: string, replace = false) {
  const session = await requireAuth();
  if (!(await myApproved(session, approvedOrderId, ["CLEARED"]))) return { error: "That order is no longer in Order history.", ...(await fresh(session)) };
  const current = await prisma.approvedOrder.findFirst({
    where: { organizationId: session.organizationId, approvedById: session.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (current && !replace) return { needsConfirm: true as const };
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.approvedOrder.update({ where: { id: current.id }, data: { status: "CLEARED", clearedAt: now, clearedByName: session.userName } });
    }
    await tx.approvedOrder.update({ where: { id: approvedOrderId }, data: { status: "ACTIVE", clearedAt: null, clearedByName: null } });
    await prune(tx, session);
    await tx.orderActivityLog.create({ data: logRow(session, { entity: "APPROVED", action: "restore", note: current ? "Restored from Order history (current list moved to history)" : "Restored from Order history" }) as Prisma.OrderActivityLogUncheckedCreateInput });
  });
  revalidate();
  return { success: true, ...(await fresh(session)) };
}
