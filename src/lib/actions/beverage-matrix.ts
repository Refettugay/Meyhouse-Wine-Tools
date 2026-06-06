"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
  DEFAULT_POURS,
  FALLBACK_TAB_DEFAULTS,
  type BeverageTabKey,
  type MatrixPourCell as PourCell,
  type MatrixProductRow,
  type MatrixPourColumn as PourColumn,
  type MatrixOrphan,
  type BeverageMatrixData,
} from "@/lib/beverage-pricing-defaults";
import {
  createStrategy,
  DEFAULT_TIERS_BY_TAB,
  type StrategyConfig,
  type StrategyType,
  type CostTier,
  type RoundingMode,
} from "@/lib/pricing-strategies";
import { isBTGCategory } from "@/lib/category-types";

// ======================================================================
// HELPERS
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
      // Only items whose category explicitly says "Wine - Half Bottle - *"
      return ing.productType === "WINE" && isHalfBottleCategory;
    case "wine-btg":
      // Exclude half bottles from BTG
      return (
        ing.productType === "WINE" &&
        ing.anyStoreBTG === true &&
        !isHalfBottleCategory
      );
    case "wine-btb":
      // Exclude half bottles from BTB (they have their own tab now)
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

function roundSuggested(costCents: number, targetPct: number): number {
  const raw = costCents / (targetPct / 100);
  return Math.round(raw / 50) * 50;
}

function classifyStatus(
  cost: number | null,
  price: number | null,
  target: number
): PourCell["status"] {
  if (cost === null || cost === 0) return "no-cost";
  if (price === null || price === 0) return "no-price";
  const actual = (cost / price) * 100;
  const diff = actual - target;
  if (diff > 3) return "over";
  if (diff > 0) return "near";
  if (diff >= -5) return "on-target";
  return "under";
}

async function readTabDefault(orgId: string, tab: BeverageTabKey): Promise<number> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { pricingTabDefaults: true },
  });
  try {
    const parsed = JSON.parse(org?.pricingTabDefaults || "{}");
    return (parsed[tab] ?? FALLBACK_TAB_DEFAULTS[tab]) as number;
  } catch {
    return FALLBACK_TAB_DEFAULTS[tab];
  }
}

async function readPourTargets(
  orgId: string,
  tab: BeverageTabKey
): Promise<Record<string, number>> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { pourSizeTargets: true },
  });
  try {
    const parsed = JSON.parse(org?.pourSizeTargets || "{}");
    return (parsed[tab] || {}) as Record<string, number>;
  } catch {
    return {};
  }
}

// ======================================================================
// STRATEGY CONFIG (per-tab)
// ======================================================================

async function readStrategyConfig(
  orgId: string,
  tab: BeverageTabKey
): Promise<StrategyConfig> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { pricingStrategies: true, pricingTiers: true, pricingRounding: true },
  });
  let strategies: Record<string, { type?: StrategyType; flatTargetPct?: number }> = {};
  let tiers: Record<string, CostTier[]> = {};
  let rounding: Record<string, RoundingMode> = {};
  try {
    strategies = JSON.parse(org?.pricingStrategies || "{}");
  } catch {
    strategies = {};
  }
  try {
    tiers = JSON.parse(org?.pricingTiers || "{}");
  } catch {
    tiers = {};
  }
  try {
    rounding = JSON.parse(org?.pricingRounding || "{}");
  } catch {
    rounding = {};
  }
  const tabCfg = strategies[tab] || {};
  return {
    type: tabCfg.type ?? "flat",
    flatTargetPct: tabCfg.flatTargetPct,
    tiers: tiers[tab] ?? DEFAULT_TIERS_BY_TAB[tab],
    rounding: rounding[tab] ?? "nearest-5",
  };
}

export async function getStrategyConfig(tab: BeverageTabKey): Promise<StrategyConfig> {
  const orgId = await getOrganizationId();
  return readStrategyConfig(orgId, tab);
}

