"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
  DEFAULT_POURS,
  FALLBACK_TAB_DEFAULTS as FALLBACK_DEFAULTS,
  type BeverageTabKey,
  type BeverageRow,
  type BeverageIngredientWithoutPours,
} from "@/lib/beverage-pricing-defaults";

type TabDefaults = Record<BeverageTabKey, number>;

async function readTabDefaults(orgId: string): Promise<TabDefaults> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { pricingTabDefaults: true },
  });
  try {
    const parsed = JSON.parse(org?.pricingTabDefaults || "{}");
    return { ...FALLBACK_DEFAULTS, ...parsed };
  } catch {
    return FALLBACK_DEFAULTS;
  }
}

export async function getTabDefault(tab: BeverageTabKey): Promise<number> {
  const orgId = await getOrganizationId();
  const defaults = await readTabDefaults(orgId);
  return defaults[tab];
}

export async function updateTabDefault(tab: BeverageTabKey, pct: number | null) {
  const orgId = await getOrganizationId();
  if (pct !== null && (isNaN(pct) || pct < 0 || pct > 100)) {
    return { error: "Invalid percentage" };
  }
  const current = await readTabDefaults(orgId);
  if (pct === null) {
    current[tab] = FALLBACK_DEFAULTS[tab];
  } else {
    current[tab] = pct;
  }
  await prisma.organization.update({
    where: { id: orgId },
    data: { pricingTabDefaults: JSON.stringify(current) },
  });
  revalidatePath(`/dashboard/pricing-hub/${tab}`);
  return { success: true };
}

// ======================================================================
// INGREDIENT FILTERING PER TAB
// Each tab shows ingredients whose productType / flags match its scope.
// The isBTG flag is resolved across InventoryItem rows (per-store markers)
// — if ANY store has marked it BTG, the wine belongs in Wine BTG.
// ======================================================================
function matchesTab(
  tab: BeverageTabKey,
  ing: {
    productType: string | null;
    anyStoreBTG: boolean;
    ingredientCategory: string | null;
  }
): boolean {
  const cat = (ing.ingredientCategory || "").toUpperCase();
  const isHalfBottleCategory =
    cat.includes("WINE - HALF BOTTLE") || cat.includes("WINE-HALF BOTTLE");
  switch (tab) {
    case "wine-half":
      return ing.productType === "WINE" && isHalfBottleCategory;
    case "wine-btg":
      return (
        ing.productType === "WINE" &&
        ing.anyStoreBTG === true &&
        !isHalfBottleCategory
      );
    case "wine-btb":
      return (
        ing.productType === "WINE" &&
        ing.anyStoreBTG !== true &&
        !isHalfBottleCategory
      );
    case "spirits":
      return ing.productType === "SPIRIT" || ing.productType === "CORDIAL";
    case "beer":
      return ing.productType === "BEER";
    case "na":
      return ing.productType === "NA_BEVERAGE";
  }
}

function computeCostPerPour(
  bottleCostCents: number | null,
  bottleSizeMl: number | null,
  pourMl: number
): number | null {
  if (!bottleCostCents || !bottleSizeMl || !pourMl) return null;
  return Math.round((bottleCostCents / bottleSizeMl) * pourMl);
}

function classifyStatus(
  costCents: number | null,
  priceCents: number | null,
  targetPct: number | null
): BeverageRow["status"] {
  if (costCents === null || costCents === 0) return "no-cost";
  if (priceCents === null || priceCents === 0) return "no-price";
  if (targetPct === null) return "no-target";
  const actual = (costCents / priceCents) * 100;
  const diff = actual - targetPct;
  if (diff > 3) return "over";
  if (diff > 0) return "near";
  if (diff >= -5) return "on-target";
  return "under";
}

function roundSuggestedCents(costCents: number, targetPct: number): number {
  const raw = costCents / (targetPct / 100);
  return Math.round(raw / 50) * 50; // round to nearest $0.50
}

