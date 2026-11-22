"use server";

// Admin → Beverage products: save Area 1 / Shelf 1 / Area 2 / Shelf 2 for one
// or many products at ONE store, in one transaction, and log every change the
// same way kiosk changes are logged (marked as an Admin change).

import { prisma } from "@/lib/db";
import { ACTIVE_LINK } from "@/lib/store-links";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { ADMIN_SHELF_MAX } from "@/lib/admin-area-picker-flag";

// An area slot is a storage-area id at this store, or "keep" = leave the area
// that's on the item now (used for an area that is no longer in the store's
// list, so it isn't silently dropped), or null = empty.
export type AreaPick = { areaId: string } | { keep: 1 | 2 } | null;
export type LocationSet = { area1: AreaPick; shelf1: string; area2: AreaPick; shelf2: string };

export async function setProductLocations(input: {
  locationId: string;
  productIds: string[];
  value: LocationSet;
}): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const session = await requireAuth();
  const orgId = session.organizationId;
  const { locationId, productIds, value } = input ?? ({} as typeof input);
  if (typeof locationId !== "string" || !locationId) return { ok: false, error: "Pick a store first." };
  if (!Array.isArray(productIds) || productIds.length === 0) return { ok: false, error: "Select at least one product first." };
  if (productIds.length > 2000) return { ok: false, error: "Too many products at once." };
  if (!value || typeof value !== "object") return { ok: false, error: "Nothing to save." };

  const store = await prisma.location.findFirst({
    where: { id: locationId, organizationId: orgId },
    select: { id: true, storageAreas: { select: { id: true, name: true } } },
  });
  if (!store) return { ok: false, error: "Store not found." };

  const clean = (s: unknown) => String(s ?? "").trim().slice(0, ADMIN_SHELF_MAX) || null;
  const checkPick = (p: AreaPick): string | null => {
    if (p === null) return null;
    if ("areaId" in p) return store.storageAreas.some((a) => a.id === p.areaId) ? null : "That area isn't at this store any more. Reload the page.";
    if ("keep" in p) return productIds.length === 1 && (p.keep === 1 || p.keep === 2) ? null : "Bad request.";
    return "Bad request.";
  };
  const err = checkPick(value.area1) || checkPick(value.area2);
  if (err) return { ok: false, error: err };

  // Only this store's rows for these products, in this org.
  const rows = await prisma.inventoryItem.findMany({
    where: { organizationId: orgId, locationId, ingredientId: { in: productIds }, ...ACTIVE_LINK },
    select: {
      id: true, ingredientId: true, storageAreaId: true, storageArea2Id: true, shelfLocation: true, shelfLocation2: true,
      storageArea: { select: { name: true } }, storageArea2: { select: { name: true } },
      ingredient: { select: { name: true } },
    },
  });
  if (rows.length === 0) return { ok: false, error: "None of these products are at this store." };

  const areaName = (id: string | null) => (id ? store.storageAreas.find((a) => a.id === id)?.name ?? null : null);
  const show = (v: string | null | undefined) => (v && v.trim() ? v.trim() : "—");
  const logs: Prisma.OrderActivityLogCreateManyInput[] = [];
  const updates: { id: string; data: Prisma.InventoryItemUncheckedUpdateInput }[] = [];

  for (const r of rows) {
    const cur = {
      1: { id: r.storageAreaId, name: r.storageArea?.name ?? null, shelf: r.shelfLocation },
      2: { id: r.storageArea2Id, name: r.storageArea2?.name ?? null, shelf: r.shelfLocation2 },
    } as const;
    const resolve = (p: AreaPick) =>
      p === null ? { id: null, name: null } : "keep" in p ? { id: cur[p.keep].id, name: cur[p.keep].name } : { id: p.areaId, name: areaName(p.areaId) };
    const next = {
      1: { ...resolve(value.area1), shelf: value.area1 ? clean(value.shelf1) : null },
      2: { ...resolve(value.area2), shelf: value.area2 ? clean(value.shelf2) : null },
    };
    const data: Prisma.InventoryItemUncheckedUpdateInput = {};
    for (const slot of [1, 2] as const) {
      if ((cur[slot].id ?? null) !== (next[slot].id ?? null)) {
        if (slot === 1) data.storageAreaId = next[1].id; else data.storageArea2Id = next[2].id;
        logs.push(logRow(r, slot === 1 ? "area1" : "area2", show(cur[slot].name), show(next[slot].name)));
      }
      if ((cur[slot].shelf ?? null) !== (next[slot].shelf ?? null)) {
        if (slot === 1) data.shelfLocation = next[1].shelf; else data.shelfLocation2 = next[2].shelf;
        logs.push(logRow(r, slot === 1 ? "shelf1" : "shelf2", show(cur[slot].shelf), show(next[slot].shelf)));
      }
    }
    if (Object.keys(data).length > 0) updates.push({ id: r.id, data });
  }

  function logRow(r: (typeof rows)[number], field: string, oldValue: string, newValue: string): Prisma.OrderActivityLogCreateManyInput {
    return {
      organizationId: orgId, locationId, ingredientId: r.ingredientId,
      entity: "PRODUCT", action: "admin_edit", field, oldValue, newValue, note: r.ingredient.name,
      actorId: session.userId, actorName: session.userName, actorKind: "manager", source: "admin",
    };
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        for (const u of updates) await tx.inventoryItem.update({ where: { id: u.id }, data: u.data });
        if (logs.length) await tx.orderActivityLog.createMany({ data: logs });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }
  revalidatePath("/dashboard/products");
  return { ok: true, updated: rows.length };
}
