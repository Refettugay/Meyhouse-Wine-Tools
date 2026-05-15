"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";

interface SubRecipeIngredient {
  ingredientId: string;
  amount: number;
  unit: string;
  sortOrder: number;
}

export async function createSubRecipe(data: {
  name: string;
  categoryId: string;
  ingredients: SubRecipeIngredient[];
  yieldAmount: number;
  yieldUnitCode: string;
  shelfLifeDays?: number;
  storageType: string;
  prepInstructions?: string;
  notes?: string;
}) {
  const orgId = await getOrganizationId();

  if (!data.name.trim()) return { error: "Name is required" };
  if (data.ingredients.length === 0) return { error: "Add at least one ingredient" };
  if (!data.yieldAmount || data.yieldAmount <= 0) return { error: "Yield amount is required" };

  // 1. Create the sub-recipe
  const recipe = await prisma.recipe.create({
    data: {
      organizationId: orgId,
      categoryId: data.categoryId,
      name: data.name.trim(),
      isSubRecipe: true,
      yieldAmount: data.yieldAmount,
      yieldUnitCode: data.yieldUnitCode,
      shelfLifeDays: data.shelfLifeDays || null,
      storageType: data.storageType,
      prepInstructions: data.prepInstructions || null,
      notes: data.notes || null,
      portionCount: 1,
      dilutionPct: 0,
      noBatching: true,
      ingredients: {
        create: data.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          amount: ing.amount,
          unit: ing.unit,
          sortOrder: ing.sortOrder,
          isTopOff: false,
        })),
      },
    },
  });

  // 2. Auto-create an ingredient so this can be used in cocktail recipes
  // Check if ingredient with same name already exists
  const existingIngredient = await prisma.ingredient.findUnique({
    where: { organizationId_name: { organizationId: orgId, name: data.name.trim() } },
  });

  if (existingIngredient) {
    // Link existing ingredient to this sub-recipe
    await prisma.ingredient.update({
      where: { id: existingIngredient.id },
      data: {
        isHouseMade: true,
        subRecipeId: recipe.id,
        productType: "HOUSE_MADE",
        baseUnitCode: data.yieldUnitCode,
        countUnitCode: "each",
        // Clear any vendor cost — cost comes from sub-recipe now
      },
    });
  } else {
    // Create new ingredient
    await prisma.ingredient.create({
      data: {
        organizationId: orgId,
        name: data.name.trim(),
        type: "LIQUID",
        productType: "HOUSE_MADE",
        baseUnitCode: data.yieldUnitCode,
        countUnitCode: "each",
        isHouseMade: true,
        subRecipeId: recipe.id,
        onMenu: true,
        ingredientCategory: "House-Made",
      },
    });
  }

  revalidatePath("/dashboard/recipes");
  revalidatePath("/dashboard/products");
  return { success: true, recipeId: recipe.id };
}

export async function updateSubRecipe(
  id: string,
  data: {
    name: string;
    categoryId: string;
    ingredients: SubRecipeIngredient[];
    yieldAmount: number;
    yieldUnitCode: string;
    shelfLifeDays?: number;
    storageType: string;
    prepInstructions?: string;
    notes?: string;
  }
) {
  const orgId = await getOrganizationId();

  // Delete existing recipe ingredients and recreate
  await prisma.recipeIngredient.deleteMany({ where: { recipeId: id } });

  await prisma.recipe.update({
    where: { id, organizationId: orgId },
    data: {
      name: data.name.trim(),
      categoryId: data.categoryId,
      yieldAmount: data.yieldAmount,
      yieldUnitCode: data.yieldUnitCode,
      shelfLifeDays: data.shelfLifeDays || null,
      storageType: data.storageType,
      prepInstructions: data.prepInstructions || null,
      notes: data.notes || null,
      ingredients: {
        create: data.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          amount: ing.amount,
          unit: ing.unit,
          sortOrder: ing.sortOrder,
          isTopOff: false,
        })),
      },
    },
  });

  // Update the linked ingredient name if changed
  const linkedIngredient = await prisma.ingredient.findFirst({
    where: { subRecipeId: id, organizationId: orgId },
  });
  if (linkedIngredient && linkedIngredient.name !== data.name.trim()) {
    await prisma.ingredient.update({
      where: { id: linkedIngredient.id },
      data: {
        name: data.name.trim(),
        baseUnitCode: data.yieldUnitCode,
      },
    });
  }

  revalidatePath("/dashboard/recipes");
  revalidatePath("/dashboard/products");
  return { success: true };
}

