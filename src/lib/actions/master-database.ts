"use server";

// Master Database actions (2026-11-22). Every change is written to
// OrderActivityLog (entity PRODUCT, source admin) so it shows in Recent changes.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { hardDeleteIngredient } from "@/lib/product-removal";
import { canPermanentDelete } from "@/lib/master-db-flag";
import { ACTIVE_LINK, addProductToStores, removeProductFromStores, type RemoveWhen } from "@/lib/store-links";
import { normalizeForSearch, searchMatcher } from "@/lib/search-normalize";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
}

async function ownedProduct(orgId: string, productId: string) {
  return prisma.ingredient.findFirst({
    where: { id: productId, organizationId: orgId },
    select: { id: true, name: true, isActive: true, archivedAt: true },
  });
}

async function ownedLocations(orgId: string, locationIds: string[]) {
  const rows = await prisma.location.findMany({
    where: { organizationId: orgId, id: { in: locationIds } },
    select: { id: true, name: true },
  });
  return rows;
}

async function log(orgId: string, actor: { id: string; name: string }, productId: string | null, action: string, note: string, locationId?: string | null) {
  await prisma.orderActivityLog.create({
    data: {
      organizationId: orgId, locationId: locationId ?? null, ingredientId: productId, entity: "PRODUCT", action,
      actorId: actor.id, actorName: actor.name, actorKind: "manager", source: "admin", note,
    },
  });
}

/** Take a product off some stores — never touches the others. */
export async function removeFromStores(input: { productId: string; locationIds: string[]; when: RemoveWhen }): Promise<Result> {
  const s = await requireAuth();
  const orgId = s.organizationId;
  const p = await ownedProduct(orgId, input.productId);
  if (!p) return { ok: false, error: "Product not found." };
  const locs = await ownedLocations(orgId, input.locationIds);
  if (locs.length === 0) return { ok: false, error: "Pick at least one restaurant." };
  const when: RemoveWhen = input.when === "whenOut" ? "whenOut" : "now";
  const n = await removeProductFromStores({ orgId, productId: p.id, locationIds: locs.map((l) => l.id), when, byName: s.userName });
  for (const l of locs) {
    await log(orgId, { id: s.userId, name: s.userName }, p.id, when === "now" ? "remove_from_store" : "mark_to_remove",
      `${p.name} — ${when === "now" ? "removed from" : "remove when it runs out at"} ${l.name}`, l.id);
  }
  refresh();
  return { ok: true, message: n === 0 ? "Nothing to change — it wasn't in use there." : undefined };
}

/** Add a product to stores (brings back earlier counts / areas if it was there before). */
export async function addToStores(input: { productId: string; locationIds: string[] }): Promise<Result> {
  const s = await requireAuth();
  const orgId = s.organizationId;
  const p = await ownedProduct(orgId, input.productId);
  if (!p || !p.isActive) return { ok: false, error: "Product not found." };
  if (p.archivedAt) return { ok: false, error: "This product is archived. Unarchive it first." };
  const locs = await ownedLocations(orgId, input.locationIds);
  if (locs.length === 0) return { ok: false, error: "Pick at least one restaurant." };
  await addProductToStores({ orgId, productId: p.id, locationIds: locs.map((l) => l.id) });
  for (const l of locs) await log(orgId, { id: s.userId, name: s.userName }, p.id, "add_to_store", `${p.name} — added to ${l.name}`, l.id);
  refresh();
  return { ok: true };
}

/** Cancel "remove when it runs out" at one store. */
export async function cancelRemoval(input: { productId: string; locationId: string }): Promise<Result> {
  const s = await requireAuth();
  const orgId = s.organizationId;
  const p = await ownedProduct(orgId, input.productId);
  if (!p) return { ok: false, error: "Product not found." };
  await prisma.inventoryItem.updateMany({
    where: { organizationId: orgId, ingredientId: p.id, locationId: input.locationId, ...ACTIVE_LINK },
    data: { markedForRemoval: null },
  });
  await log(orgId, { id: s.userId, name: s.userName }, p.id, "cancel_phase_out", `${p.name} — kept`, input.locationId);
  refresh();
  return { ok: true };
}

