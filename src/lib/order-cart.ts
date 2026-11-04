// Shared Order Cart (2026-11-03) — server-only helpers used by the admin Order
// tab AND the staff kiosk. One cart line per store + item + unit; every add
// (kiosk send, desktop count, move, migrated order) is a source row on it.
//
// Merge rules (Refet):
//   * same item + same store + same unit → quantities ADD into one line
//     (kiosk 2cs + desktop 1cs = 3cs; a second kiosk count adds too)
//   * different unit (cs vs btl) → separate lines, never converted
//   * a person's desktop part is replaced when they re-type their count
//     (only the difference is applied to the line)
//
// order_cart_source.from_location_id: for kiosk rows = the store that counted;
// for moved_in rows = the store that needed the item (transfer "FOR <store>").

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { shortStore, type ApprovedOrderDTO, type CartLineDTO, type CartRequestDTO } from "@/lib/order-cart-types";
export { shortStore };

type Tx = Prisma.TransactionClient;

export type CartUnit = "case" | "bottle";
export type CartSourceKind = "kiosk" | "desktop" | "migrated" | "moved_in" | "add";

export type CartSourceInput = {
  kind: CartSourceKind;
  actorId?: string | null;
  actorName?: string | null;
  countedStock?: number | null;
  parSnapshot?: number | null;
  fromLocationId?: string | null;
  at?: Date;
};

export function roundQty(n: number) {
  return Math.round(n * 100) / 100;
}

// Add qty into the store's line for this item+unit (created when missing).
export async function addToCartLine(
  tx: Tx,
  a: { organizationId: string; locationId: string; ingredientId: string; unit: CartUnit; qty: number; vendor: string | null },
  source: CartSourceInput,
): Promise<string> {
  const qty = roundQty(a.qty);
  const now = source.at ?? new Date();
  // Insert-or-add in one statement so two phones sending together can't make
  // two lines (unique store + item + unit).
  const rows = await tx.$queryRaw<{ id: string }[]>`
    insert into beverage.order_cart_line (organization_id, location_id, ingredient_id, unit, qty, vendor, updated_at)
    values (${a.organizationId}, ${a.locationId}, ${a.ingredientId}, ${a.unit}, ${qty}, ${a.vendor}, ${now})
    on conflict (location_id, ingredient_id, unit)
    do update set qty = beverage.order_cart_line.qty + excluded.qty, updated_at = excluded.updated_at,
                  vendor = coalesce(beverage.order_cart_line.vendor, excluded.vendor)
    returning id`;
  const lineId = rows[0].id;
  await tx.orderCartSource.create({
    data: {
      lineId,
      kind: source.kind,
      qty,
      actorId: source.actorId ?? null,
      actorName: source.actorName ?? null,
      countedStock: source.countedStock ?? null,
      parSnapshot: source.parSnapshot ?? null,
      fromLocationId: source.fromLocationId ?? null,
      at: now,
    },
  });
  return lineId;
}

// A person's desktop count for one store + item. Their earlier desktop part
// (if any) is replaced: the line moves by the difference. qty 0 = their part
// goes away (the line stays if kiosk/other parts remain).
export async function setDesktopPart(
  tx: Tx,
  a: {
    organizationId: string; locationId: string; ingredientId: string; unit: CartUnit; qty: number; vendor: string | null;
    actorId: string; actorName: string; countedStock: number | null; parSnapshot: number | null;
  },
) {
  const qty = roundQty(Math.max(0, a.qty));
  const mine = await tx.orderCartSource.findFirst({
    where: { kind: "desktop", actorId: a.actorId, line: { locationId: a.locationId, ingredientId: a.ingredientId } },
    select: { id: true, qty: true, line: { select: { id: true, qty: true, unit: true } } },
  });

  if (mine) {
    const delta = roundQty(qty - mine.qty);
    const newLineQty = roundQty(mine.line.qty + delta);
    if (qty === 0) await tx.orderCartSource.delete({ where: { id: mine.id } });
    else await tx.orderCartSource.update({
      where: { id: mine.id },
      data: { qty, countedStock: a.countedStock, parSnapshot: a.parSnapshot, at: new Date() },
    });
    if (newLineQty <= 0) await tx.orderCartLine.delete({ where: { id: mine.line.id } });
    else if (delta !== 0) await tx.orderCartLine.update({ where: { id: mine.line.id }, data: { qty: newLineQty, updatedAt: new Date() } });
    return;
  }
  if (qty === 0) return;
  await addToCartLine(tx, a, {
    kind: "desktop", actorId: a.actorId, actorName: a.actorName, countedStock: a.countedStock, parSnapshot: a.parSnapshot,
  });
}

