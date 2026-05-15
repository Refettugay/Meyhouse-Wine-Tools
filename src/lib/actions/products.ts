"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function createProduct(data: {
  name: string;
  type: string;
  vendorId?: string;
  ingredientCategory?: string;
  bottleSizeMl?: number;
  bottleSizeUnit?: string;
  yieldCount?: number | null;
  yieldUnit?: string | null;
  casePackSize?: number;
  bottleCostCents?: number;
  purchaseCostCents?: number;
  purchaseQty?: number;
  purchaseUnit?: string;
  notes?: string;
  onMenu?: boolean;
  locationIds: string[];
  parLevel: number;
}) {
  const orgId = await getOrganizationId();
  if (!data.name.trim()) return { error: "Name is required" };

  const existing = await prisma.ingredient.findUnique({
    where: { organizationId_name: { organizationId: orgId, name: data.name.trim() } },
  });
  if (existing) return { error: "A product with this name already exists" };

  // Fetch vendor name for the legacy `vendor` string field
  let vendorName: string | null = null;
  if (data.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: data.vendorId, organizationId: orgId },
    });
    if (vendor) vendorName = vendor.name;
  }

  const onMenu = data.onMenu ?? true;

  const ingredient = await prisma.ingredient.create({
    data: {
      organizationId: orgId,
      name: data.name.trim(),
      type: data.type || "LIQUID",
      vendorId: data.vendorId || null,
      vendor: vendorName,
      ingredientCategory: data.ingredientCategory || null,
      bottleSizeMl: data.bottleSizeMl || null,
      bottleSizeUnit: data.bottleSizeUnit || "ml",
      yieldCount: data.yieldCount ?? null,
      yieldUnit: data.yieldUnit ?? null,
      casePackSize: data.casePackSize || null,
      bottleCostCents: data.bottleCostCents || null,
      purchaseCostCents: data.purchaseCostCents || null,
      purchaseQty: data.purchaseQty || null,
      purchaseUnit: data.purchaseUnit || null,
      notes: data.notes || null,
      onMenu,
    },
  });

  // Only create inventory items if on menu
  if (onMenu && data.locationIds.length > 0) {
    await prisma.inventoryItem.createMany({
      data: data.locationIds.map((locationId) => ({
        organizationId: orgId,
        locationId,
        ingredientId: ingredient.id,
        parLevel: data.parLevel,
        currentStock: 0,
        unit: "bottle",
      })),
    });
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/database");
  revalidatePath("/dashboard/inventory");
  return { success: true, id: ingredient.id };
}

export async function updateProduct(
  id: string,
  data: {
    name: string;
    type: string;
    vendorId?: string;
    ingredientCategory?: string;
    bottleSizeMl?: number;
    bottleSizeUnit?: string;
    yieldCount?: number | null;
    yieldUnit?: string | null;
    casePackSize?: number;
    bottleCostCents?: number;
    purchaseCostCents?: number;
    purchaseQty?: number;
    purchaseUnit?: string;
    notes?: string;
    locationIds: string[];
    parLevel?: number;
  }
) {
  const orgId = await getOrganizationId();

  const trimmedName = data.name.trim();

  // Pre-check for name conflicts (including hidden/INACTIVE/DATABASE products)
  const conflict = await prisma.ingredient.findFirst({
    where: {
      organizationId: orgId,
      name: trimmedName,
      NOT: { id },
    },
    select: { id: true, name: true, menuStatus: true },
  });
  if (conflict) {
    const statusLabel = conflict.menuStatus === "INACTIVE" ? "inactive" : conflict.menuStatus === "DATABASE" ? "database" : "on menu";
    throw new Error(`A product named "${trimmedName}" already exists (status: ${statusLabel}). Rename or delete the existing product first.`);
  }

  let vendorName: string | null = null;
  if (data.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: data.vendorId, organizationId: orgId },
    });
    if (vendor) vendorName = vendor.name;
  }

  await prisma.ingredient.update({
    where: { id, organizationId: orgId },
    data: {
      name: trimmedName,
      type: data.type,
      vendorId: data.vendorId || null,
      vendor: vendorName,
      ingredientCategory: data.ingredientCategory || null,
      bottleSizeMl: data.bottleSizeMl || null,
      bottleSizeUnit: data.bottleSizeUnit || "ml",
      yieldCount: data.yieldCount ?? null,
      yieldUnit: data.yieldUnit ?? null,
      casePackSize: data.casePackSize || null,
      bottleCostCents: data.bottleCostCents || null,
      purchaseCostCents: data.purchaseCostCents || null,
      purchaseQty: data.purchaseQty || null,
      purchaseUnit: data.purchaseUnit || null,
      notes: data.notes ?? null,
    },
  });

  // Sync inventory items with selected locations
  const existingItems = await prisma.inventoryItem.findMany({
    where: { ingredientId: id, organizationId: orgId },
  });

  const existingLocationIds = new Set(existingItems.map((i) => i.locationId));
  const newLocationIds = new Set(data.locationIds);

  const toAdd = data.locationIds.filter((lid) => !existingLocationIds.has(lid));
  if (toAdd.length > 0) {
    await prisma.inventoryItem.createMany({
      data: toAdd.map((locationId) => ({
        organizationId: orgId,
        locationId,
        ingredientId: id,
        parLevel: data.parLevel || 0,
        currentStock: 0,
        unit: "bottle",
      })),
    });
  }

  const toRemove = existingItems.filter((i) => !newLocationIds.has(i.locationId));
  if (toRemove.length > 0) {
    await prisma.inventoryItem.deleteMany({
      where: { id: { in: toRemove.map((i) => i.id) } },
    });
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/database");
  revalidatePath("/dashboard/inventory");
  return { success: true };
}