// ======================================================================
// GET BEVERAGE ROWS
// Returns all pour rows for a tab, plus the tab-level default target %.
// ======================================================================
export async function getBeverageRows(tab: BeverageTabKey): Promise<{
  rows: BeverageRow[];
  orphans: BeverageIngredientWithoutPours[]; // ingredients without any pour yet
  tabDefaultPct: number;
}> {
  const orgId = await getOrganizationId();
  const tabDefaultPct = (await readTabDefaults(orgId))[tab];

  const ingredients = await prisma.ingredient.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      menuStatus: { in: ["ON_MENU", "DATABASE"] },
    },
    include: {
      vendorRef: { select: { name: true } },
      pricings: { orderBy: [{ sortOrder: "asc" }, { pourMl: "asc" }] },
      // Per-store markers: we treat the ingredient as BTG / well / craft / etc.
      // if ANY of its store rows has the flag set.
      inventoryItems: {
        select: { isBTG: true, isCraftCocktailIngredient: true, isWellSpirit: true, isHalfBottle: true, isDessertWine: true },
      },
    },
    orderBy: [{ name: "asc" }],
  });

  const filtered = ingredients.filter((i) => {
    const categoryStr = (i.ingredientCategory || "").toUpperCase();
    const categoryHasBTG =
      categoryStr.includes("WINE - BTG") || categoryStr.startsWith("BTG ");
    const anyStoreBTG =
      i.isBTG === true ||
      i.inventoryItems.some((item) => item.isBTG === true) ||
      categoryHasBTG;
    return matchesTab(tab, {
      productType: i.productType,
      anyStoreBTG,
      ingredientCategory: i.ingredientCategory,
    });
  });

  const rows: BeverageRow[] = [];
  const orphans: BeverageIngredientWithoutPours[] = [];

  for (const ing of filtered) {
    if (ing.pricings.length === 0) {
      orphans.push({
        ingredientId: ing.id,
        ingredientName: ing.name,
        vendorName: ing.vendorRef?.name ?? null,
        bottleCostCents: ing.bottleCostCents,
        bottleSizeMl: ing.bottleSizeMl,
      });
      continue;
    }
    for (const p of ing.pricings) {
      const costPerPour = computeCostPerPour(
        ing.bottleCostCents,
        ing.bottleSizeMl,
        p.pourMl
      );
      const effectiveTarget = p.costTargetPct ?? tabDefaultPct;
      const actualCostPct =
        costPerPour !== null && p.menuPriceCents && p.menuPriceCents > 0
          ? (costPerPour / p.menuPriceCents) * 100
          : null;
      const suggestedPriceCents =
        costPerPour !== null && costPerPour > 0 && effectiveTarget > 0
          ? roundSuggestedCents(costPerPour, effectiveTarget)
          : null;
      rows.push({
        priceId: p.id,
        ingredientId: ing.id,
        ingredientName: ing.name,
        vendorName: ing.vendorRef?.name ?? null,
        label: p.label,
        pourMl: p.pourMl,
        bottleCostCents: ing.bottleCostCents,
        bottleSizeMl: ing.bottleSizeMl,
        costPerPourCents: costPerPour,
        menuPriceCents: p.menuPriceCents,
        costTargetPct: effectiveTarget,
        costTargetSource: p.costTargetPct !== null ? "row" : "tab",
        actualCostPct,
        suggestedPriceCents,
        status: classifyStatus(costPerPour, p.menuPriceCents, effectiveTarget),
        sortOrder: p.sortOrder,
      });
    }
  }

  return { rows, orphans, tabDefaultPct };
}

// ======================================================================
// MUTATIONS
// ======================================================================

async function assertIngredientInOrg(ingredientId: string, orgId: string) {
  const ing = await prisma.ingredient.findFirst({
    where: { id: ingredientId, organizationId: orgId },
    select: { id: true },
  });
  if (!ing) throw new Error("Ingredient not found in your organization");
}

async function assertPriceInOrg(priceId: string, orgId: string) {
  const price = await prisma.ingredientPrice.findFirst({
    where: { id: priceId, ingredient: { organizationId: orgId } },
    select: { id: true },
  });
  if (!price) throw new Error("Price not found in your organization");
}

export async function seedDefaultPoursForIngredient(
  ingredientId: string,
  tab: BeverageTabKey
) {
  const orgId = await getOrganizationId();
  await assertIngredientInOrg(ingredientId, orgId);
  const defaults = DEFAULT_POURS[tab];

  for (let i = 0; i < defaults.length; i++) {
    const d = defaults[i];
    // upsert by (ingredientId, label) unique constraint
    await prisma.ingredientPrice.upsert({
      where: { ingredientId_label: { ingredientId, label: d.label } },
      create: {
        ingredientId,
        label: d.label,
        pourMl: d.pourMl,
        sortOrder: i * 10,
      },
      update: {},
    });
  }
  revalidatePath(`/dashboard/pricing-hub/${tab}`);
  return { success: true };
}

