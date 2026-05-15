"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";

// ===== LOCATIONS =====

export async function createLocation(formData: FormData) {
  const orgId = await getOrganizationId();
  const name = formData.get("name") as string;
  if (!name) return { error: "Name is required" };

  const existing = await prisma.location.findUnique({
    where: { organizationId_name: { organizationId: orgId, name } },
  });
  if (existing) return { error: "A location with this name already exists" };

  const maxOrder = await prisma.location.findFirst({
    where: { organizationId: orgId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.location.create({
    data: {
      organizationId: orgId,
      name,
      sortOrder: (maxOrder?.sortOrder || 0) + 1,
    },
  });

  revalidatePath("/dashboard/inventory");
  return { success: true };
}

export async function deleteLocation(id: string) {
  const orgId = await getOrganizationId();
  await prisma.location.delete({
    where: { id, organizationId: orgId },
  });
  revalidatePath("/dashboard/inventory");
}

// ===== LOCATIONS =====

export async function renameLocation(id: string, newName: string) {
  const orgId = await getOrganizationId();
  const trimmed = newName.trim();
  if (!trimmed) return { error: "Name is required" };

  const location = await prisma.location.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!location) return { error: "Location not found" };

  const existing = await prisma.location.findFirst({
    where: { organizationId: orgId, name: trimmed, NOT: { id } },
  });
  if (existing) return { error: "A location with that name already exists" };

  await prisma.location.update({ where: { id }, data: { name: trimmed } });

  revalidatePath("/dashboard/settings/storage-areas");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  return { success: true };
}

// ===== STORAGE AREAS =====

export async function createStorageArea(locationId: string, name: string) {
  const orgId = await getOrganizationId();
  if (!name.trim()) return { error: "Name is required" };

  const existing = await prisma.storageArea.findUnique({
    where: { locationId_name: { locationId, name: name.trim() } },
  });
  if (existing) return { error: "This storage area already exists" };

  await prisma.storageArea.create({
    data: {
      organizationId: orgId,
      locationId,
      name: name.trim(),
    },
  });

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/settings/storage-areas");
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function renameStorageArea(id: string, newName: string) {
  const orgId = await getOrganizationId();
  const trimmed = newName.trim();
  if (!trimmed) return { error: "Name is required" };

  const area = await prisma.storageArea.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!area) return { error: "Storage area not found" };

  const existing = await prisma.storageArea.findFirst({
    where: {
      locationId: area.locationId,
      name: trimmed,
      NOT: { id },
    },
  });
  if (existing) return { error: "A storage area with that name already exists in this location" };

  await prisma.storageArea.update({
    where: { id },
    data: { name: trimmed },
  });

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/settings/storage-areas");
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function deleteStorageArea(id: string) {
  const orgId = await getOrganizationId();
  await prisma.storageArea.delete({
    where: { id, organizationId: orgId },
  });
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/settings/storage-areas");
  revalidatePath("/dashboard/products");
  return { success: true };
}

// ===== INVENTORY ITEMS =====

export async function addInventoryItem(data: {
  locationId: string;
  ingredientId: string;
  parLevel: number;
  currentStock: number;
  unit: string;
}) {
  const orgId = await getOrganizationId();

  const existing = await prisma.inventoryItem.findUnique({
    where: {
      locationId_ingredientId: {
        locationId: data.locationId,
        ingredientId: data.ingredientId,
      },
    },
  });
  if (existing) {
    return { error: "This ingredient already exists at this location" };
  }

  await prisma.inventoryItem.create({
    data: {
      organizationId: orgId,
      locationId: data.locationId,
      ingredientId: data.ingredientId,
      parLevel: data.parLevel,
      currentStock: data.currentStock,
      unit: data.unit,
    },
  });

  revalidatePath("/dashboard/inventory");
  return { success: true };
}

export async function updateInventoryItem(
  id: string,
  data: { parLevel?: number; currentStock?: number; unit?: string }
) {
  const orgId = await getOrganizationId();

  await prisma.inventoryItem.update({
    where: { id, organizationId: orgId },
    data: {
      ...(data.parLevel !== undefined && { parLevel: data.parLevel }),
      ...(data.currentStock !== undefined && {
        currentStock: data.currentStock,
        lastCountedAt: new Date(),
      }),
      ...(data.unit && { unit: data.unit }),
    },
  });

  revalidatePath("/dashboard/inventory");
  return { success: true };
}

export async function deleteInventoryItem(id: string) {
  const orgId = await getOrganizationId();
  await prisma.inventoryItem.delete({
    where: { id, organizationId: orgId },
  });
  revalidatePath("/dashboard/inventory");
}

// ===== SINGLE ITEM COUNT (auto-save) =====

export async function saveSingleCount(inventoryItemId: string, count: number) {
  const orgId = await getOrganizationId();
  const now = new Date();

  await prisma.inventoryItem.update({
    where: { id: inventoryItemId, organizationId: orgId },
    data: {
      currentStock: count,
      lastCountedAt: now,
    },
  });

  await prisma.stockCount.create({
    data: {
      inventoryItemId,
      count,
      countedAt: now,
    },
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  return { success: true };
}

// ===== UPDATE STORAGE AREA FOR PRODUCT (optionally per location) =====

export async function updateProductStorageArea(
  ingredientId: string,
  storageAreaName: string,
  locationId?: string,
  slot: 1 | 2 = 1
) {
  const orgId = await getOrganizationId();

  const storageArea = storageAreaName
    ? await prisma.storageArea.findFirst({
        where: { organizationId: orgId, name: storageAreaName, ...(locationId ? { locationId } : {}) },
      })
    : null;

  const where: { ingredientId: string; organizationId: string; locationId?: string } = { ingredientId, organizationId: orgId };
  if (locationId) where.locationId = locationId;

  if (slot === 2) {
    await prisma.inventoryItem.updateMany({
      where,
      data: { storageArea2Id: storageArea?.id || null },
    });
  } else {
    await prisma.inventoryItem.updateMany({
      where,
      data: { storageAreaId: storageArea?.id || null },
    });
  }

  revalidatePath("/dashboard/products");
  return { success: true };
}

// ===== UPDATE SHELF LOCATION FOR PRODUCT (optionally per location) =====

export async function updateProductShelf(
  ingredientId: string,
  shelfLocation: string,
  locationId?: string,
  slot: 1 | 2 = 1
) {
  const orgId = await getOrganizationId();

  const where: { ingredientId: string; organizationId: string; locationId?: string } = { ingredientId, organizationId: orgId };
  if (locationId) where.locationId = locationId;

  if (slot === 2) {
    await prisma.inventoryItem.updateMany({
      where,
      data: { shelfLocation2: shelfLocation || null },
    });
  } else {
    await prisma.inventoryItem.updateMany({
      where,
      data: { shelfLocation: shelfLocation || null },
    });
  }

  revalidatePath("/dashboard/products");
  return { success: true };
}

// ===== GENERATE ORDER FROM CART =====

export async function generateOrderFromCart(data: {
  locationId: string;
  items: {
    ingredientId: string;
    inventoryItemId: string;
    countedStock: number;
    parLevel: number;
    quantityNeeded: number;
    unit: string;
    vendor: string | null;
  }[];
  createdByName: string;
  notes?: string;
}) {
  const orgId = await getOrganizationId();
  const now = new Date();

  // 1. Update stock levels for all counted items
  for (const item of data.items) {
    await prisma.inventoryItem.update({
      where: { id: item.inventoryItemId, organizationId: orgId },
      data: {
        currentStock: item.countedStock,
        lastCountedAt: now,
      },
    });

    await prisma.stockCount.create({
      data: {
        inventoryItemId: item.inventoryItemId,
        count: item.countedStock,
        countedAt: now,
      },
    });
  }

  // 2. Get location name
  const location = await prisma.location.findFirst({
    where: { id: data.locationId, organizationId: orgId },
  });

  // 3. Create the order list
  const orderList = await prisma.orderList.create({
    data: {
      organizationId: orgId,
      locationId: data.locationId,
      name: `${location?.name || "Order"} - ${now.toLocaleDateString()}`,
      status: "DRAFT",
      createdBy: orgId,
      createdByName: data.createdByName,
      notes: data.notes || null,
      countedAt: now,
      items: {
        create: data.items.map((item) => ({
          ingredientId: item.ingredientId,
          vendor: item.vendor,
          countedStock: item.countedStock,
          parSnapshot: item.parLevel,
          quantityNeeded: item.quantityNeeded,
          unit: item.unit,
          status: "PENDING",
        })),
      },
    },
  });

  revalidatePath("/dashboard/products");
  return {
    success: true,
    orderListId: orderList.id,
    itemCount: data.items.length,
  };
}

// ===== SINGLE ITEM PAR UPDATE =====

export async function saveSinglePar(inventoryItemId: string, parLevel: number) {
  const orgId = await getOrganizationId();

  await prisma.inventoryItem.update({
    where: { id: inventoryItemId, organizationId: orgId },
    data: { parLevel },
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  return { success: true };
}

// ===== BULK STOCK COUNTING =====

export async function submitStockCounts(
  counts: { inventoryItemId: string; count: number }[]
) {
  const orgId = await getOrganizationId();
  const now = new Date();

  for (const { inventoryItemId, count } of counts) {
    await prisma.inventoryItem.update({
      where: { id: inventoryItemId, organizationId: orgId },
      data: {
        currentStock: count,
        lastCountedAt: now,
      },
    });

    await prisma.stockCount.create({
      data: {
        inventoryItemId,
        count,
        countedAt: now,
      },
    });
  }

  revalidatePath("/dashboard/inventory");
  return { success: true };
}

// ===== COMBINED COUNT + ORDER =====
// Save stock counts AND generate a timestamped order list in one step.
export async function saveCountAndOrder(data: {
  locationId: string;
  counts: { inventoryItemId: string; count: number }[];
  notes?: string;
}) {
  const orgId = await getOrganizationId();
  const now = new Date();

  // Fetch the location for the order name
  const location = await prisma.location.findFirst({
    where: { id: data.locationId, organizationId: orgId },
  });
  if (!location) return { error: "Location not found" };

  // Fetch all inventory items involved, with their ingredient + storage area info
  const inventoryIds = data.counts.map((c) => c.inventoryItemId);
  const inventoryItems = await prisma.inventoryItem.findMany({
    where: { id: { in: inventoryIds }, organizationId: orgId },
    include: {
      ingredient: { include: { vendorRef: true } },
      storageArea: true,
    },
  });

  // Build a map for quick lookup
  const itemMap = new Map(inventoryItems.map((i) => [i.id, i]));

  // Update stock levels and create stock count records
  for (const { inventoryItemId, count } of data.counts) {
    await prisma.inventoryItem.update({
      where: { id: inventoryItemId, organizationId: orgId },
      data: {
        currentStock: count,
        lastCountedAt: now,
      },
    });
    await prisma.stockCount.create({
      data: {
        inventoryItemId,
        count,
        countedAt: now,
      },
    });
  }

  // Determine which items need reordering
  // For items ordered BY CASE, round up bottlesNeeded to the nearest full case
  // and express quantityNeeded in cases.
  const orderItems = data.counts
    .map(({ inventoryItemId, count }) => {
      const item = itemMap.get(inventoryItemId);
      if (!item) return null;
      const bottlesNeeded = Math.max(0, item.parLevel - count);
      if (bottlesNeeded <= 0) return null;

      const orderUnit = item.ingredient.orderUnit || "BOTTLE";
      // Safety fallback: if product is ordered by case but no case size is set,
      // default to 12 (standard wine/spirit case).
      const casePack =
        orderUnit === "CASE"
          ? item.ingredient.casePackSize && item.ingredient.casePackSize > 1
            ? item.ingredient.casePackSize
            : 12
          : 1;

      let quantityNeeded: number;
      let unit: string;

      if (orderUnit === "CASE") {
        // Round up to nearest full case
        quantityNeeded = Math.ceil(bottlesNeeded / casePack);
        unit = "case";
      } else {
        quantityNeeded = Math.ceil(bottlesNeeded);
        unit = "bottle";
      }

      return {
        ingredientId: item.ingredientId,
        vendor: item.ingredient.vendorRef?.name || item.ingredient.vendor || null,
        countedStock: count,
        parSnapshot: item.parLevel,
        quantityNeeded,
        unit,
        storageArea: item.storageArea?.name || null,
        status: "PENDING",
      };
    })
    .filter((i): i is NonNullable<typeof i> => i !== null);

  // Always create an order list (even if empty) so history is complete.
  // Empty orders are marked COMPLETED since there's nothing to order.
  const orderList = await prisma.orderList.create({
    data: {
      organizationId: orgId,
      locationId: data.locationId,
      name: `${location.name} - ${now.toLocaleDateString()}`,
      status: orderItems.length === 0 ? "COMPLETED" : "DRAFT",
      notes: data.notes || null,
      countedAt: now,
      items: {
        create: orderItems,
      },
    },
  });

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/orders");
  return {
    success: true,
    orderListId: orderList.id,
    itemsToOrder: orderItems.length,
    totalCounted: data.counts.length,
  };
}

// ===== ORDER LIST GENERATION (legacy, kept for compatibility) =====

export async function generateOrderList(locationId: string) {
  const orgId = await getOrganizationId();

  const items = await prisma.inventoryItem.findMany({
    where: { organizationId: orgId, locationId },
    include: { ingredient: true, location: true },
  });

  const location = items[0]?.location;
  if (!location) return { error: "No inventory items at this location" };

  // Calculate items that need ordering
  const needed = items
    .map((item) => ({
      ingredient: item.ingredient,
      quantityNeeded: Math.max(0, item.parLevel - item.currentStock),
      unit: item.unit,
    }))
    .filter((i) => i.quantityNeeded > 0);

  if (needed.length === 0) {
    return { error: "No items need to be ordered (all at or above par)" };
  }

  const orderList = await prisma.orderList.create({
    data: {
      organizationId: orgId,
      locationId,
      name: `Order - ${location.name} - ${new Date().toLocaleDateString()}`,
      status: "DRAFT",
      items: {
        create: needed.map((n) => ({
          ingredientId: n.ingredient.id,
          vendor: n.ingredient.vendor,
          quantityNeeded: Math.ceil(n.quantityNeeded),
          unit: n.unit,
          status: "PENDING",
        })),
      },
    },
  });

  revalidatePath("/dashboard/inventory/orders");
  return { success: true, orderListId: orderList.id };
}

export async function updateOrderItemStatus(itemId: string, status: string) {
  const orgId = await getOrganizationId();
  const item = await prisma.orderListItem.findFirst({
    where: { id: itemId, orderList: { organizationId: orgId } },
  });
  if (!item) return { error: "Not found" };

  await prisma.orderListItem.update({
    where: { id: itemId },
    data: { status },
  });

  revalidatePath("/dashboard/inventory/orders");
  return { success: true };
}

export async function deleteOrderList(id: string) {
  const orgId = await getOrganizationId();
  await prisma.orderList.delete({
    where: { id, organizationId: orgId },
  });
  revalidatePath("/dashboard/inventory/orders");
}
