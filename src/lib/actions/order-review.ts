"use server";

// Review & approve (Staff Ordering phase 4). One open order (SUBMITTED) per
// store; a reviewer edits lines, moves lines between stores (transfers),
// approves, then copies one email per store per vendor and marks it sent.
// Emails are NEVER sent automatically. Every change is logged in
// OrderActivityLog (who, when, old → new).
//
// Rights: owners/admins for every store, plus whoever ORDERS for the store.
//
// Transfer columns keep their existing meaning (see schema):
//   transferFromLocationId = the store that needs the item (where the line came from)
//   transferToLocationId   = the store whose order now carries it (orders it from the vendor)
// The line shows "FOR <from store> · TRANSFER"; goods later move to → from.

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { canManageStoreOrders } from "@/lib/ordering-scope";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { absorbHeld, mergeOrderInto } from "@/lib/order-hold";

type Session = Awaited<ReturnType<typeof requireAuth>>;
type Tx = Prisma.TransactionClient;
const STORE_TZ = "America/Los_Angeles";

function short(name: string) {
  return name.replace("Meyhouse ", "");
}

function revalidate() {
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory/orders");
}

function logData(session: Session, d: Omit<Prisma.OrderActivityLogCreateManyInput, "organizationId" | "actorId" | "actorName" | "actorKind">) {
  return {
    organizationId: session.organizationId,
    actorId: session.userId,
    actorName: session.userName,
    actorKind: "manager",
    source: "review",
    ...d,
  };
}

