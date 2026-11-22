// Which stores use a product (Master Database, 2026-11-22). Server-only helpers
// shared by Admin and the Kiosk so both follow the same rules.
//
// A store uses a product while its InventoryItem has removedAt = null. Removing
// sets removedAt (counts / order history stay on the row); adding back clears it
// and picks up where it left off. Nothing here deletes rows.
import { prisma } from "@/lib/db";

/** Add to every store-item `where`: only products this store still uses. */
export const ACTIVE_LINK = { removedAt: null } as const;

/** Add (or bring back) a product at these stores. Returns how many stores changed. */
export async function addProductToStores(opts: {
  orgId: string;
  productId: string;
  locationIds: string[];
  parLevel?: number;
}): Promise<number> {
  const { orgId, productId } = opts;
  const locationIds = [...new Set(opts.locationIds)];
  if (locationIds.length === 0) return 0;
  const existing = await prisma.inventoryItem.findMany({
    where: { organizationId: orgId, ingredientId: productId, locationId: { in: locationIds } },
    select: { id: true, locationId: true, removedAt: true },
  });
  const have = new Map(existing.map((e) => [e.locationId, e]));
  const revive = existing.filter((e) => e.removedAt).map((e) => e.id);
  const create = locationIds.filter((l) => !have.has(l));
  if (revive.length > 0) {
    await prisma.inventoryItem.updateMany({
      where: { id: { in: revive } },
      data: { removedAt: null, removedByName: null, markedForRemoval: null },
    });
  }
  if (create.length > 0) {
    const par = opts.parLevel && opts.parLevel >= 0 ? opts.parLevel : 0;
    await prisma.inventoryItem.createMany({
      data: create.map((locationId) => ({
        organizationId: orgId, locationId, ingredientId: productId, parLevel: par, currentStock: 0, unit: "bottle",
      })),
      skipDuplicates: true,
    });
  }
  return revive.length + create.length;
}

export type RemoveWhen = "now" | "whenOut";

/**
 * Take a product off these stores. "now" = gone from the store's lists at once;
 * "whenOut" = stays (marked "Coming off menu") until a count of 0 is entered.
 * Other stores are never touched. Returns how many stores changed.
 */
export async function removeProductFromStores(opts: {
  orgId: string;
  productId: string;
  locationIds: string[];
  when: RemoveWhen;
  byName: string;
}): Promise<number> {
  const { orgId, productId, when, byName } = opts;
  const locationIds = [...new Set(opts.locationIds)];
  if (locationIds.length === 0) return 0;
  const where = { organizationId: orgId, ingredientId: productId, locationId: { in: locationIds }, ...ACTIVE_LINK };
  const res = when === "now"
    ? await prisma.inventoryItem.updateMany({ where, data: { removedAt: new Date(), removedByName: byName || null, markedForRemoval: null } })
    : await prisma.inventoryItem.updateMany({ where, data: { markedForRemoval: "PENDING" } });
  return res.count;
}

/**
 * Count of 0 entered for items marked "remove when it runs out" → take them off
 * that store now. Returns the ids removed.
 */
export async function removeIfCountedOut(opts: {
  inventoryItemIds: string[];
  byName: string;
}): Promise<string[]> {
  if (opts.inventoryItemIds.length === 0) return [];
  const due = await prisma.inventoryItem.findMany({
    where: { id: { in: opts.inventoryItemIds }, markedForRemoval: "PENDING", ...ACTIVE_LINK },
    select: { id: true },
  });
  if (due.length === 0) return [];
  const ids = due.map((d) => d.id);
  await prisma.inventoryItem.updateMany({
    where: { id: { in: ids } },
    data: { removedAt: new Date(), removedByName: opts.byName ? `${opts.byName} (count 0)` : "Count 0", markedForRemoval: null },
  });
  return ids;
}
