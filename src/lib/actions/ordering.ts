"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { canApproveOrders } from "@/lib/permissions";
import { canOrderForStore } from "@/lib/ordering-scope";
import { newCountToken } from "@/lib/staff-count/link";
import { revalidatePath } from "next/cache";

// ===== STAFF COUNT LINKS (one secret link per store) =====
// Owners/admins, or whoever ORDERS for the store, may create / rotate /
// turn the link on or off. Every change is logged.

async function linkManager(locationId: string) {
  const session = await requireAuth();
  const loc = await prisma.location.findFirst({
    where: { id: locationId, organizationId: session.organizationId },
    select: { id: true, name: true },
  });
  if (!loc) return { error: "Store not found" as const };
  if (!canApproveOrders(session) && !(await canOrderForStore(session.userId, locationId))) {
    return { error: "Only people who order for this store can manage its link." as const };
  }
  return { session, loc };
}

// Creates the link if the store has none; otherwise replaces the token (the
// old link stops working immediately, and anyone signed in on it is signed out).
export async function rotateCountLink(locationId: string) {
  const m = await linkManager(locationId);
  if ("error" in m) return { error: m.error };
  const { session, loc } = m;
  const existing = await prisma.orderCountLink.findUnique({ where: { locationId }, select: { token: true } });
  const token = newCountToken();
  await prisma.$transaction([
    existing
      ? prisma.orderCountLink.update({ where: { locationId }, data: { token, rotatedAt: new Date() } })
      : prisma.orderCountLink.create({
          data: { locationId, token, enabled: true, createdById: session.userId, createdByName: session.userName },
        }),
    prisma.orderActivityLog.create({
      data: {
        organizationId: session.organizationId, locationId, entity: "LINK",
        action: existing ? "rotate" : "create",
        actorId: session.userId, actorName: session.userName, actorKind: "manager", source: "admin",
        note: `Staff count link for ${loc.name}`,
      },
    }),
  ]);
  revalidatePath("/dashboard/products");
  return { success: true, token };
}

export async function setCountLinkEnabled(locationId: string, enabled: boolean) {
  const m = await linkManager(locationId);
  if ("error" in m) return { error: m.error };
  const { session, loc } = m;
  const existing = await prisma.orderCountLink.findUnique({ where: { locationId }, select: { enabled: true } });
  if (!existing) return { error: "This store has no link yet." };
  if (existing.enabled === enabled) return { success: true };
  await prisma.$transaction([
    prisma.orderCountLink.update({ where: { locationId }, data: { enabled } }),
    prisma.orderActivityLog.create({
      data: {
        organizationId: session.organizationId, locationId, entity: "LINK", action: enabled ? "enable" : "disable",
        field: "enabled", oldValue: String(existing.enabled), newValue: String(enabled),
        actorId: session.userId, actorName: session.userName, actorKind: "manager", source: "admin",
        note: `Staff count link for ${loc.name}`,
      },
    }),
  ]);
  revalidatePath("/dashboard/products");
  return { success: true };
}

// Set (or clear) a product's order unit from the admin Order tab.
// null = "Not set" — staff may then pick CS/BTL per order line.
// Every change is written to OrderActivityLog (who, when, old → new).
export async function setProductOrderUnit(ingredientId: string, unit: "CASE" | "BOTTLE" | null) {
  const session = await requireAuth();
  const orgId = session.organizationId;
  if (unit !== null && unit !== "CASE" && unit !== "BOTTLE") return { error: "Invalid unit" };

  const product = await prisma.ingredient.findFirst({
    where: { id: ingredientId, organizationId: orgId },
    select: { id: true, orderUnit: true },
  });
  if (!product) return { error: "Product not found" };
  if ((product.orderUnit ?? null) === unit) return { success: true };

  try {
    await prisma.$transaction([
      prisma.ingredient.update({ where: { id: product.id }, data: { orderUnit: unit } }),
      prisma.orderActivityLog.create({
        data: {
          organizationId: orgId,
          ingredientId: product.id,
          entity: "PRODUCT",
          action: "set_order_unit",
          field: "orderUnit",
          oldValue: product.orderUnit ?? null,
          newValue: unit,
          actorId: session.userId,
          actorName: session.userName,
          actorKind: "manager",
          source: "admin",
        },
      }),
    ]);
  } catch (e) {
    console.error("setProductOrderUnit failed:", e);
    return { error: unit === null ? "Could not clear the unit yet — try again later." : "Could not save the unit." };
  }

  revalidatePath("/dashboard/products");
  return { success: true };
}