// Move product to Master Product Database (tasted, might add later)
export async function moveProductToDatabase(id: string) {
  const orgId = await getOrganizationId();
  await prisma.ingredient.update({
    where: { id, organizationId: orgId },
    data: { onMenu: false, menuStatus: "DATABASE" },
  });
  revalidatePath("/dashboard/products");
  return { success: true };
}

// Mark product as Inactive (deleted from menu, unlikely to return)
export async function moveProductToInactive(id: string) {
  const orgId = await getOrganizationId();
  await prisma.ingredient.update({
    where: { id, organizationId: orgId },
    data: { onMenu: false, menuStatus: "INACTIVE" },
  });
  revalidatePath("/dashboard/products");
  return { success: true };
}

// Legacy alias
export async function deleteProduct(id: string) {
  return moveProductToDatabase(id);
}

// Mark/unmark product for future removal at a SPECIFIC store (per-store flag)
export async function toggleMarkForRemoval(
  ingredientId: string,
  locationId: string,
  target: "INACTIVE" | "DATABASE" | null
) {
  const orgId = await getOrganizationId();
  await prisma.inventoryItem.updateMany({
    where: { ingredientId, locationId, organizationId: orgId },
    data: { markedForRemoval: target },
  });
  revalidatePath("/dashboard/products");
  return { success: true };
}

// Hard delete — permanently removes a product and ALL related records.
export async function hardDeleteProduct(id: string) {
  const orgId = await getOrganizationId();

  // Check if product still exists first
  const exists = await prisma.ingredient.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!exists) {
    // Already deleted — just revalidate so the UI refreshes
    revalidatePath("/dashboard/products");
    return { success: true, alreadyDeleted: true };
  }

  // Get inventory items so we can delete stock counts linked to them
  const invItems = await prisma.inventoryItem.findMany({
    where: { ingredientId: id, organizationId: orgId },
    select: { id: true },
  });
  const invIds = invItems.map((i) => i.id);

  // Delete stock counts first (they reference inventory items)
  if (invIds.length > 0) {
    await prisma.stockCount.deleteMany({ where: { inventoryItemId: { in: invIds } } });
  }

  // Delete order list items that reference this ingredient (if any)
  try {
    await prisma.orderListItem.deleteMany({ where: { ingredientId: id } });
  } catch { /* table may not have that field */ }

  // Delete recipe ingredients referencing this product
  await prisma.recipeIngredient.deleteMany({ where: { ingredientId: id } });

  // Delete product SKUs
  await prisma.productSKU.deleteMany({ where: { ingredientId: id } });

  // Delete inventory items
  await prisma.inventoryItem.deleteMany({ where: { ingredientId: id, organizationId: orgId } });

  // Finally delete the ingredient itself
  await prisma.ingredient.delete({ where: { id, organizationId: orgId } });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/recipes");
  return { success: true };
}

// Toggle product tags per store (BTG Wine, Craft Cocktail Ingredient, Well Spirit)
export async function toggleProductTag(
  ingredientId: string,
  locationId: string,
  tag: "btg" | "craft" | "well" | "half" | "dessert",
  value: boolean
) {
  const orgId = await getOrganizationId();
  const data: { isBTG?: boolean; isCraftCocktailIngredient?: boolean; isWellSpirit?: boolean; isHalfBottle?: boolean; isDessertWine?: boolean } = {};
  if (tag === "btg") data.isBTG = value;
  if (tag === "craft") data.isCraftCocktailIngredient = value;
  if (tag === "well") data.isWellSpirit = value;
  if (tag === "half") data.isHalfBottle = value;
  if (tag === "dessert") data.isDessertWine = value;
  await prisma.inventoryItem.updateMany({
    where: { ingredientId, locationId, organizationId: orgId },
    data,
  });
  revalidatePath("/dashboard/products");
  return { success: true };
}

// Restore product back to active menu
export async function moveProductToMenu(id: string) {
  const orgId = await getOrganizationId();
  await prisma.ingredient.update({
    where: { id, organizationId: orgId },
    data: { onMenu: true, menuStatus: "ON_MENU" },
  });
  revalidatePath("/dashboard/products");
  return { success: true };
}

// Permanently remove a product (only from database, not from menu).
export async function permanentlyDeleteProduct(id: string) {
  const orgId = await getOrganizationId();
  // Refuse if the product still has recipes pointing to it
  const recipeCount = await prisma.recipeIngredient.count({
    where: { ingredientId: id },
  });
  if (recipeCount > 0) {
    return { error: "Cannot delete: this product is still used in recipes" };
  }
  // Also refuse if there are any inventory items
  const invCount = await prisma.inventoryItem.count({ where: { ingredientId: id } });
  if (invCount > 0) {
    return { error: "Cannot delete: remove all inventory items first" };
  }
  await prisma.ingredient.delete({
    where: { id, organizationId: orgId },
  });
  revalidatePath("/dashboard/database");
  return { success: true };
}

export async function updateProductNotes(id: string, notes: string) {
  const orgId = await getOrganizationId();
  await prisma.ingredient.update({
    where: { id, organizationId: orgId },
    data: { notes: notes || null },
  });
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/database");
  return { success: true };
}
