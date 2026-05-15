"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
  parseAllLevelsCsv,
  getItemSales,
  getMenuGroupSummary,
  type ParsedPmixRow,
} from "@/lib/sales/csv-parser";
import {
  bestMatch,
  type SearchableItem,
} from "@/lib/sales/fuzzy-matcher";

// ---------- Types shared with client ----------

export interface UploadPreviewItem {
  rawName: string;
  menu: string;
  menuGroup: string;
  qtySold: number;
  avgPrice: number;
  netCents: number;
  // match result
  matchId: string | null;
  matchType: "ingredient" | "recipe" | null;
  matchName: string | null;
  confidence: number | null;
}

export interface UploadPreview {
  locationName: string | null;
  locationId: string | null;
  periodStart: string;
  periodEnd: string;
  totalItems: number;
  matchedItems: number;
  unmatchedItems: number;
  totalQty: number;
  totalNetCents: number;
  items: UploadPreviewItem[];
  menuGroupSummary: {
    menu: string;
    menuGroup: string;
    qty: number;
    netCents: number;
  }[];
}

// ---------- Load all searchable products (once per upload) ----------

async function loadSearchablePool(orgId: string): Promise<SearchableItem[]> {
  const [ingredients, recipes] = await Promise.all([
    prisma.ingredient.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        bottleSizeMl: true,
        productType: true,
      },
    }),
    prisma.recipe.findMany({
      where: { organizationId: orgId, isArchived: false, isSubRecipe: false },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);
  const pool: SearchableItem[] = [
    ...ingredients.map((i) => ({
      id: i.id,
      type: "ingredient" as const,
      name: i.name,
      bottleSizeMl: i.bottleSizeMl,
      productType: i.productType,
    })),
    ...recipes.map((r) => ({
      id: r.id,
      type: "recipe" as const,
      name: r.name,
      bottleSizeMl: null,
      productType: null,
    })),
  ];
  return pool;
}

// ---------- Public actions ----------

/**
 * Parse a CSV file content and return a dry-run preview.
 * Does NOT save to DB yet — user reviews first.
 */
export async function previewUpload(
  csvContent: string,
  locationId: string | null,
  periodStart: string,
  periodEnd: string
): Promise<UploadPreview> {
  const orgId = await getOrganizationId();
  const pool = await loadSearchablePool(orgId);

  const rows = parseAllLevelsCsv(csvContent);
  const itemRows = getItemSales(rows);
  const groupRows = getMenuGroupSummary(rows);

  let locationName: string | null = null;
  if (locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: locationId, organizationId: orgId },
      select: { name: true },
    });
    locationName = loc?.name ?? null;
  }

  const previewItems: UploadPreviewItem[] = [];
  let matched = 0;
  let unmatched = 0;
  let totalQty = 0;
  let totalNetCents = 0;

  for (const r of itemRows) {
    const match = bestMatch(r.itemName, pool);
    if (match) matched++;
    else unmatched++;
    totalQty += r.qtySold;
    totalNetCents += r.netCents;

    previewItems.push({
      rawName: r.itemName,
      menu: r.menu,
      menuGroup: r.menuGroup,
      qtySold: r.qtySold,
      avgPrice: r.avgPrice,
      netCents: r.netCents,
      matchId: match?.item.id ?? null,
      matchType: match?.item.type ?? null,
      matchName: match?.item.name ?? null,
      confidence: match?.confidence ?? null,
    });
  }

  return {
    locationName,
    locationId,
    periodStart,
    periodEnd,
    totalItems: itemRows.length,
    matchedItems: matched,
    unmatchedItems: unmatched,
    totalQty,
    totalNetCents,
    items: previewItems,
    menuGroupSummary: groupRows.map((g) => ({
      menu: g.menu,
      menuGroup: g.menuGroup,
      qty: g.qtySold,
      netCents: g.netCents,
    })),
  };
}

/**
 * Save a parsed preview to DB.
 * items may include user overrides (matchId changed manually).
 */
export async function saveSnapshot(
  locationId: string | null,
  periodStart: string,
  periodEnd: string,
  sourceFilename: string | null,
  items: UploadPreviewItem[],
  menuGroups: UploadPreview["menuGroupSummary"]
) {
  const orgId = await getOrganizationId();

  if (locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: locationId, organizationId: orgId },
      select: { id: true },
    });
    if (!loc) return { error: "Location not found in your organization" };
  }

  const totalQty = items.reduce((s, i) => s + i.qtySold, 0);
  const totalNetCents = items.reduce((s, i) => s + i.netCents, 0);
  const matched = items.filter((i) => i.matchId).length;
  const unmatched = items.length - matched;

  const snapshot = await prisma.salesSnapshot.create({
    data: {
      organizationId: orgId,
      locationId: locationId || null,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      source: "CSV_UPLOAD",
      sourceFilename,
      totalQtySold: totalQty,
      totalNetCents,
      totalGrossCents: totalNetCents, // approximate — we only track net
      itemsMatched: matched,
      itemsUnmatched: unmatched,
    },
  });

  // Batch insert item sales
  await prisma.salesItemSale.createMany({
    data: items.map((it) => ({
      snapshotId: snapshot.id,
      rawItemName: it.rawName,
      rawMenu: it.menu || null,
      rawMenuGroup: it.menuGroup || null,
      qtySold: it.qtySold,
      avgPriceCents: Math.round(it.avgPrice * 100),
      netCents: it.netCents,
      grossCents: it.netCents, // same for now
      discountCents: 0,
      voidCents: 0,
      matchedIngredientId: it.matchType === "ingredient" ? it.matchId : null,
      matchedRecipeId: it.matchType === "recipe" ? it.matchId : null,
      matchConfidence: it.confidence,
      matchUserConfirmed: false,
    })),
  });

  // Menu group summary
  if (menuGroups.length > 0) {
    await prisma.salesMenuGroupSale.createMany({
      data: menuGroups.map((g) => ({
        snapshotId: snapshot.id,
        menu: g.menu || null,
        menuGroup: g.menuGroup,
        qtySold: g.qty,
        netCents: g.netCents,
      })),
    });
  }

  revalidatePath("/dashboard/pricing-hub/data");
  return { success: true, snapshotId: snapshot.id };
}

// ---------- List uploads ----------

export async function listSnapshots() {
  const orgId = await getOrganizationId();
  return prisma.salesSnapshot.findMany({
    where: { organizationId: orgId },
    include: {
      location: { select: { id: true, name: true } },
    },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
  });
}

export async function deleteSnapshot(id: string) {
  const orgId = await getOrganizationId();
  const snapshot = await prisma.salesSnapshot.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!snapshot) return { error: "Snapshot not found" };
  await prisma.salesSnapshot.delete({ where: { id } });
  revalidatePath("/dashboard/pricing-hub/data");
  return { success: true };
}

// ---------- Locations list (for upload UI) ----------

export async function getLocationsForUpload() {
  const orgId = await getOrganizationId();
  return prisma.location.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