// Calculate the cost of a sub-recipe from its ingredients
export async function calculateSubRecipeCost(recipeId: string): Promise<{
  totalCostCents: number;
  yieldAmount: number;
  yieldUnitCode: string;
  costPerUnitCents: number;
  ingredientCosts: { name: string; amount: number; unit: string; costCents: number }[];
}> {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, isSubRecipe: true },
    include: {
      ingredients: {
        include: { ingredient: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!recipe) {
    return { totalCostCents: 0, yieldAmount: 0, yieldUnitCode: "ml", costPerUnitCents: 0, ingredientCosts: [] };
  }

  const OZ_TO_ML = 29.5735;
  const DASH_TO_OZ = 0.02;
  const BARSPOON_TO_OZ = 0.125;

  const ingredientCosts = recipe.ingredients.map((ri) => {
    const ing = ri.ingredient;
    let costCents = 0;

    if (ing.bottleCostCents && ing.bottleSizeMl) {
      const costPerMl = ing.bottleCostCents / ing.bottleSizeMl;
      let amountMl: number;

      switch (ri.unit) {
        case "OZ":
        case "floz":
          amountMl = ri.amount * OZ_TO_ML;
          break;
        case "ML":
        case "ml":
          amountMl = ri.amount;
          break;
        case "DASH":
        case "dash":
          amountMl = ri.amount * DASH_TO_OZ * OZ_TO_ML;
          break;
        case "BARSPOON":
        case "barspoon":
          amountMl = ri.amount * BARSPOON_TO_OZ * OZ_TO_ML;
          break;
        case "cup":
          amountMl = ri.amount * 236.588;
          break;
        case "L":
          amountMl = ri.amount * 1000;
          break;
        default:
          amountMl = ri.amount * OZ_TO_ML;
      }
      costCents = Math.round(costPerMl * amountMl);
    } else if (ing.purchaseCostCents && ing.purchaseQty) {
      const costPerUnit = ing.purchaseCostCents / ing.purchaseQty;
      costCents = Math.round(costPerUnit * ri.amount);
    }

    return {
      name: ing.name,
      amount: ri.amount,
      unit: ri.unit,
      costCents,
    };
  });

  const totalCostCents = ingredientCosts.reduce((sum, ic) => sum + ic.costCents, 0);
  const yieldAmount = recipe.yieldAmount || 1;
  const yieldUnitCode = recipe.yieldUnitCode || "floz";
  const costPerUnitCents = yieldAmount > 0 ? Math.round(totalCostCents / yieldAmount) : 0;

  return {
    totalCostCents,
    yieldAmount,
    yieldUnitCode,
    costPerUnitCents,
    ingredientCosts,
  };
}

export async function deleteSubRecipe(id: string) {
  const orgId = await getOrganizationId();

  // Find and deactivate the linked ingredient
  const linkedIngredient = await prisma.ingredient.findFirst({
    where: { subRecipeId: id, organizationId: orgId },
  });
  if (linkedIngredient) {
    // Check if it's used in any cocktail recipes
    const usageCount = await prisma.recipeIngredient.count({
      where: { ingredientId: linkedIngredient.id, recipe: { isSubRecipe: false } },
    });
    if (usageCount > 0) {
      return {
        error: `Cannot delete: "${linkedIngredient.name}" is used in ${usageCount} cocktail recipe(s). Remove it from those recipes first.`,
      };
    }
    await prisma.ingredient.update({
      where: { id: linkedIngredient.id },
      data: { isActive: false, isHouseMade: false, subRecipeId: null },
    });
  }

  await prisma.recipe.update({
    where: { id, organizationId: orgId },
    data: { isArchived: true },
  });

  revalidatePath("/dashboard/recipes");
  revalidatePath("/dashboard/products");
  return { success: true };
}