/** Archive: off every store, hidden from the default Master list; history kept. */
export async function archiveProduct(productId: string): Promise<Result> {
  const s = await requireAuth();
  const orgId = s.organizationId;
  const p = await ownedProduct(orgId, productId);
  if (!p) return { ok: false, error: "Product not found." };
  await prisma.inventoryItem.updateMany({
    where: { organizationId: orgId, ingredientId: p.id, ...ACTIVE_LINK },
    data: { removedAt: new Date(), removedByName: s.userName, markedForRemoval: null },
  });
  await prisma.ingredient.update({ where: { id: p.id }, data: { archivedAt: new Date(), onMenu: false } });
  await log(orgId, { id: s.userId, name: s.userName }, p.id, "archive", `${p.name} — archived`);
  refresh();
  return { ok: true };
}

export async function unarchiveProduct(productId: string): Promise<Result> {
  const s = await requireAuth();
  const orgId = s.organizationId;
  const p = await ownedProduct(orgId, productId);
  if (!p) return { ok: false, error: "Product not found." };
  await prisma.ingredient.update({ where: { id: p.id }, data: { archivedAt: null } });
  await log(orgId, { id: s.userId, name: s.userName }, p.id, "unarchive", `${p.name} — unarchived`);
  refresh();
  return { ok: true };
}

/**
 * Permanent Delete — Owner / Admin / General Manager only, Master Database tab.
 * Never used (no counts, no orders) → really deleted. Used before → hidden from
 * every list forever, but old orders and counts keep showing it.
 */
export async function permanentlyDelete(productId: string): Promise<Result> {
  const s = await requireAuth();
  if (!canPermanentDelete(s)) return { ok: false, error: "Only an Owner, Admin or General Manager can permanently delete." };
  const orgId = s.organizationId;
  const p = await ownedProduct(orgId, productId);
  if (!p) return { ok: true }; // already gone

  const [orders, counts, kioskCounts] = await Promise.all([
    prisma.orderListItem.count({ where: { ingredientId: p.id } }),
    prisma.stockCount.count({ where: { inventoryItem: { ingredientId: p.id } } }),
    prisma.orderCountEntry.count({ where: { ingredientId: p.id } }),
  ]);
  const hasHistory = orders + counts + kioskCounts > 0;

  // Log first without the product link so the record survives a hard delete.
  await log(orgId, { id: s.userId, name: s.userName }, hasHistory ? p.id : null, "hard_delete", `Permanently deleted "${p.name}"`);
  if (hasHistory) {
    await prisma.inventoryItem.updateMany({
      where: { organizationId: orgId, ingredientId: p.id, ...ACTIVE_LINK },
      data: { removedAt: new Date(), removedByName: s.userName, markedForRemoval: null },
    });
    await prisma.ingredient.update({ where: { id: p.id }, data: { isActive: false, onMenu: false, deletedAt: new Date() } });
  } else {
    await hardDeleteIngredient(p.id, orgId);
    revalidatePath("/dashboard/recipes");
  }
  refresh();
  return { ok: true, message: hasHistory ? "Deleted. Past orders and counts still show it." : "Deleted." };
}

export type SimilarProduct = { id: string; name: string; category: string | null; stores: string[]; archived: boolean };

/** Duplicate check while typing a new product name. */
export async function findSimilarProducts(name: string): Promise<SimilarProduct[]> {
  const s = await requireAuth();
  const q = normalizeForSearch(name);
  if (q.length < 3) return [];
  const all = await prisma.ingredient.findMany({
    where: { organizationId: s.organizationId, isActive: true },
    select: {
      id: true, name: true, ingredientCategory: true, archivedAt: true,
      inventoryItems: { where: ACTIVE_LINK, select: { location: { select: { name: true } } } },
    },
  });
  // Every typed word appears in the name, or the name's words all appear in what was typed.
  const typed = searchMatcher(name);
  const out: SimilarProduct[] = [];
  for (const p of all) {
    const n = normalizeForSearch(p.name);
    if (typed(p.name) || (n.length >= 3 && searchMatcher(p.name)(name))) {
      out.push({
        id: p.id, name: p.name, category: p.ingredientCategory, archived: !!p.archivedAt,
        stores: p.inventoryItems.map((i) => i.location.name.replace("Meyhouse ", "")),
      });
    }
    if (out.length >= 6) break;
  }
  return out;
}