// Fold line `fromId` into an existing line `intoId` (same store + item + unit):
// quantities add, sources move over.
export async function mergeCartLines(tx: Tx, fromId: string, intoId: string, fromQty: number) {
  await tx.orderCartSource.updateMany({ where: { lineId: fromId }, data: { lineId: intoId } });
  await tx.orderCartLine.delete({ where: { id: fromId } });
  await tx.$executeRaw`update beverage.order_cart_line set qty = qty + ${roundQty(fromQty)}, updated_at = now() where id = ${intoId}`;
}


// The cart for these stores (caller must already have checked access).
export async function loadCartFor(organizationId: string, locationIds: string[]): Promise<{ lines: CartLineDTO[]; requests: CartRequestDTO[] }> {
  if (locationIds.length === 0) return { lines: [], requests: [] };
  const [lines, requests] = await Promise.all([
    prisma.orderCartLine.findMany({
      where: { organizationId, locationId: { in: locationIds } },
      orderBy: { createdAt: "asc" },
      include: { sources: { orderBy: { at: "asc" } } },
    }),
    prisma.orderStaffRequest.findMany({
      where: { organizationId, locationId: { in: locationIds }, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, locationId: true, text: true, requestedByName: true, createdAt: true },
    }),
  ]);
  const names = new Map(
    (await prisma.ingredient.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.ingredientId))] } }, select: { id: true, name: true } }))
      .map((i) => [i.id, i.name]),
  );
  return {
    lines: lines.map((l) => ({
      id: l.id,
      locationId: l.locationId,
      ingredientId: l.ingredientId,
      name: names.get(l.ingredientId) ?? "Unknown item",
      unit: l.unit === "case" ? "case" : "bottle",
      qty: l.qty,
      vendor: l.vendor,
      updatedAt: l.updatedAt.toISOString(),
      sources: l.sources.map((s) => ({
        kind: s.kind, qty: s.qty, actorId: s.actorId, actorName: s.actorName, countedStock: s.countedStock,
        parSnapshot: s.parSnapshot, fromLocationId: s.fromLocationId, at: s.at.toISOString(),
      })),
    })),
    requests: requests.map((r) => ({ id: r.id, locationId: r.locationId, text: r.text, byName: r.requestedByName, at: r.createdAt.toISOString() })),
  };
}


// ===== Approved orders loader =====
// The person's ACTIVE approved list + their Order history (CLEARED, newest
// first, at most 8). Each approve writes normal OrderList/OrderListItem rows
// (one per store) linked by OrderList.approvedOrderId.
export async function loadApprovedFor(organizationId: string, userId: string): Promise<{ active: ApprovedOrderDTO | null; history: ApprovedOrderDTO[] }> {
  const rows = await prisma.approvedOrder.findMany({
    where: { organizationId, approvedById: userId, status: { in: ["ACTIVE", "CLEARED"] } },
    orderBy: [{ clearedAt: "desc" }],
    include: {
      events: { orderBy: { orderedAt: "asc" } },
      orderLists: {
        select: {
          locationId: true,
          items: {
            where: { status: { not: "REJECTED" } },
            select: {
              id: true, quantityNeeded: true, unit: true, vendor: true, orderedEventId: true, sourceSummary: true,
              transferFromLocationId: true,
              ingredient: { select: { name: true, vendor: true, vendorRef: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  const toDTO = (r: (typeof rows)[number]): ApprovedOrderDTO => ({
    id: r.id,
    status: r.status === "CLEARED" ? "CLEARED" : "ACTIVE",
    approvedByName: r.approvedByName,
    approvedAt: r.approvedAt.toISOString(),
    firstApprovedAt: r.firstApprovedAt.toISOString(),
    clearedAt: r.clearedAt?.toISOString() ?? null,
    clearedByName: r.clearedByName,
    events: r.events.map((e) => ({ id: e.id, vendorName: e.vendorName, orderedAt: e.orderedAt.toISOString(), orderedByName: e.orderedByName })),
    lines: r.orderLists.flatMap((o) =>
      o.items.map((i) => ({
        id: i.id,
        locationId: o.locationId,
        vendor: i.vendor || i.ingredient.vendorRef?.name || i.ingredient.vendor || "No Vendor",
        name: i.ingredient.name,
        qty: i.quantityNeeded,
        unit: i.unit === "case" ? ("case" as const) : ("bottle" as const),
        orderedEventId: i.orderedEventId,
        sourceSummary: i.sourceSummary,
        transferForLocationId: i.transferFromLocationId,
      })),
    ),
  });
  const active = rows.find((r) => r.status === "ACTIVE");
  const history = rows
    .filter((r) => r.status === "CLEARED")
    .sort((a, b) => (b.clearedAt?.getTime() ?? 0) - (a.clearedAt?.getTime() ?? 0))
    .slice(0, 8);
  return { active: active ? toDTO(active) : null, history: history.map(toDTO) };
}