// The store's one open order; created when missing.
async function openOrderFor(tx: Tx, session: Session, locationId: string) {
  const existing = await tx.orderList.findFirst({
    where: { organizationId: session.organizationId, locationId, status: "SUBMITTED" },
    orderBy: { submittedAt: "desc" },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };
  const loc = await tx.location.findUniqueOrThrow({ where: { id: locationId }, select: { name: true } });
  const now = new Date();
  const created = await tx.orderList.create({
    data: {
      organizationId: session.organizationId,
      locationId,
      name: `${loc.name} - ${now.toLocaleDateString("en-US", { timeZone: STORE_TZ })}`,
      status: "SUBMITTED",
      source: "manager",
      createdBy: session.userId,
      createdByName: session.userName,
      submittedAt: now,
      submittedById: session.userId,
      submittedByName: session.userName,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

// Load a line in an order under review, and check rights on its store.
async function lineForEdit(itemId: string) {
  const session = await requireAuth();
  const item = await prisma.orderListItem.findFirst({
    where: { id: itemId, orderList: { organizationId: session.organizationId } },
    include: {
      orderList: { select: { id: true, status: true, locationId: true } },
      ingredient: { select: { name: true, bottleCostCents: true, casePackSize: true } },
    },
  });
  if (!item) return { error: "Line not found." as const };
  if (item.orderList.status !== "SUBMITTED") return { error: "This order was already approved." as const };
  if (!(await canManageStoreOrders(session, item.orderList.locationId))) {
    return { error: "You can view this store but not change its order." as const };
  }
  return { session, item };
}

// ---------------------------------------------------------------------------
// Line edits
// ---------------------------------------------------------------------------

export async function reviewSetQty(itemId: string, qty: number) {
  const r = await lineForEdit(itemId);
  if ("error" in r) return { error: r.error };
  const { session, item } = r;
  const n = Math.round(Number(qty) * 100) / 100;
  if (!Number.isFinite(n) || n <= 0 || n > 9999) return { error: "Quantity must be more than 0 (use ✕ to remove)." };
  if (n === item.quantityNeeded) return { success: true };
  await prisma.$transaction([
    prisma.orderListItem.update({ where: { id: itemId }, data: { quantityNeeded: n } }),
    prisma.orderActivityLog.create({
      data: logData(session, {
        locationId: item.orderList.locationId, orderListId: item.orderList.id, orderListItemId: itemId, ingredientId: item.ingredientId,
        entity: "LINE", action: "edit_qty", field: "quantityNeeded", oldValue: String(item.quantityNeeded), newValue: String(n),
      }),
    }),
  ]);
  revalidate();
  return { success: true };
}

// CS/BTL for THIS order line only (the product's own unit is untouched).
export async function reviewSetUnit(itemId: string, unit: "case" | "bottle") {
  if (unit !== "case" && unit !== "bottle") return { error: "Invalid unit" };
  const r = await lineForEdit(itemId);
  if ("error" in r) return { error: r.error };
  const { session, item } = r;
  if (item.unit === unit) return { success: true };
  await prisma.$transaction([
    prisma.orderListItem.update({ where: { id: itemId }, data: { unit } }),
    prisma.orderActivityLog.create({
      data: logData(session, {
        locationId: item.orderList.locationId, orderListId: item.orderList.id, orderListItemId: itemId, ingredientId: item.ingredientId,
        entity: "LINE", action: "switch_unit", field: "unit", oldValue: item.unit, newValue: unit, note: "This order only",
      }),
    }),
  ]);
  revalidate();
  return { success: true };
}

// ✕ — the line is kept (status REJECTED) so it can be restored and audited.
export async function reviewRemoveLine(itemId: string, restore = false) {
  const r = await lineForEdit(itemId);
  if ("error" in r) return { error: r.error };
  const { session, item } = r;
  const status = restore ? "PENDING" : "REJECTED";
  if (item.status === status) return { success: true };
  await prisma.$transaction([
    prisma.orderListItem.update({ where: { id: itemId }, data: { status } }),
    prisma.orderActivityLog.create({
      data: logData(session, {
        locationId: item.orderList.locationId, orderListId: item.orderList.id, orderListItemId: itemId, ingredientId: item.ingredientId,
        entity: "LINE", action: restore ? "restore" : "remove", field: "status", oldValue: item.status, newValue: status,
      }),
    }),
  ]);
  revalidate();
  return { success: true };
}

// "Move to <store>": the line joins that store's open order (which then orders
// it from the vendor) and is tagged FOR <original store> · TRANSFER. Cost and
// case size are snapshotted now so the Transfers log keeps today's values.
export async function reviewMoveLine(itemId: string, toLocationId: string) {
  const r = await lineForEdit(itemId);
  if ("error" in r) return { error: r.error };
  const { session, item } = r;
  if (item.transferFromLocationId) return { error: "Undo the current move first." };
  if (toLocationId === item.orderList.locationId) return { error: "The line is already in that store's order." };
  const dest = await prisma.location.findFirst({
    where: { id: toLocationId, organizationId: session.organizationId },
    select: { id: true, name: true },
  });
  if (!dest) return { error: "Store not found." };
  if (!(await canManageStoreOrders(session, toLocationId))) {
    return { error: `You can't add lines to ${short(dest.name)}'s order.` };
  }
  const from = await prisma.location.findUniqueOrThrow({ where: { id: item.orderList.locationId }, select: { name: true } });
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const target = await openOrderFor(tx, session, toLocationId);
    await tx.orderListItem.update({
      where: { id: itemId },
      data: {
        orderListId: target.id,
        transferFromLocationId: item.orderList.locationId,
        transferToLocationId: toLocationId,
        transferNote: `FOR ${short(from.name).toUpperCase()} · TRANSFER`,
        transferStatus: "PENDING",
        movedById: session.userId,
        movedByName: session.userName,
        movedAt: now,
        unitCostCentsSnapshot: item.ingredient.bottleCostCents,
        casePackSizeSnapshot: item.ingredient.casePackSize,
      },
    });
    await tx.orderActivityLog.create({
      data: logData(session, {
        locationId: toLocationId, orderListId: target.id, orderListItemId: itemId, ingredientId: item.ingredientId,
        entity: "TRANSFER", action: "move", field: "store", oldValue: short(from.name), newValue: short(dest.name),
        note: `${item.quantityNeeded} ${item.unit} of ${item.ingredient.name}${target.created ? " (opened a new order)" : ""}`,
      }),
    });
  });
  revalidate();
  return { success: true };
}

// Undo a move: back into the original store's open order, transfer tags cleared.
export async function reviewUndoMove(itemId: string) {
  const r = await lineForEdit(itemId);
  if ("error" in r) return { error: r.error };
  const { session, item } = r;
  const back = item.transferFromLocationId;
  if (!back) return { error: "This line wasn't moved." };
  if (!(await canManageStoreOrders(session, back))) return { error: "You can't change that store's order." };
  const [fromName, toName] = await Promise.all([
    prisma.location.findUniqueOrThrow({ where: { id: back }, select: { name: true } }),
    prisma.location.findUniqueOrThrow({ where: { id: item.orderList.locationId }, select: { name: true } }),
  ]);
  await prisma.$transaction(async (tx) => {
    const target = await openOrderFor(tx, session, back);
    await tx.orderListItem.update({
      where: { id: itemId },
      data: {
        orderListId: target.id,
        transferFromLocationId: null, transferToLocationId: null, transferNote: null, transferStatus: null,
        movedById: null, movedByName: null, movedAt: null,
        unitCostCentsSnapshot: null, casePackSizeSnapshot: null,
      },
    });
    await tx.orderActivityLog.create({
      data: logData(session, {
        locationId: back, orderListId: target.id, orderListItemId: itemId, ingredientId: item.ingredientId,
        entity: "TRANSFER", action: "undo_move", field: "store", oldValue: short(toName.name), newValue: short(fromName.name),
      }),
    });
  });
  revalidate();
  return { success: true };
}

// "+ Add item" on a store's card.
export async function reviewAddItem(locationId: string, ingredientId: string, qty: number, unit: "case" | "bottle") {
  const session = await requireAuth();
  if (!(await canManageStoreOrders(session, locationId))) return { error: "You can view this store but not change its order." };
  const n = Math.round(Number(qty) * 100) / 100;
  if (!Number.isFinite(n) || n <= 0 || n > 9999) return { error: "Quantity must be more than 0." };
  if (unit !== "case" && unit !== "bottle") return { error: "Invalid unit" };
  const inv = await prisma.inventoryItem.findFirst({
    where: { locationId, ingredientId, organizationId: session.organizationId },
    select: {
      parLevel: true,
      storageArea: { select: { name: true } },
      ingredient: { select: { name: true, vendor: true, vendorRef: { select: { name: true } } } },
    },
  });
  if (!inv) return { error: "That product isn't set up at this store." };

  await prisma.$transaction(async (tx) => {
    const order = await openOrderFor(tx, session, locationId);
    const line = await tx.orderListItem.create({
      data: {
        orderListId: order.id,
        ingredientId,
        vendor: inv.ingredient.vendorRef?.name || inv.ingredient.vendor || null,
        parSnapshot: inv.parLevel,
        quantityNeeded: n,
        unit,
        storageArea: inv.storageArea?.name ?? null,
        status: "PENDING",
        source: "manager",
      },
      select: { id: true },
    });
    await tx.orderActivityLog.create({
      data: logData(session, {
        locationId, orderListId: order.id, orderListItemId: line.id, ingredientId,
        entity: "LINE", action: "add", field: "quantityNeeded", newValue: `${n} ${unit}`, note: inv.ingredient.name,
      }),
    });
  });
  revalidate();
  return { success: true };
}

export async function resolveStaffRequest(requestId: string, status: "ADDED" | "DISMISSED") {
  const session = await requireAuth();
  if (status !== "ADDED" && status !== "DISMISSED") return { error: "Invalid status" };
  const req = await prisma.orderStaffRequest.findFirst({
    where: { id: requestId, organizationId: session.organizationId },
    select: { id: true, locationId: true, orderListId: true, status: true, text: true },
  });
  if (!req) return { error: "Request not found." };
  if (!(await canManageStoreOrders(session, req.locationId))) return { error: "You can view this store but not change it." };
  await prisma.$transaction([
    prisma.orderStaffRequest.update({
      where: { id: req.id },
      data: { status, resolvedById: session.userId, resolvedByName: session.userName, resolvedAt: new Date() },
    }),
    prisma.orderActivityLog.create({
      data: logData(session, {
        locationId: req.locationId, orderListId: req.orderListId, entity: "REQUEST", action: status === "ADDED" ? "done" : "dismiss",
        field: "status", oldValue: req.status, newValue: status, note: req.text,
      }),
    }),
  ]);
  revalidate();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Live updates: the Order tab asks every few seconds "anything new?" (the
// newest ordering activity) and refreshes itself when the answer changes.
// ---------------------------------------------------------------------------

export async function orderingPulse(): Promise<{ key: string; lastSend: { store: string; by: string; id: string } | null }> {
  const session = await requireAuth();
  const [latest, send] = await Promise.all([
    prisma.orderActivityLog.findFirst({
      where: { organizationId: session.organizationId },
      orderBy: { at: "desc" },
      select: { id: true },
    }),
    prisma.orderActivityLog.findFirst({
      where: { organizationId: session.organizationId, action: "staff_send" },
      orderBy: { at: "desc" },
      select: { id: true, locationId: true, actorName: true },
    }),
  ]);
  let lastSend = null;
  if (send) {
    const loc = send.locationId ? await prisma.location.findUnique({ where: { id: send.locationId }, select: { name: true } }) : null;
    lastSend = { store: loc ? short(loc.name) : "", by: send.actorName || "Staff", id: send.id };
  }
  return { key: latest?.id ?? "", lastSend };
}

// ---------------------------------------------------------------------------
// Whole-order actions: Clear all, Hold until next order, Undo approve
// ---------------------------------------------------------------------------

async function orderForEdit(orderId: string, statuses: string[]) {
  const session = await requireAuth();
  const order = await prisma.orderList.findFirst({
    where: { id: orderId, organizationId: session.organizationId },
    select: { id: true, status: true, locationId: true, location: { select: { name: true } } },
  });
  if (!order) return { error: "Order not found." as const };
  if (!statuses.includes(order.status)) return { error: "This order changed — refresh the page." as const };
  if (!(await canManageStoreOrders(session, order.locationId))) {
    return { error: "You can view this store but not change its order." as const };
  }
  return { session, order };
}

// "Clear all": every line is removed (kept as REJECTED, so "Show removed" can
// still bring one back). Nothing is emailed.
export async function reviewClearAll(orderId: string) {
  const r = await orderForEdit(orderId, ["SUBMITTED"]);
  if ("error" in r) return { error: r.error };
  const { session, order } = r;
  await prisma.$transaction(async (tx) => {
    const res = await tx.orderListItem.updateMany({ where: { orderListId: order.id, status: { not: "REJECTED" } }, data: { status: "REJECTED" } });
    await tx.orderActivityLog.create({
      data: logData(session, {
        locationId: order.locationId, orderListId: order.id, entity: "ORDER", action: "clear_all",
        note: `${res.count} line${res.count === 1 ? "" : "s"} removed`,
      }),
    });
  });
  revalidate();
  return { success: true };
}

// "Hold until next order": the order leaves the Review list and comes back
// (merged) with the store's next count — see lib/order-hold.ts.
export async function reviewHoldOrder(orderId: string) {
  const r = await orderForEdit(orderId, ["SUBMITTED"]);
  if ("error" in r) return { error: r.error };
  const { session, order } = r;
  await prisma.$transaction([
    prisma.orderList.update({ where: { id: order.id }, data: { status: "HELD" } }),
    prisma.orderActivityLog.create({
      data: logData(session, {
        locationId: order.locationId, orderListId: order.id, entity: "ORDER", action: "hold",
        field: "status", oldValue: "SUBMITTED", newValue: "HELD", note: "Hold until next order",
      }),
    }),
  ]);
  revalidate();
  return { success: true };
}

// "Bring back now" on a held order (without waiting for the next count).
export async function reviewReleaseHeld(orderId: string) {
  const r = await orderForEdit(orderId, ["HELD"]);
  if ("error" in r) return { error: r.error };
  const { session, order } = r;
  await prisma.$transaction((tx) =>
    absorbHeld(tx, session.organizationId, order.locationId, { actorId: session.userId, actorName: session.userName, actorKind: "manager", source: "review" }),
  );
  revalidate();
  return { success: true };
}

// "Undo approve": back to Review & approve so it can be fixed. Only while no
// email has been marked sent. The draft emails are thrown away (approving
// again rebuilds them). If the store has a newer open order, this one joins it.
export async function reviewUndoApprove(orderId: string) {
  const r = await orderForEdit(orderId, ["APPROVED", "ORDERED"]);
  if ("error" in r) return { error: r.error };
  const { session, order } = r;
  const sent = await prisma.orderEmail.count({ where: { orderListId: order.id, status: "SENT" } });
  if (sent > 0) return { error: `${sent} email${sent === 1 ? " was" : "s were"} already marked sent — undo "Mark as sent" first.` };
  await prisma.$transaction(async (tx) => {
    await tx.orderEmail.deleteMany({ where: { orderListId: order.id } });
    await tx.orderList.update({
      where: { id: order.id },
      data: { status: "SUBMITTED", approvedAt: null, approvedBy: null, approvedByName: null },
    });
    const newer = await tx.orderList.findFirst({
      where: { organizationId: session.organizationId, locationId: order.locationId, status: "SUBMITTED", id: { not: order.id } },
      orderBy: { submittedAt: "desc" },
      select: { id: true },
    });
    let merged = "";
    if (newer) {
      const m = await mergeOrderInto(tx, order.id, newer.id);
      merged = ` · joined the newer open order (${m.replaced} line(s) replaced by newer counts)`;
    }
    await tx.orderActivityLog.create({
      data: logData(session, {
        locationId: order.locationId, orderListId: newer?.id ?? order.id, entity: "ORDER", action: "undo_approve",
        field: "status", oldValue: order.status, newValue: "SUBMITTED", note: `Back to review${merged}`,
      }),
    });
  });
  revalidate();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Approve → emails to copy (never sent automatically)
// ---------------------------------------------------------------------------

function joinNames(names: string[]): string {
  const first = names.map((n) => n.trim().split(/\s+/)[0]).filter(Boolean);
  if (first.length <= 1) return first[0] ?? "";
  return `${first.slice(0, -1).join(", ")} and ${first[first.length - 1]}`;
}

function qtyText(qty: number, unit: string) {
  const word = unit === "case" ? "case" : "bottle";
  return `${qty} ${word}${qty === 1 ? "" : "s"}`;
}

export async function approveStoreOrders(orderIds: string[]) {
  const session = await requireAuth();
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).filter((x) => typeof x === "string"))];
  if (ids.length === 0) return { error: "Nothing to approve." };

  const [org, vendors, orders] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { name: true, orderEmailFrom: true, orderEmailFromName: true },
    }),
    prisma.vendor.findMany({
      where: { organizationId: session.organizationId },
      select: {
        id: true, name: true,
        reps: { select: { name: true, email: true, locations: { select: { locationId: true } } } },
      },
    }),
    prisma.orderList.findMany({
      where: { id: { in: ids }, organizationId: session.organizationId },
      select: {
        id: true, status: true, locationId: true,
        location: { select: { name: true } },
        items: {
          where: { status: { not: "REJECTED" } },
          select: {
            quantityNeeded: true, unit: true, vendor: true,
            ingredient: { select: { name: true, bottleSizeMl: true, casePackSize: true, vendor: true, vendorId: true, vendorRef: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const orgName = org?.name || "Meyhouse";
  const sender = org?.orderEmailFromName || orgName;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: STORE_TZ });
  const approved: string[] = [];
  const errors: string[] = [];

  for (const order of orders) {
    const store = short(order.location.name);
    if (order.status !== "SUBMITTED") { errors.push(`${store} was already approved.`); continue; }
    if (!(await canManageStoreOrders(session, order.locationId))) { errors.push(`You can't approve ${store}.`); continue; }

    // One email per vendor; transfer lines merge into the quantities (the
    // vendor never sees transfer notes).
    const byVendor = new Map<string, { vendorId: string | null; lines: Map<string, { name: string; ml: number | null; cps: number | null; unit: string; qty: number }> }>();
    for (const it of order.items) {
      const vendorName = it.ingredient.vendorRef?.name || it.vendor || it.ingredient.vendor || "No Vendor";
      if (!byVendor.has(vendorName)) byVendor.set(vendorName, { vendorId: it.ingredient.vendorId, lines: new Map() });
      const v = byVendor.get(vendorName)!;
      const key = `${it.ingredient.name}__${it.unit}`;
      const existing = v.lines.get(key);
      if (existing) existing.qty += it.quantityNeeded;
      else v.lines.set(key, { name: it.ingredient.name, ml: it.ingredient.bottleSizeMl, cps: it.ingredient.casePackSize, unit: it.unit, qty: it.quantityNeeded });
    }

    const emails: Prisma.OrderEmailCreateManyInput[] = [];
    for (const [vendorName, v] of [...byVendor.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const vendor = vendors.find((x) => x.id === v.vendorId) ?? vendors.find((x) => x.name === vendorName);
      const reps = (vendor?.reps ?? []).filter((r) => r.locations.some((l) => l.locationId === order.locationId));
      const withEmail = reps.filter((r) => r.email && r.email.trim());
      const lines = [...v.lines.values()].sort((a, b) => a.name.localeCompare(b.name));

      let body = `Hi${reps.length ? ` ${joinNames(reps.map((r) => r.name))}` : ""},\n\n`;
      body += `Please find our order for ${store} below.\n`;
      body += `Date: ${today}\n\n`;
      body += `────────────────────────────────\n`;
      for (const l of lines) {
        const size = l.ml ? ` (${l.ml}ml)` : "";
        const pack = l.unit === "case" && l.cps && l.cps > 1 ? ` [${l.cps}-pack]` : "";
        body += `  ${l.name}${size}${pack}\n    Qty: ${qtyText(l.qty, l.unit)}\n`;
      }
      body += `────────────────────────────────\n`;
      body += `Total: ${lines.length} item${lines.length === 1 ? "" : "s"}\n\n`;
      body += `Thank you,\n${sender}\n`;
      if (org?.orderEmailFrom) body += `${org.orderEmailFrom}\n`;

      emails.push({
        organizationId: session.organizationId,
        orderListId: order.id,
        locationId: order.locationId,
        vendorName,
        recipientEmail: withEmail.map((r) => r.email!.trim()).join(", "),
        recipientName: reps.map((r) => r.name).join(", ") || null,
        subject: `Order from ${orgName} — ${store} — ${today}`,
        body,
        status: "DRAFT",
      });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction so a double click can't approve twice.
      const res = await tx.orderList.updateMany({
        where: { id: order.id, status: "SUBMITTED" },
        data: {
          status: emails.length > 0 ? "APPROVED" : "ORDERED",
          approvedAt: now, approvedBy: session.userId, approvedByName: session.userName, reviewNote: null,
        },
      });
      if (res.count === 0) return;
      if (emails.length > 0) await tx.orderEmail.createMany({ data: emails });
      await tx.orderActivityLog.create({
        data: logData(session, {
          locationId: order.locationId, orderListId: order.id, entity: "ORDER", action: "approve",
          field: "status", oldValue: "SUBMITTED", newValue: emails.length > 0 ? "APPROVED" : "ORDERED",
          note: `${order.items.length} line${order.items.length === 1 ? "" : "s"}, ${emails.length} email${emails.length === 1 ? "" : "s"} to send`,
        }),
      });
      approved.push(order.id);
    });
  }

  revalidate();
  return { success: approved.length > 0, approved: approved.length, errors };
}

// "Mark as sent" (or undo). When every email of an order is sent, the order
// becomes ORDERED.
export async function markOrderEmailSent(emailId: string, sent = true) {
  const session = await requireAuth();
  const email = await prisma.orderEmail.findFirst({
    where: { id: emailId, organizationId: session.organizationId },
    select: { id: true, status: true, orderListId: true, locationId: true, vendorName: true },
  });
  if (!email || !email.orderListId) return { error: "Email not found." };
  const order = await prisma.orderList.findUnique({ where: { id: email.orderListId }, select: { locationId: true } });
  if (!order || !(await canManageStoreOrders(session, order.locationId))) return { error: "You can view this store but not change it." };
  const target = sent ? "SENT" : "DRAFT";
  if (email.status === target) return { success: true };
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.orderEmail.update({
      where: { id: email.id },
      data: sent
        ? { status: "SENT", sentAt: now, markedSentAt: now, markedSentById: session.userId, markedSentByName: session.userName }
        : { status: "DRAFT", sentAt: null, markedSentAt: null, markedSentById: null, markedSentByName: null },
    });
    const left = await tx.orderEmail.count({ where: { orderListId: email.orderListId!, status: { not: "SENT" } } });
    await tx.orderList.update({ where: { id: email.orderListId! }, data: { status: left === 0 ? "ORDERED" : "APPROVED" } });
    await tx.orderActivityLog.create({
      data: logData(session, {
        locationId: order.locationId, orderListId: email.orderListId, entity: "EMAIL", action: sent ? "mark_sent" : "unmark_sent",
        field: "status", oldValue: email.status, newValue: target, note: `${email.vendorName}${left === 0 && sent ? " · all emails sent" : ""}`,
      }),
    });
  });
  revalidate();
  return { success: true };
}
