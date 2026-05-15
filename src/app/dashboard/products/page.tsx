import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { getCategoriesConfig } from "@/lib/actions/settings";
import { UnifiedProductsPage } from "@/components/product/unified-products-page";

export default async function ProductsPage() {
  const orgId = await getOrganizationId();

  const [products, locations, vendors, org] = await Promise.all([
    prisma.ingredient.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { name: "asc" },
      include: {
        vendorRef: true,
        inventoryItems: {
          include: { location: true, storageArea: true, storageArea2: true },
        },
      },
    }),
    prisma.location.findMany({
      where: { organizationId: orgId },
      orderBy: { sortOrder: "asc" },
      include: {
        storageAreas: { orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.vendor.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        settingsStandardPours: true,
        settingsCategories: true,
        settingsBottleSizes: true,
        useMergedOrderCart: true,
      },
    }),
  ]);

  // Get order history (last 8 weeks) per ingredient per location
  const eightWeeksAgo = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
  const orderHistoryItems = await prisma.orderListItem.findMany({
    where: {
      orderList: {
        organizationId: orgId,
        createdAt: { gte: eightWeeksAgo },
      },
    },
    select: {
      ingredientId: true,
      quantityNeeded: true,
      unit: true,
      orderList: {
        select: { locationId: true, createdAt: true },
      },
    },
    orderBy: { orderList: { createdAt: "desc" } },
  });

  // Build order history map: ingredientId_locationId → array of { qty, date, weekNum }
  const now = Date.now();
  const orderHistoryMap = new Map<string, { qty: number; date: string; weekNum: number }[]>();
  for (const oi of orderHistoryItems) {
    const key = `${oi.ingredientId}_${oi.orderList.locationId}`;
    if (!orderHistoryMap.has(key)) orderHistoryMap.set(key, []);
    const weeksAgo = Math.floor((now - oi.orderList.createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000));
    orderHistoryMap.get(key)!.push({
      qty: oi.quantityNeeded,
      date: oi.orderList.createdAt.toISOString(),
      weekNum: weeksAgo,
    });
  }

  // Parse bottle sizes from settings
  let bottleSizes: number[] = [];
  try {
    bottleSizes = JSON.parse(org?.settingsBottleSizes || "[]");
  } catch {
    bottleSizes = [200, 355, 375, 500, 700, 750, 1000, 1500];
  }

  // Parse standard pours
  let standardPours: Record<string, number> = {};
  try {
    standardPours = JSON.parse(org?.settingsStandardPours || "{}");
  } catch {
    standardPours = {};
  }

  // Get structured categories (with pour sizes, serving styles)
  const categoriesConfig = await getCategoriesConfig();
  const structuredCategories = categoriesConfig.subs;

  // Merge: all sub-category names from settings + any on products not yet in settings
  const settingsCatNames = new Set(structuredCategories.map((s) => s.name));
  const productCatNames = products
    .map((p) => p.ingredientCategory)
    .filter((c): c is string => !!c);
  const categories = [
    ...new Set([...settingsCatNames, ...productCatNames]),
  ].sort();

  // Get recent purchases per ingredient per location (for variance calc)
  // Look at RECEIVED orders since each item's last count date
  const recentOrderItems = await prisma.orderListItem.findMany({
    where: {
      orderList: {
        organizationId: orgId,
        status: "RECEIVED",
      },
    },
    select: {
      ingredientId: true,
      quantityNeeded: true,
      unit: true,
      orderList: {
        select: { locationId: true, createdAt: true },
      },
    },
  });

  // Build a map: ingredientId_locationId → total purchased qty
  const purchasesMap = new Map<string, number>();
  for (const oi of recentOrderItems) {
    const key = `${oi.ingredientId}_${oi.orderList.locationId}`;
    purchasesMap.set(key, (purchasesMap.get(key) || 0) + oi.quantityNeeded);
  }

  // Get category cost targets
  const recipeCats = await prisma.category.findMany({
    where: { organizationId: orgId },
    select: { name: true, defaultCostTargetPct: true },
  });
  const costTargets: Record<string, number> = {};
  for (const cat of recipeCats) {
    if (cat.defaultCostTargetPct) {
      costTargets[cat.name] = cat.defaultCostTargetPct;
    }
  }

  // Serialize products for client
  const serialized = products.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    productType: p.productType,
    vendor: p.vendorRef?.name || p.vendor || null,
    vendorId: p.vendorId,
    ingredientCategory: p.ingredientCategory,
    bottleCostCents: p.bottleCostCents,
    bottleSizeMl: p.bottleSizeMl,
    bottleSizeUnit: p.bottleSizeUnit || "ml",
    yieldCount: p.yieldCount,
    yieldUnit: p.yieldUnit,
    casePackSize: p.casePackSize,
    orderUnit: p.orderUnit,
    onMenu: p.onMenu,
    menuStatus: p.menuStatus || "ON_MENU",
    isKeyItem: p.isKeyItem,
    notes: p.notes,
    menuPrice: null as number | null,
    costTargetPct: null as number | null,
    costUpdateMethod: p.costUpdateMethod,
    locationIds: p.inventoryItems.map((i) => i.locationId),
    locationCount: p.inventoryItems.length,
    // Inventory details per location (for Inventory mode)
    inventory: p.inventoryItems.map((inv) => {
      const purchaseKey = `${p.id}_${inv.locationId}`;
      return {
        id: inv.id,
        locationId: inv.locationId,
        locationName: inv.location.name,
        storageArea: inv.storageArea?.name || null,
        shelfLocation: inv.shelfLocation || null,
        storageArea2: inv.storageArea2?.name || null,
        shelfLocation2: inv.shelfLocation2 || null,
        isBTG: Boolean(inv.isBTG),
        isCraftCocktailIngredient: Boolean(inv.isCraftCocktailIngredient),
        isWellSpirit: Boolean(inv.isWellSpirit),
        isHalfBottle: Boolean(inv.isHalfBottle),
        isDessertWine: Boolean(inv.isDessertWine),
        markedForRemoval: inv.markedForRemoval || null,
        parLevel: inv.parLevel,
        currentStock: inv.currentStock,
        lastCountedAt: inv.lastCountedAt?.toISOString() || null,
        purchasesSinceLastCount: purchasesMap.get(purchaseKey) || 0,
        orderHistory: orderHistoryMap.get(`${p.id}_${inv.locationId}`) || [],
      };
    }),
  }));

  return (
    <UnifiedProductsPage
      products={serialized}
      locations={locations}
      vendors={vendors}
      categories={categories}
      structuredCategories={structuredCategories}
      standardPours={standardPours}
      costTargets={costTargets}
      bottleSizes={bottleSizes}
      useMergedOrderCart={org?.useMergedOrderCart ?? false}
    />
  );
}
