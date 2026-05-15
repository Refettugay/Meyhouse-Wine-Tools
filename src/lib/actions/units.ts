"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getUnits() {
  return prisma.unit.findMany({
    orderBy: [{ measureType: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getActiveUnits() {
  return prisma.unit.findMany({
    where: { isActive: true },
    orderBy: [{ measureType: "asc" }, { sortOrder: "asc" }],
  });
}

export async function getUnitsByType(measureType: string) {
  return prisma.unit.findMany({
    where: { isActive: true, measureType },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getPurchaseUnits() {
  return prisma.unit.findMany({
    where: { isActive: true, canPurchase: true },
    orderBy: [{ measureType: "asc" }, { sortOrder: "asc" }],
  });
}

export async function getRecipeUnits() {
  return prisma.unit.findMany({
    where: { isActive: true, canRecipe: true },
    orderBy: [{ measureType: "asc" }, { sortOrder: "asc" }],
  });
}

export async function createUnit(data: {
  code: string;
  name: string;
  abbrev: string;
  measureType: string;
  baseFactor: number;
  canPurchase?: boolean;
  canRecipe?: boolean;
}) {
  if (!data.code.trim() || !data.name.trim()) {
    return { error: "Code and name are required" };
  }

  const existing = await prisma.unit.findUnique({
    where: { code: data.code.trim().toLowerCase() },
  });
  if (existing) return { error: "A unit with this code already exists" };

  if (data.baseFactor <= 0) {
    return { error: "Conversion factor must be greater than 0" };
  }

  const maxOrder = await prisma.unit.findFirst({
    where: { measureType: data.measureType },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.unit.create({
    data: {
      code: data.code.trim().toLowerCase(),
      name: data.name.trim(),
      abbrev: data.abbrev.trim(),
      measureType: data.measureType,
      baseFactor: data.baseFactor,
      canPurchase: data.canPurchase ?? true,
      canRecipe: data.canRecipe ?? true,
      isActive: true,
      isSystem: false,
      sortOrder: (maxOrder?.sortOrder || 0) + 10,
    },
  });

  revalidatePath("/dashboard/settings/units");
  return { success: true };
}

export async function updateUnit(
  id: string,
  data: {
    name?: string;
    abbrev?: string;
    canPurchase?: boolean;
    canRecipe?: boolean;
    isActive?: boolean;
  }
) {
  await prisma.unit.update({
    where: { id },
    data,
  });
  revalidatePath("/dashboard/settings/units");
  return { success: true };
}

export async function deleteUnit(id: string) {
  // Only allow deleting user-created units
  const unit = await prisma.unit.findUnique({ where: { id } });
  if (!unit) return { error: "Not found" };
  if (unit.isSystem) {
    return { error: "Cannot delete system units. You can deactivate them instead." };
  }

  // Check if used by any ProductSKU
  const usage = await prisma.productSKU.count({ where: { innerUnitId: id } });
  if (usage > 0) {
    return { error: `Cannot delete: this unit is used by ${usage} product SKU(s). Deactivate instead.` };
  }

  await prisma.unit.delete({ where: { id } });
  revalidatePath("/dashboard/settings/units");
  return { success: true };
}