export async function updateStrategyType(tab: BeverageTabKey, type: StrategyType) {
  const orgId = await getOrganizationId();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { pricingStrategies: true },
  });
  let strategies: Record<string, { type?: StrategyType; flatTargetPct?: number }> = {};
  try {
    strategies = JSON.parse(org?.pricingStrategies || "{}");
  } catch {
    strategies = {};
  }
  strategies[tab] = { ...(strategies[tab] || {}), type };
  await prisma.organization.update({
    where: { id: orgId },
    data: { pricingStrategies: JSON.stringify(strategies) },
  });
  revalidatePath(`/dashboard/pricing-hub/${tab}`);
  return { success: true };
}

export async function updateTiers(tab: BeverageTabKey, nextTiers: CostTier[]) {
  const orgId = await getOrganizationId();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { pricingTiers: true },
  });
  let all: Record<string, CostTier[]> = {};
  try {
    all = JSON.parse(org?.pricingTiers || "{}");
  } catch {
    all = {};
  }
  // basic validation: sort by min, ensure chain continuity
  const sorted = [...nextTiers].sort((a, b) => a.minCents - b.minCents);
  all[tab] = sorted;
  await prisma.organization.update({
    where: { id: orgId },
    data: { pricingTiers: JSON.stringify(all) },
  });
  revalidatePath(`/dashboard/pricing-hub/${tab}`);
  return { success: true };
}

export async function updateRoundingMode(tab: BeverageTabKey, mode: RoundingMode) {
  const orgId = await getOrganizationId();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { pricingRounding: true },
  });
  let all: Record<string, RoundingMode> = {};
  try {
    all = JSON.parse(org?.pricingRounding || "{}");
  } catch {
    all = {};
  }
  all[tab] = mode;
  await prisma.organization.update({
    where: { id: orgId },
    data: { pricingRounding: JSON.stringify(all) },
  });
  revalidatePath(`/dashboard/pricing-hub/${tab}`);
  return { success: true };
}

async function writePourTargets(
  orgId: string,
  tab: BeverageTabKey,
  targets: Record<string, number | null>
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { pourSizeTargets: true },
  });
  let all: Record<string, Record<string, number>> = {};
  try {
    all = JSON.parse(org?.pourSizeTargets || "{}");
  } catch {
    all = {};
  }
  const tabMap = { ...(all[tab] || {}) };
  for (const [label, value] of Object.entries(targets)) {
    if (value === null) delete tabMap[label];
    else tabMap[label] = value;
  }
  all[tab] = tabMap;
  await prisma.organization.update({
    where: { id: orgId },
    data: { pourSizeTargets: JSON.stringify(all) },
  });
}

// ======================================================================
// GET MATRIX
// ======================================================================

