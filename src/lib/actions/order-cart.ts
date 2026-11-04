"use server";

// Order Cart actions (2026-11-03). The cart is shared per store: everyone with
// ORDER access to a store (Admin → store access) sees and edits that store's
// lines. The admin picks which of their stores the cart shows; nothing here
// ever touches a store the person can't order for.

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { canOrderForStore } from "@/lib/ordering-scope";
import { revalidatePath } from "next/cache";
import { effectiveUnit, orderQty } from "@/lib/ordering-math";
import { loadCartFor, mergeCartLines, roundQty, setDesktopPart, shortStore, type CartUnit } from "@/lib/order-cart";
import type { CartViewer } from "@/lib/order-cart-types";

type Session = Awaited<ReturnType<typeof requireAuth>>;

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

function log(session: Session, d: { locationId: string; ingredientId?: string | null; action: string; field?: string; oldValue?: string | null; newValue?: string | null; note?: string | null }) {
  return prisma.orderActivityLog.create({
    data: {
      organizationId: session.organizationId, actorId: session.userId, actorName: session.userName, actorKind: "manager",
      source: "cart", entity: "CART", ...d,
    },
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function loadCart() {
  const session = await requireAuth();
  return loadCartFor(session.organizationId, await orderStoreIds(session));
}

// "<name> is also viewing <store>": record that I'm looking at these stores,
// return the others seen in the last minute.
export async function cartHeartbeat(locationIds: string[]): Promise<CartViewer[]> {
  const session = await requireAuth();
  const mine = new Set(await orderStoreIds(session));
  const ids = (Array.isArray(locationIds) ? locationIds : []).filter((id) => mine.has(id));
  if (ids.length === 0) return [];
  const now = new Date();
  await prisma.$transaction(
    ids.map((locationId) =>
      prisma.orderCartPresence.upsert({
        where: { userId_locationId: { userId: session.userId, locationId } },
        create: { userId: session.userId, locationId, userName: session.userName, seenAt: now },
        update: { userName: session.userName, seenAt: now },
      }),
    ),
  );
  const others = await prisma.orderCartPresence.findMany({
    where: { locationId: { in: ids }, userId: { not: session.userId }, seenAt: { gte: new Date(now.getTime() - 60_000) } },
    select: { userName: true, locationId: true },
  });
  return others.map((o) => ({ name: o.userName || "Someone", locationId: o.locationId }));
}

// ---------------------------------------------------------------------------
// Line edits (each returns the fresh cart for the person's stores)
// ---------------------------------------------------------------------------

async function lineForEdit(lineId: string) {
  const session = await requireAuth();
  const line = await prisma.orderCartLine.findFirst({
    where: { id: lineId, organizationId: session.organizationId },
    include: { sources: true },
  });
  if (!line) return { error: "This line is no longer in the cart (it may have just been approved)." as const };
  if (!(await canOrderForStore(session.userId, line.locationId))) return { error: "You can view this store but not order for it." as const };
  return { session, line };
}

async function done(session: Session) {
  revalidate();
  return { success: true as const, cart: await loadCartFor(session.organizationId, await orderStoreIds(session)) };
}

export async function cartSetQty(lineId: string, qty: number) {
  const r = await lineForEdit(lineId);
  if ("error" in r) return { error: r.error };
  const { session, line } = r;
  const n = roundQty(Number(qty));
  if (!Number.isFinite(n) || n < 0 || n > 9999) return { error: "Enter a quantity from 0 to 9999." };
  if (n === line.qty) return done(session);
  // 0 = remove the line (never approved).
  if (n === 0) {
    await prisma.orderCartLine.delete({ where: { id: line.id } });
  } else {
    await prisma.orderCartLine.update({ where: { id: line.id }, data: { qty: n, updatedAt: new Date() } });
  }
  await log(session, { locationId: line.locationId, ingredientId: line.ingredientId, action: n === 0 ? "remove" : "edit_qty", field: "qty", oldValue: `${line.qty} ${line.unit}`, newValue: `${n} ${line.unit}` });
  return done(session);
}

// CS/BTL for this line. If the store already has a line for the item in the
// other unit, the two merge (same number, no conversion — like today's cart).
export async function cartSetUnit(lineId: string, unit: CartUnit) {
  if (unit !== "case" && unit !== "bottle") return { error: "Invalid unit" };
  const r = await lineForEdit(lineId);
  if ("error" in r) return { error: r.error };
  const { session, line } = r;
  if (line.unit === unit) return done(session);
  await prisma.$transaction(async (tx) => {
    const other = await tx.orderCartLine.findUnique({
      where: { locationId_ingredientId_unit: { locationId: line.locationId, ingredientId: line.ingredientId, unit } },
      select: { id: true },
    });
    if (other) await mergeCartLines(tx, line.id, other.id, line.qty);
    else await tx.orderCartLine.update({ where: { id: line.id }, data: { unit, updatedAt: new Date() } });
  });
  await log(session, { locationId: line.locationId, ingredientId: line.ingredientId, action: "switch_unit", field: "unit", oldValue: line.unit, newValue: unit });
  return done(session);
}

export async function cartRemoveLine(lineId: string) {
  return cartSetQty(lineId, 0);
}

// "Move to <store>": the line's store changes. Same item+unit already in the
// target store → quantities add. Recorded as a transfer (FOR <from store>) so
// the Transfers tab keeps working once the order is approved.
export async function cartMoveLine(lineId: string, toLocationId: string) {
  const r = await lineForEdit(lineId);
  if ("error" in r) return { error: r.error };
  const { session, line } = r;
  if (toLocationId === line.locationId) return done(session);
  const [dest, from] = await Promise.all([
    prisma.location.findFirst({ where: { id: toLocationId, organizationId: session.organizationId }, select: { name: true } }),
    prisma.location.findUnique({ where: { id: line.locationId }, select: { name: true } }),
  ]);
  if (!dest) return { error: "Store not found." };
  if (!(await canOrderForStore(session.userId, toLocationId))) return { error: `You can't order for ${shortStore(dest.name)}.` };

  await prisma.$transaction(async (tx) => {
    const target = await tx.orderCartLine.findUnique({
      where: { locationId_ingredientId_unit: { locationId: toLocationId, ingredientId: line.ingredientId, unit: line.unit } },
      select: { id: true },
    });
    let destId = line.id;
    if (target) {
      await mergeCartLines(tx, line.id, target.id, line.qty);
      destId = target.id;
    } else {
      await tx.orderCartLine.update({ where: { id: line.id }, data: { locationId: toLocationId, updatedAt: new Date() } });
    }
    // Lines moved more than once keep their first "needed by" store.
    const alreadyMoved = line.sources.find((s) => s.kind === "moved_in");
    const neededBy = alreadyMoved?.fromLocationId ?? line.locationId;
    if (neededBy !== toLocationId) {
      await tx.orderCartSource.create({
        data: { lineId: destId, kind: "moved_in", qty: line.qty, actorId: session.userId, actorName: session.userName, fromLocationId: neededBy },
      });
    }
  });
  await log(session, {
    locationId: toLocationId, ingredientId: line.ingredientId, action: "move", field: "store",
    oldValue: shortStore(from?.name ?? ""), newValue: shortStore(dest.name), note: `${line.qty} ${line.unit}`,
  });
  return done(session);
}

// Clear the cart for the given (selected) stores.
export async function cartClear(locationIds: string[]) {
  const session = await requireAuth();
  const mine = new Set(await orderStoreIds(session));
  const ids = (Array.isArray(locationIds) ? locationIds : []).filter((id) => mine.has(id));
  if (ids.length === 0) return done(session);
  const res = await prisma.orderCartLine.deleteMany({ where: { organizationId: session.organizationId, locationId: { in: ids } } });
  for (const locationId of ids) await log(session, { locationId, action: "clear_cart", note: `${res.count} line(s) removed` });
  return done(session);
}

// ---------------------------------------------------------------------------
// Desktop counts (Count & build table) → this person's part of the line
// ---------------------------------------------------------------------------

export type DesktopCount = { locationId: string; ingredientId: string; counted: number | null; qty?: number; unit?: CartUnit };

// counted = the count typed in the table (null = cleared). qty/unit = an
// explicit order amount typed in the table's Order column (overrides par math).
export async function cartSetDesktopCounts(counts: DesktopCount[]) {
  const session = await requireAuth();
  const mine = new Set(await orderStoreIds(session));
  const list = (Array.isArray(counts) ? counts : []).filter((c) => c && mine.has(c.locationId) && typeof c.ingredientId === "string");
  if (list.length === 0) return done(session);

  const inv = await prisma.inventoryItem.findMany({
    where: { organizationId: session.organizationId, OR: list.map((c) => ({ locationId: c.locationId, ingredientId: c.ingredientId })) },
    select: {
      locationId: true, ingredientId: true, parLevel: true,
      ingredient: { select: { orderUnit: true, casePackSize: true, vendor: true, vendorRef: { select: { name: true } } } },
    },
  });

  await prisma.$transaction(async (tx) => {
    for (const c of list) {
      const i = inv.find((x) => x.locationId === c.locationId && x.ingredientId === c.ingredientId);
      if (!i) continue;
      const u = effectiveUnit(i.ingredient.orderUnit, i.ingredient.casePackSize);
      let unit: CartUnit = c.unit ?? (u === "CASE" ? "case" : "bottle");
      let qty: number;
      if (typeof c.qty === "number" && Number.isFinite(c.qty)) qty = Math.max(0, c.qty);
      else if (c.counted === null || !Number.isFinite(Number(c.counted))) qty = 0;
      else qty = orderQty(i.parLevel, Number(c.counted), u, i.ingredient.casePackSize);
      if (c.unit) unit = c.unit;
      await setDesktopPart(tx, {
        organizationId: session.organizationId, locationId: c.locationId, ingredientId: c.ingredientId, unit, qty,
        vendor: i.ingredient.vendorRef?.name || i.ingredient.vendor || null,
        actorId: session.userId, actorName: session.userName,
        countedStock: c.counted === null ? null : Number(c.counted), parSnapshot: i.parLevel,
      });
    }
  }, { timeout: 30_000, maxWait: 10_000 });
  return done(session);
}

// Staff notes from the kiosk ("write what you need") shown in the cart.
export async function cartResolveRequest(requestId: string, status: "ADDED" | "DISMISSED") {
  const session = await requireAuth();
  if (status !== "ADDED" && status !== "DISMISSED") return { error: "Invalid status" };
  const req = await prisma.orderStaffRequest.findFirst({
    where: { id: requestId, organizationId: session.organizationId },
    select: { id: true, locationId: true, text: true, status: true },
  });
  if (!req) return { error: "Note not found." };
  if (!(await canOrderForStore(session.userId, req.locationId))) return { error: "You can view this store but not change it." };
  await prisma.orderStaffRequest.update({
    where: { id: req.id },
    data: { status, resolvedById: session.userId, resolvedByName: session.userName, resolvedAt: new Date() },
  });
  await log(session, { locationId: req.locationId, action: status === "ADDED" ? "request_done" : "request_dismiss", note: req.text });
  return done(session);
}

