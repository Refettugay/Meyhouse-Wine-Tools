"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
  calculateIngredientCost,
  type IngredientCostInput,
} from "@/lib/calculations/cost";

export interface PricingRow {
  recipeId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categorySortOrder: number;
  costCents: number;           // total cost per portion in cents
  menuPriceCents: number | null; // current menu price in cents (recipe.menuPrice * 100)
  costTargetPct: number | null; // effective target cost % (recipe.costTargetPct || category.defaultCostTargetPct)
  costTargetSource: "recipe" | "category" | "none";
  actualCostPct: number | null; // costCents / menuPriceCents × 100
  suggestedPriceCents: number | null; // cost / targetPct
  status: "over" | "near" | "on-target" | "under" | "no-price" | "no-cost" | "no-target";
  portionCount: number;
  isArchived: boolean;
}

function classifyStatus(
  actualPct: number | null,
  targetPct: number | null,
  costCents: number,
  priceCents: number | null
): PricingRow["status"] {
  if (costCents === 0) return "no-cost";
  if (priceCents === null || priceCents === 0) return "no-price";
  if (targetPct === null) return "no-target";
  if (actualPct === null) return "no-price";
  const diff = actualPct - targetPct;
  if (diff > 3) return "over";        // more than 3% over target
  if (diff > 0) return "near";        // up to 3% over target (yellow zone)
  if (diff >= -5) return "on-target"; // within 5% under target (sweet spot)
  return "under";                      // way under target (can charge more)
}

export interface PricingFilter {
  /** If true, only return sub-recipes (isSubRecipe=true). If false, exclude sub-recipes. Default: false. */
  subRecipesOnly?: boolean;
  /** Keyword match (case-insensitive) against category name. One of these must match. */
  categoryKeywordsAny?: string[];
  /** Keywords to exclude (case-insensitive) from category name. */
  excludeCategoryKeywords?: string[];
}

export async function getPricingRows(filter: PricingFilter = {}): Promise<PricingRow[]> {
  const orgId = await getOrganizationId();

  const recipes = await prisma.recipe.findMany({
    where: {
      organizationId: orgId,
      isArchived: false,
      isSubRecipe: filter.subRecipesOnly === true ? true : false,
    },
    include: {
      category: { select: { id: true, name: true, sortOrder: true, defaultCostTargetPct: true } },
      ingredients: {
        include: {
          ingredient: {
            select: {
              type: true,
              bottleCostCents: true,
              bottleSizeMl: true,
              purchaseCostCents: true,
              purchaseQty: true,
            },
          },
        },
      },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const filteredRecipes = recipes.filter((r) => {
    const catName = r.category.name.toLowerCase();
    if (filter.categoryKeywordsAny && filter.categoryKeywordsAny.length > 0) {
      const match = filter.categoryKeywordsAny.some((kw) =>
        catName.includes(kw.toLowerCase())
      );
      if (!match) return false;
    }
    if (filter.excludeCategoryKeywords && filter.excludeCategoryKeywords.length > 0) {
      const hit = filter.excludeCategoryKeywords.some((kw) =>
        catName.includes(kw.toLowerCase())
      );
      if (hit) return false;
    }
    return true;
  });

  const rows: PricingRow[] = filteredRecipes.map((r) => {
    const costInputs: IngredientCostInput[] = r.ingredients.map((ri) => ({
      type: ri.ingredient.type,
      amount: ri.amount,
      unit: ri.unit,
      bottleCostCents: ri.ingredient.bottleCostCents,
      bottleSizeMl: ri.ingredient.bottleSizeMl,
      purchaseCostCents: ri.ingredient.purchaseCostCents,
      purchaseQty: ri.ingredient.purchaseQty,
    }));

    const totalBatchCost = costInputs.reduce(
      (sum, ing) => sum + calculateIngredientCost(ing),
      0
    );
    const portionCount = Math.max(1, r.portionCount ?? 1);
    const costCents = Math.round(totalBatchCost / portionCount);

    const menuPriceCents =
      r.menuPrice !== null && r.menuPrice !== undefined
        ? Math.round(r.menuPrice * 100)
        : null;

    const recipeTarget = r.costTargetPct ?? null;
    const categoryTarget = r.category.defaultCostTargetPct ?? null;
    const effectiveTarget = recipeTarget ?? categoryTarget ?? null;
    const targetSource: PricingRow["costTargetSource"] =
      recipeTarget !== null ? "recipe" : categoryTarget !== null ? "category" : "none";

    const actualCostPct =
      menuPriceCents !== null && menuPriceCents > 0
        ? (costCents / menuPriceCents) * 100
        : null;

    const suggestedPriceCents =
      effectiveTarget !== null && effectiveTarget > 0 && costCents > 0
        ? Math.round(Math.round(costCents / (effectiveTarget / 100)) / 50) * 50
        : null;

    return {
      recipeId: r.id,
      name: r.name,
      categoryId: r.categoryId,
      categoryName: r.category.name,
      categorySortOrder: r.category.sortOrder,
      costCents,
      menuPriceCents,
      costTargetPct: effectiveTarget,
      costTargetSource: targetSource,
      actualCostPct,
      suggestedPriceCents,
      status: classifyStatus(actualCostPct, effectiveTarget, costCents, menuPriceCents),
      portionCount,
      isArchived: r.isArchived,
    };
  });

  return rows;
}

export async function updateRecipeMenuPrice(recipeId: string, priceDollars: number | null) {
  const orgId = await getOrganizationId();
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, organizationId: orgId },
    select: { id: true },
  });
  if (!recipe) return { error: "Recipe not found" };

  await prisma.recipe.update({
    where: { id: recipeId },
    data: { menuPrice: priceDollars },
  });
  revalidatePath("/dashboard/finans-lab/pricing");
  return { success: true };
}

export async function updateRecipeCostTarget(recipeId: string, targetPct: number | null) {
  const orgId = await getOrganizationId();
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, organizationId: orgId },
    select: { id: true },
  });
  if (!recipe) return { error: "Recipe not found" };

  await prisma.recipe.update({
    where: { id: recipeId },
    data: { costTargetPct: targetPct },
  });
  revalidatePath("/dashboard/finans-lab/pricing");
  return { success: true };
}

export async function updateCategoryCostTarget(categoryId: string, targetPct: number | null) {
  const orgId = await getOrganizationId();
  const cat = await prisma.category.findFirst({
    where: { id: categoryId, organizationId: orgId },
    select: { id: true },
  });
  if (!cat) return { error: "Category not found" };

  await prisma.category.update({
    where: { id: categoryId },
    data: { defaultCostTargetPct: targetPct },
  });
  revalidatePath("/dashboard/finans-lab/pricing");
  return { success: true };
}

export async function applySuggestedPriceToRecipe(recipeId: string) {
  const rows = await getPricingRows();
  const row = rows.find((r) => r.recipeId === recipeId);
  if (!row || row.suggestedPriceCents === null) {
    return { error: "No suggested price available" };
  }
  const priceDollars = row.suggestedPriceCents / 100;
  return updateRecipeMenuPrice(recipeId, priceDollars);
}

export async function getCategoriesWithTargets() {
  const orgId = await getOrganizationId();
  return prisma.category.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, sortOrder: true, defaultCostTargetPct: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