export async function getLocations() {
  const orgId = await getOrganizationId();
  return prisma.location.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getBeverageMatrix(
  tab: BeverageTabKey,
  locationId?: string // optional: when set, only products assigned to this location are shown
): Promise<BeverageMatrixData> {
  const orgId = await getOrganizationId();
  const tabDefaultPct = await readTabDefault(orgId, tab);
  const pourTargets = await readPourTargets(orgId, tab);
  const strategyConfig = await readStrategyConfig(orgId, tab);
  // Effective flat target uses pour-column target if tab strategy is flat;
  // tiered / hybrid strategies ignore the flat value and use tiers.
  const strategy = createStrategy(
    { ...strategyConfig, flatTargetPct: strategyConfig.flatTargetPct ?? tabDefaultPct },
    tabDefaultPct,
    tab
  );

  const ingredients = await prisma.ingredient.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      // Pricing Hub only shows items currently ON_MENU (i.e. being sold).
      // Items in DATABASE (archived) should not appear in the pricing matrix.
      menuStatus: "ON_MENU",
      ...(locationId && {
        inventoryItems: { some: { locationId } },
      }),
    },
    include: {
      vendorRef: { select: { name: true } },
      pricings: { orderBy: [{ sortOrder: "asc" }, { pourMl: "asc" }] },
      inventoryItems: {
        select: { isBTG: true, locationId: true },
        ...(locationId && { where: { locationId } }),
      },
    },
    orderBy: [{ name: "asc" }],
  });

  const filtered = ingredients.filter((i) => {
    // BTG vs BTB is determined solely by the category (see isBTGCategory).
    // The legacy isBTG flags are intentionally ignored so changing a product's
    // category between BTG and BTB moves it between tabs in both directions.
    return matchesTab(tab, {
      productType: i.productType,
      anyStoreBTG: isBTGCategory(i.ingredientCategory),
      ingredientCategory: i.ingredientCategory,
    });
  });

  // Collect all pour labels actually in use + tab defaults
  const labelToPourMl = new Map<string, number>();
  for (const d of DEFAULT_POURS[tab]) {
    labelToPourMl.set(d.label, d.pourMl);
  }
  for (const ing of filtered) {
    for (const p of ing.pricings) {
      // Prefer the first time we saw the label (keeps original volume)
      if (!labelToPourMl.has(p.label)) {
        labelToPourMl.set(p.label, p.pourMl);
      }
    }
  }

  // Sort columns by pourMl ascending (smallest first)
  const sortedLabels = Array.from(labelToPourMl.entries()).sort(
    (a, b) => a[1] - b[1]
  );

  const pourColumns: PourColumn[] = sortedLabels.map(([label, pourMl]) => ({
    label,
    pourMl,
    columnTargetPct: pourTargets[label] ?? tabDefaultPct,
    isFromTabConfig: pourTargets[label] !== undefined,
  }));

  const products: MatrixProductRow[] = [];
  const orphans: MatrixOrphan[] = [];

  for (const ing of filtered) {
    if (ing.pricings.length === 0) {
      orphans.push({
        ingredientId: ing.id,
        name: ing.name,
        vendorName: ing.vendorRef?.name ?? null,
        category: ing.ingredientCategory,
        bottleCostCents: ing.bottleCostCents,
        bottleSizeMl: ing.bottleSizeMl,
        bottleSizeUnit: ing.bottleSizeUnit,
      });
      continue;
    }
    const cells: Record<string, PourCell> = {};
    for (const p of ing.pricings) {
      const costPerPour = computeCostPerPour(
        ing.bottleCostCents,
        ing.bottleSizeMl,
        p.pourMl
      );

      // Run strategy unless there's an item-level row override on target %
      let effective: number;
      let suggestedPriceCents: number | null = null;
      if (p.costTargetPct !== null && p.costTargetPct !== undefined) {
        // Row override wins over strategy
        effective = p.costTargetPct;
        suggestedPriceCents =
          costPerPour !== null && costPerPour > 0 && effective > 0
            ? roundSuggested(costPerPour, effective)
            : null;
      } else if (strategyConfig.type === "flat") {
        // Flat strategy keeps per-pour column behavior
        effective = pourTargets[p.label] ?? tabDefaultPct;
        suggestedPriceCents =
          costPerPour !== null && costPerPour > 0 && effective > 0
            ? roundSuggested(costPerPour, effective)
            : null;
      } else {
        // Tiered / Hybrid / AI — delegate to the strategy
        const out = strategy.suggestPrice({
          costCents: costPerPour ?? 0,
          tab,
          pourLabel: p.label,
          itemBottleCostCents: ing.bottleCostCents ?? undefined,
        });
        effective = out.targetPct;
        suggestedPriceCents = out.suggestedCents > 0 ? out.suggestedCents : null;
      }

      const actualCostPct =
        costPerPour !== null && p.menuPriceCents && p.menuPriceCents > 0
          ? (costPerPour / p.menuPriceCents) * 100
          : null;

      cells[p.label] = {
        priceId: p.id,
        label: p.label,
        pourMl: p.pourMl,
        menuPriceCents: p.menuPriceCents,
        rowTargetPct: p.costTargetPct,
        costPerPourCents: costPerPour,
        actualCostPct,
        effectiveTargetPct: effective,
        suggestedPriceCents,
        status: classifyStatus(costPerPour, p.menuPriceCents, effective),
      };
    }
    products.push({
      ingredientId: ing.id,
      name: ing.name,
      vendorName: ing.vendorRef?.name ?? null,
      category: ing.ingredientCategory,
      bottleCostCents: ing.bottleCostCents,
      bottleSizeMl: ing.bottleSizeMl,
      bottleSizeUnit: ing.bottleSizeUnit,
      cellsByLabel: cells,
    });
  }

  return { tab, tabDefaultPct, pourColumns, products, orphans };
}

