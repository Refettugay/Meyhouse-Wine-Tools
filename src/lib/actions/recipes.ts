"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";

interface RecipeIngredientInput {
  ingredientId: string;
  amount: number;
  unit: string;
  sortOrder: number;
  isTopOff: boolean;
  notes?: string;
}

export async function createRecipe(data: {
  name: string;
  categoryId: string;
  portionCount: number;
  dilutionPct: number;
  glassType?: string;
  iceType?: string;
  garnish?: string;
  pourFromBatch?: string;
  howTo?: string;
  storageType: string;
  noBatching: boolean;
  costTargetPct?: number;
  notes?: string;
  ingredients: RecipeIngredientInput[];
}) {
  const orgId = await getOrganizationId();

  const recipe = await prisma.recipe.create({
    data: {
      organizationId: orgId,
      categoryId: data.categoryId,
      name: data.name,
      portionCount: data.portionCount,
      dilutionPct: data.dilutionPct,
      glassType: data.glassType || null,
      iceType: data.iceType || null,
      garnish: data.garnish || null,
      pourFromBatch: data.pourFromBatch || null,
      howTo: data.howTo || null,
      storageType: data.storageType,
      noBatching: data.noBatching,
      costTargetPct: data.costTargetPct || null,
      notes: data.notes || null,
      ingredients: {
        create: data.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          amount: ing.amount,
          unit: ing.unit,
          sortOrder: ing.sortOrder,
          isTopOff: ing.isTopOff,
          notes: ing.notes || null,
        })),
      },
    },
  });

  revalidatePath("/dashboard/recipes");
  return { success: true, id: recipe.id };
}

export async function updateRecipe(
  id: string,
  data: {
    name: string;
    categoryId: string;
    portionCount: number;
    dilutionPct: number;
    glassType?: string;
    iceType?: string;
    garnish?: string;
    pourFromBatch?: string;
    howTo?: string;
    storageType: string;
    noBatching: boolean;
    costTargetPct?: number;
    menuPrice?: number;
    notes?: string;
    ingredients: RecipeIngredientInput[];
  }
) {
  const orgId = await getOrganizationId();

  // Delete existing ingredients and recreate
  await prisma.recipeIngredient.deleteMany({ where: { recipeId: id } });

  await prisma.recipe.update({
    where: { id, organizationId: orgId },
    data: {
      categoryId: data.categoryId,
      name: data.name,
      portionCount: data.portionCount,
      dilutionPct: data.dilutionPct,
      glassType: data.glassType || null,
      iceType: data.iceType || null,
      garnish: data.garnish || null,
      pourFromBatch: data.pourFromBatch || null,
      howTo: data.howTo || null,
      storageType: data.storageType,
      noBatching: data.noBatching,
      costTargetPct: data.costTargetPct || null,
      menuPrice: data.menuPrice || null,
      notes: data.notes || null,
      ingredients: {
        create: data.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          amount: ing.amount,
          unit: ing.unit,
          sortOrder: ing.sortOrder,
          isTopOff: ing.isTopOff,
          notes: ing.notes || null,
        })),
      },
    },
  });

  revalidatePath("/dashboard/recipes");
  revalidatePath(`/dashboard/recipes/${id}`);
  return { success: true };
}

export async function deleteRecipe(id: string) {
  const orgId = await getOrganizationId();
  await prisma.recipe.update({
    where: { id, organizationId: orgId },
    data: { isArchived: true },
  });
  revalidatePath("/dashboard/recipes");
}