export async function seedDefaultPoursForAllInTab(tab: BeverageTabKey) {
  const orgId = await getOrganizationId();
  const ingredients = await prisma.ingredient.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      menuStatus: { in: ["ON_MENU", "DATABASE"] },
    },
    include: {
      pricings: { select: { id: true } },
      inventoryItems: { select: { isBTG: true } },
    },
  });
  const filtered = ingredients.filter((i) => {
    const categoryStr = (i.ingredientCategory || "").toUpperCase();
    const categoryHasBTG =
      categoryStr.includes("WINE - BTG") || categoryStr.startsWith("BTG ");
    const anyStoreBTG =
      i.isBTG === true ||
      i.inventoryItems.some((item) => item.isBTG === true) ||
      categoryHasBTG;
    return matchesTab(tab, {
      productType: i.productType,
      anyStoreBTG,
      ingredientCategory: i.ingredientCategory,
    });
  });
  let seeded = 0;
  for (const ing of filtered) {
    if (ing.pricings.length > 0) continue;
    const defaults = DEFAULT_POURS[tab];
    for (let i = 0; i < defaults.length; i++) {
      const d = defaults[i];
      await prisma.ingredientPrice.create({
        data: {
          ingredientId: ing.id,
          label: d.label,
          pourMl: d.pourMl,
          sortOrder: i * 10,
        },
      });
    }
    seeded++;
  }
  revalidatePath(`/dashboard/pricing-hub/${tab}`);
  return { success: true, seeded };
}

export async function updatePrice(
  priceId: string,
  updates: { menuPriceCents?: number | null; costTargetPct?: number | null; label?: string; pourMl?: number }
) {
  const orgId = await getOrganizationId();
  await assertPriceInOrg(priceId, orgId);
  await prisma.ingredientPrice.update({
    where: { id: priceId },
    data: {
      ...(updates.menuPriceCents !== undefined && { menuPriceCents: updates.menuPriceCents }),
      ...(updates.costTargetPct !== undefined && { costTargetPct: updates.costTargetPct }),
      ...(updates.label !== undefined && { label: updates.label }),
      ...(updates.pourMl !== undefined && { pourMl: updates.pourMl }),
    },
  });
  revalidatePath("/dashboard/pricing-hub");
  return { success: true };
}

export async function addPourSize(
  ingredientId: string,
  label: string,
  pourMl: number
) {
  const orgId = await getOrganizationId();
  await assertIngredientInOrg(ingredientId, orgId);
  // find max sortOrder to append at the end
  const existing = await prisma.ingredientPrice.findMany({
    where: { ingredientId },
    select: { sortOrder: true },
    orderBy: { sortOrder: "desc" },
    take: 1,
  });
  const nextOrder = (existing[0]?.sortOrder ?? 0) + 10;

  try {
    await prisma.ingredientPrice.create({
      data: {
        ingredientId,
        label,
        pourMl,
        sortOrder: nextOrder,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to add pour size";
    return { error: msg.includes("Unique") ? `A pour size "${label}" already exists for this item.` : msg };
  }
  revalidatePath("/dashboard/pricing-hub");
  return { success: true };
}

export async function deletePourSize(priceId: string) {
  const orgId = await getOrganizationId();
  await assertPriceInOrg(priceId, orgId);
  await prisma.ingredientPrice.delete({ where: { id: priceId } });
  revalidatePath("/dashboard/pricing-hub");
  return { success: true };
}

export async function applySuggestedPrice(priceId: string) {
  const orgId = await getOrganizationId();
  await assertPriceInOrg(priceId, orgId);
  const price = await prisma.ingredientPrice.findUnique({
    where: { id: priceId },
    include: {
      ingredient: {
        include: { inventoryItems: { select: { isBTG: true } } },
      },
    },
  });
  if (!price) return { error: "Price not found" };

  const costPerPour = computeCostPerPour(
    price.ingredient.bottleCostCents,
    price.ingredient.bottleSizeMl,
    price.pourMl
  );
  if (!costPerPour) return { error: "Cannot compute cost — missing bottle cost or size" };

  // determine effective target
  const anyStoreBTG =
    price.ingredient.isBTG === true ||
    price.ingredient.inventoryItems.some((i) => i.isBTG === true);
  const tab = detectTabForIngredient({
    productType: price.ingredient.productType,
    anyStoreBTG,
  });
  if (!tab) return { error: "Cannot find tab for this item" };
  const defaults = await readTabDefaults(orgId);
  const target = price.costTargetPct ?? defaults[tab];

  const suggested = roundSuggestedCents(costPerPour, target);
  await prisma.ingredientPrice.update({
    where: { id: priceId },
    data: { menuPriceCents: suggested },
  });
  revalidatePath("/dashboard/pricing-hub");
  return { success: true, appliedCents: suggested };
}

function detectTabForIngredient(ing: {
  productType: string | null;
  anyStoreBTG: boolean;
}): BeverageTabKey | null {
  if (ing.productType === "WINE" && ing.anyStoreBTG) return "wine-btg";
  if (ing.productType === "WINE") return "wine-btb";
  if (ing.productType === "SPIRIT" || ing.productType === "CORDIAL") return "spirits";
  if (ing.productType === "BEER") return "beer";
  if (ing.productType === "NA_BEVERAGE") return "na";
  return null;
}