// ======================================================================
// MUTATIONS
// ======================================================================

async function assertPriceInOrg(priceId: string, orgId: string) {
  const ok = await prisma.ingredientPrice.findFirst({
    where: { id: priceId, ingredient: { organizationId: orgId } },
    select: { id: true },
  });
  if (!ok) throw new Error("Price not found in your organization");
}

async function assertIngredientInOrg(ingredientId: string, orgId: string) {
  const ok = await prisma.ingredient.findFirst({
    where: { id: ingredientId, organizationId: orgId },
    select: { id: true },
  });
  if (!ok) throw new Error("Ingredient not found in your organization");
}

export async function updateCellPrice(priceId: string, priceCents: number | null) {
  const orgId = await getOrganizationId();
  await assertPriceInOrg(priceId, orgId);
  await prisma.ingredientPrice.update({
    where: { id: priceId },
    data: { menuPriceCents: priceCents },
  });
  revalidatePath("/dashboard/pricing-hub");
  return { success: true };
}

export async function updateCellTarget(priceId: string, targetPct: number | null) {
  const orgId = await getOrganizationId();
  await assertPriceInOrg(priceId, orgId);
  await prisma.ingredientPrice.update({
    where: { id: priceId },
    data: { costTargetPct: targetPct },
  });
  revalidatePath("/dashboard/pricing-hub");
  return { success: true };
}

export async function updateColumnTarget(
  tab: BeverageTabKey,
  label: string,
  targetPct: number | null
) {
  const orgId = await getOrganizationId();
  await writePourTargets(orgId, tab, { [label]: targetPct });
  revalidatePath(`/dashboard/pricing-hub/${tab}`);
  return { success: true };
}

export async function updateTabDefaultTarget(
  tab: BeverageTabKey,
  targetPct: number | null
) {
  const orgId = await getOrganizationId();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { pricingTabDefaults: true },
  });
  let defaults: Record<string, number> = {};
  try {
    defaults = JSON.parse(org?.pricingTabDefaults || "{}");
  } catch {
    defaults = {};
  }
  defaults[tab] = targetPct ?? FALLBACK_TAB_DEFAULTS[tab];
  await prisma.organization.update({
    where: { id: orgId },
    data: { pricingTabDefaults: JSON.stringify(defaults) },
  });
  revalidatePath(`/dashboard/pricing-hub/${tab}`);
  return { success: true };
}

