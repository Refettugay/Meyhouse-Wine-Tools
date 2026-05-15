"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function createIngredient(formData: FormData) {
  const orgId = await getOrganizationId();

  const name = formData.get("name") as string;
  const type = (formData.get("type") as string) || "LIQUID";
  const bottleCost = formData.get("bottleCost") as string;
  const bottleSizeMl = formData.get("bottleSizeMl") as string;
  const purchaseCost = formData.get("purchaseCost") as string;
  const purchaseQty = formData.get("purchaseQty") as string;
  const purchaseUnit = formData.get("purchaseUnit") as string;
  const vendor = formData.get("vendor") as string;
  const ingredientCategory = formData.get("ingredientCategory") as string;

  if (!name) return { error: "Name is required" };

  const existing = await prisma.ingredient.findUnique({
    where: { organizationId_name: { organizationId: orgId, name } },
  });
  if (existing) return { error: "An ingredient with this name already exists" };

  await prisma.ingredient.create({
    data: {
      organizationId: orgId,
      name,
      type,
      bottleCostCents: bottleCost ? Math.round(parseFloat(bottleCost) * 100) : null,
      bottleSizeMl: bottleSizeMl ? parseInt(bottleSizeMl) : null,
      purchaseCostCents: purchaseCost ? Math.round(parseFloat(purchaseCost) * 100) : null,
      purchaseQty: purchaseQty ? parseFloat(purchaseQty) : null,
      purchaseUnit: purchaseUnit || null,
      vendor: vendor || null,
      ingredientCategory: ingredientCategory || null,
    },
  });

  revalidatePath("/dashboard/ingredients");
  return { success: true };
}

export async function updateIngredient(id: string, formData: FormData) {
  const orgId = await getOrganizationId();

  const name = formData.get("name") as string;
  const type = (formData.get("type") as string) || "LIQUID";
  const bottleCost = formData.get("bottleCost") as string;
  const bottleSizeMl = formData.get("bottleSizeMl") as string;
  const purchaseCost = formData.get("purchaseCost") as string;
  const purchaseQty = formData.get("purchaseQty") as string;
  const purchaseUnit = formData.get("purchaseUnit") as string;
  const vendor = formData.get("vendor") as string;
  const ingredientCategory = formData.get("ingredientCategory") as string;

  await prisma.ingredient.update({
    where: { id, organizationId: orgId },
    data: {
      name,
      type,
      bottleCostCents: bottleCost ? Math.round(parseFloat(bottleCost) * 100) : null,
      bottleSizeMl: bottleSizeMl ? parseInt(bottleSizeMl) : null,
      purchaseCostCents: purchaseCost ? Math.round(parseFloat(purchaseCost) * 100) : null,
      purchaseQty: purchaseQty ? parseFloat(purchaseQty) : null,
      purchaseUnit: purchaseUnit || null,
      vendor: vendor || null,
      ingredientCategory: ingredientCategory || null,
    },
  });

  revalidatePath("/dashboard/ingredients");
  return { success: true };
}

export async function deleteIngredient(id: string) {
  const orgId = await getOrganizationId();
  await prisma.ingredient.update({
    where: { id, organizationId: orgId },
    data: { isActive: false },
  });
  revalidatePath("/dashboard/ingredients");
}