export async function updateIngredientName(ingredientId: string, name: string) {
  const orgId = await getOrganizationId();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name cannot be empty" };

  const conflict = await prisma.ingredient.findFirst({
    where: { organizationId: orgId, name: trimmed, NOT: { id: ingredientId } },
    select: { id: true },
  });
  if (conflict) return { error: `A product named "${trimmed}" already exists` };

  await prisma.ingredient.update({
    where: { id: ingredientId, organizationId: orgId },
    data: { name: trimmed },
  });
  revalidatePath("/dashboard/pricing-hub");
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function updateIngredientBottleSize(
  ingredientId: string,
  bottleSizeMl: number | null,
  bottleSizeUnit?: string
) {
  const orgId = await getOrganizationId();
  await assertIngredientInOrg(ingredientId, orgId);
  await prisma.ingredient.update({
    where: { id: ingredientId },
    data: {
      bottleSizeMl,
      ...(bottleSizeUnit && { bottleSizeUnit }),
    },
  });
  revalidatePath("/dashboard/pricing-hub");
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function updateIngredientBottleCost(
  ingredientId: string,
  bottleCostCents: number | null
) {
  const orgId = await getOrganizationId();
  await assertIngredientInOrg(ingredientId, orgId);
  await prisma.ingredient.update({
    where: { id: ingredientId },
    data: { bottleCostCents },
  });
  revalidatePath("/dashboard/pricing-hub");
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function addPourToIngredient(
  ingredientId: string,
  label: string,
  pourMl: number
) {
  const orgId = await getOrganizationId();
  await assertIngredientInOrg(ingredientId, orgId);
  const existing = await prisma.ingredientPrice.findMany({
    where: { ingredientId },
    select: { sortOrder: true, label: true },
    orderBy: { sortOrder: "desc" },
  });
  if (existing.some((e) => e.label === label)) {
    return { error: `Pour size "${label}" already exists for this product` };
  }
  const nextOrder = (existing[0]?.sortOrder ?? 0) + 10;
  await prisma.ingredientPrice.create({
    data: { ingredientId, label: label.trim(), pourMl, sortOrder: nextOrder },
  });
  revalidatePath("/dashboard/pricing-hub");
  return { success: true };
}

export async function removePourFromIngredient(priceId: string) {
  const orgId = await getOrganizationId();
  await assertPriceInOrg(priceId, orgId);
  await prisma.ingredientPrice.delete({ where: { id: priceId } });
  revalidatePath("/dashboard/pricing-hub");
  return { success: true };
}

export async function seedDefaultPoursForOrphan(
  ingredientId: string,
  tab: BeverageTabKey
) {
  const orgId = await getOrganizationId();
  await assertIngredientInOrg(ingredientId, orgId);
  const defaults = DEFAULT_POURS[tab];
  for (let i = 0; i < defaults.length; i++) {
    const d = defaults[i];
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

export async function seedDefaultPoursForAllOrphans(tab: BeverageTabKey) {
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
    // BTG vs BTB is determined solely by the category (see isBTGCategory).
    return matchesTab(tab, {
      productType: i.productType,
      anyStoreBTG: isBTGCategory(i.ingredientCategory),
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

export async function applyCellSuggestedPrice(priceId: string) {
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

  // Detect tab. BTG vs BTB is determined solely by the category.
  const anyStoreBTG = isBTGCategory(price.ingredient.ingredientCategory);
  let tab: BeverageTabKey | null = null;
  if (price.ingredient.productType === "WINE" && anyStoreBTG) tab = "wine-btg";
  else if (price.ingredient.productType === "WINE") tab = "wine-btb";
  else if (price.ingredient.productType === "SPIRIT" || price.ingredient.productType === "CORDIAL")
    tab = "spirits";
  else if (price.ingredient.productType === "BEER") tab = "beer";
  else if (price.ingredient.productType === "NA_BEVERAGE") tab = "na";
  if (!tab) return { error: "Cannot detect tab for this item" };

  const tabDefault = await readTabDefault(orgId, tab);
  const pourTargets = await readPourTargets(orgId, tab);
  const strategyConfig = await readStrategyConfig(orgId, tab);
  const strategy = createStrategy(
    { ...strategyConfig, flatTargetPct: strategyConfig.flatTargetPct ?? tabDefault },
    tabDefault,
    tab
  );

  let suggested: number;
  if (price.costTargetPct !== null && price.costTargetPct !== undefined) {
    // Row override wins
    suggested = roundSuggested(costPerPour, price.costTargetPct);
  } else if (strategyConfig.type === "flat") {
    const columnTarget = pourTargets[price.label] ?? tabDefault;
    suggested = roundSuggested(costPerPour, columnTarget);
  } else {
    const out = strategy.suggestPrice({
      costCents: costPerPour,
      tab,
      pourLabel: price.label,
      itemBottleCostCents: price.ingredient.bottleCostCents ?? undefined,
    });
    suggested = out.suggestedCents;
  }

  await prisma.ingredientPrice.update({
    where: { id: priceId },
    data: { menuPriceCents: suggested },
  });
  revalidatePath("/dashboard/pricing-hub");
  return { success: true, appliedCents: suggested };
}
