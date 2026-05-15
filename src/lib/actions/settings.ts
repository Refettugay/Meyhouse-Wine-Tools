"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
  type CategoriesConfig,
  type ParentCategory,
  type SubCategory,
  type ServingStyle,
  type PourSize,
  DEFAULT_PARENTS,
  isNewCategoryFormat,
  parseCategoriesConfig,
  PRODUCT_TYPE_TO_PARENT,
} from "@/lib/category-types";

// ===== Helpers =====

function parseArray<T>(json: string | null | undefined, fallback: T[]): T[] {
  if (!json) return fallback;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function revalidateAll() {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/categories");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/database");
}

export async function getOrgSettings() {
  const orgId = await getOrganizationId();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      settingsBottleSizes: true,
      settingsCaseSizes: true,
      settingsCategories: true,
      settingsShelfLabels: true,
    },
  });

  // Get sub-category names for backward compat (filter dropdowns etc.)
  const config = await getCategoriesConfig();
  const categoryNames = config.subs.map((s) => s.name).sort();

  return {
    bottleSizes: parseArray<number>(org?.settingsBottleSizes, [
      148, 200, 300, 330, 355, 375, 473, 500, 700, 750, 900, 1000, 1500, 1750, 4997, 19533, 29337, 58674,
    ]),
    caseSizes: parseArray<number>(org?.settingsCaseSizes, [1, 6, 12, 24]),
    categories: categoryNames,
    shelfLabels: parseArray<string>(org?.settingsShelfLabels, []),
  };
}

// ===== Categories Config (Parent + Sub) =====

export async function getCategoriesConfig(): Promise<CategoriesConfig> {
  const orgId = await getOrganizationId();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      settingsCategories: true,
      settingsStandardPours: true,
    },
  });

  // Check if already in new format
  if (isNewCategoryFormat(org?.settingsCategories)) {
    const config = parseCategoriesConfig(org?.settingsCategories)!;
    // If subs is empty but products have categories, re-migrate
    if (config.subs.length === 0) {
      const hasCats = await prisma.ingredient.count({
        where: { organizationId: orgId, isActive: true, ingredientCategory: { not: null } },
      });
      if (hasCats > 0) {
        return await migrateCategoriesConfig();
      }
    }
    return config;
  }

  // Need to migrate from old format
  return await migrateCategoriesConfig();
}

// Save config back to DB
async function saveCategoriesConfig(config: CategoriesConfig) {
  const orgId = await getOrganizationId();
  await prisma.organization.update({
    where: { id: orgId },
    data: { settingsCategories: JSON.stringify(config) },
  });
  revalidateAll();
}

// Migrate old string[] or ProductCategoryData[] to new CategoriesConfig
async function migrateCategoriesConfig(): Promise<CategoriesConfig> {
  const orgId = await getOrganizationId();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settingsCategories: true, settingsStandardPours: true },
  });

  let standardPours: Record<string, number> = {};
  try { standardPours = JSON.parse(org?.settingsStandardPours || "{}"); } catch { standardPours = {}; }

  // Get products to infer parent types
  const products = await prisma.ingredient.findMany({
    where: { organizationId: orgId, isActive: true, ingredientCategory: { not: null } },
    select: { ingredientCategory: true, productType: true },
  });

  const catTypeCount: Record<string, Record<string, number>> = {};
  for (const p of products) {
    const cat = p.ingredientCategory!;
    const pt = p.productType || "OTHER";
    if (!catTypeCount[cat]) catTypeCount[cat] = {};
    catTypeCount[cat][pt] = (catTypeCount[cat][pt] || 0) + 1;
  }

  function inferProductType(catName: string): string {
    const counts = catTypeCount[catName];
    if (counts) {
      const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
      if (sorted.length > 0) return sorted[0][0];
    }
    const lower = catName.toLowerCase();
    if (lower.includes("bourbon") || lower.includes("vodka") || lower.includes("gin") ||
        lower.includes("tequila") || lower.includes("rum") || lower.includes("whiskey") ||
        lower.includes("scotch") || lower.includes("rye") || lower.includes("mezcal") ||
        lower.includes("cognac")) return "SPIRIT";
    if (lower.includes("wine") || lower.includes("btg") || lower.includes("btb") ||
        lower.includes("sparkling") || lower.includes("champagne")) return "WINE";
    if (lower.includes("beer") || lower.includes("ipa") || lower.includes("ale") ||
        lower.includes("lager") || lower.includes("draft")) return "BEER";
    if (lower.includes("cordial") || lower.includes("liqueur") || lower.includes("amaro") ||
        lower.includes("vermouth") || lower.includes("aperol")) return "CORDIAL";
    if (lower.includes("bitter")) return "BITTER";
    if (lower.includes("syrup") || lower.includes("mixer")) return "SYRUP";
    if (lower.includes("grocery") || lower.includes("supply") || lower.includes("ice")) return "GROCERY";
    if (lower.includes("produce") || lower.includes("fruit") || lower.includes("herb") || lower.includes("garnish")) return "PRODUCE";
    if (lower.includes("meat") || lower.includes("seafood")) return "MEAT";
    if (lower.includes("dairy") || lower.includes("cream")) return "DAIRY";
    if (lower.includes("dry good") || lower.includes("baking")) return "DRY_GOODS";
    if (lower.includes("na ") || lower.includes("soda") || lower.includes("juice")) return "NA_BEVERAGE";
    return "OTHER";
  }

  function inferServingStyle(catName: string, productType: string): ServingStyle {
    const lower = catName.toLowerCase();
    if (lower.includes("btg") || lower.includes("by the glass") || lower.includes("draft")) return "BTG";
    if (lower.includes("btb") || lower.includes("by the bottle")) return "BTB";
    const nonPourTypes = ["GROCERY", "PRODUCE", "MEAT", "DAIRY", "DRY_GOODS"];
    if (nonPourTypes.includes(productType)) return "NONE";
    return "STANDARD";
  }

  // Get category names directly from products (most reliable source)
  const distinctCats = await prisma.ingredient.findMany({
    where: { organizationId: orgId, isActive: true, ingredientCategory: { not: null } },
    select: { ingredientCategory: true },
    distinct: ["ingredientCategory"],
  });
  const oldCatNames = [...new Set(distinctCats.map((c) => c.ingredientCategory!))].sort();

  // Build parent categories from defaults
  const parents: ParentCategory[] = [...DEFAULT_PARENTS];

  // Build sub-categories from old names
  const subs: SubCategory[] = oldCatNames.map((name) => {
    const productType = inferProductType(name);
    const parentName = PRODUCT_TYPE_TO_PARENT[productType] || "Other";
    const servingStyle = inferServingStyle(name, productType);

    // Get pour sizes from parent defaults
    const parentDef = DEFAULT_PARENTS.find((p) => p.name === parentName);
    let pourSizes: PourSize[] = parentDef?.defaultPourSizes || [];
    const orgPour = standardPours[productType];
    if (orgPour && servingStyle === "STANDARD") {
      pourSizes = [{ label: "Standard", amount: orgPour, unit: "oz" }];
    }
    if (servingStyle === "BTB" || servingStyle === "NONE") {
      pourSizes = [];
    }

    return { name, parent: parentName, servingStyle, pourSizes };
  });

  const config: CategoriesConfig = { parents, subs };

  // Save
  await prisma.organization.update({
    where: { id: orgId },
    data: { settingsCategories: JSON.stringify(config) },
  });
  // No revalidateAll() — this runs during page render (see callers in
  // getCategoriesConfig); Next.js 16 forbids revalidatePath from a render path.
  // The current render will already use the freshly-saved config.
  return config;
}

// ===== Parent Category CRUD =====

export async function addParentCategory(data: ParentCategory) {
  const config = await getCategoriesConfig();
  const trimmed = data.name.trim();
  if (!trimmed) return { error: "Name is required" };
  if (config.parents.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    return { error: "That parent category already exists" };
  }
  config.parents.push({ ...data, name: trimmed });
  config.parents.sort((a, b) => a.name.localeCompare(b.name));
  await saveCategoriesConfig(config);
  return { success: true };
}

export async function updateParentCategory(oldName: string, data: ParentCategory) {
  const config = await getCategoriesConfig();
  const idx = config.parents.findIndex((p) => p.name === oldName);
  if (idx === -1) return { error: "Parent category not found" };

  const trimmed = data.name.trim();
  if (!trimmed) return { error: "Name is required" };

  // If name changed, update all sub-categories referencing this parent
  if (trimmed !== oldName) {
    if (config.parents.some((p, i) => i !== idx && p.name.toLowerCase() === trimmed.toLowerCase())) {
      return { error: "A parent category with that name already exists" };
    }
    for (const sub of config.subs) {
      if (sub.parent === oldName) sub.parent = trimmed;
    }
  }

  config.parents[idx] = { ...data, name: trimmed };
  config.parents.sort((a, b) => a.name.localeCompare(b.name));
  await saveCategoriesConfig(config);
  return { success: true };
}

export async function deleteParentCategory(name: string) {
  const config = await getCategoriesConfig();
  const subsUsingIt = config.subs.filter((s) => s.parent === name);
  if (subsUsingIt.length > 0) {
    return { error: `Cannot delete — ${subsUsingIt.length} sub-categories use this parent. Delete or reassign them first.` };
  }
  config.parents = config.parents.filter((p) => p.name !== name);
  await saveCategoriesConfig(config);
  return { success: true };
}

// ===== Sub-Category CRUD =====

export async function addSubCategory(data: SubCategory) {
  const config = await getCategoriesConfig();
  const trimmed = data.name.trim();
  if (!trimmed) return { error: "Name is required" };
  if (config.subs.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
    return { error: "That sub-category already exists" };
  }
  if (!config.parents.some((p) => p.name === data.parent)) {
    return { error: "Parent category not found" };
  }
  config.subs.push({ ...data, name: trimmed });
  config.subs.sort((a, b) => a.name.localeCompare(b.name));
  await saveCategoriesConfig(config);
  return { success: true };
}

export async function updateSubCategory(oldName: string, data: SubCategory) {
  const orgId = await getOrganizationId();
  const config = await getCategoriesConfig();
  const idx = config.subs.findIndex((s) => s.name === oldName);
  if (idx === -1) return { error: "Sub-category not found" };

  const trimmed = data.name.trim();
  if (!trimmed) return { error: "Name is required" };

  let productCount = 0;
  if (trimmed !== oldName) {
    if (config.subs.some((s, i) => i !== idx && s.name.toLowerCase() === trimmed.toLowerCase())) {
      return { error: "A sub-category with that name already exists" };
    }
    const result = await prisma.ingredient.updateMany({
      where: { organizationId: orgId, ingredientCategory: oldName },
      data: { ingredientCategory: trimmed },
    });
    productCount = result.count;
  }

  config.subs[idx] = { ...data, name: trimmed };
  config.subs.sort((a, b) => a.name.localeCompare(b.name));
  await saveCategoriesConfig(config);
  return { success: true, count: productCount };
}

export async function deleteSubCategory(name: string) {
  const orgId = await getOrganizationId();
  await prisma.ingredient.updateMany({
    where: { organizationId: orgId, ingredientCategory: name },
    data: { ingredientCategory: null },
  });
  const config = await getCategoriesConfig();
  config.subs = config.subs.filter((s) => s.name !== name);
  await saveCategoriesConfig(config);
  return { success: true };
}

// Legacy compat — used by product inline edit
export async function addProductCategory(name: string) {
  // When adding from product inline edit, auto-assign to "Other" parent
  const config = await getCategoriesConfig();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required" };
  if (config.subs.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
    return { error: "That category already exists" };
  }
  config.subs.push({
    name: trimmed,
    parent: "Other",
    servingStyle: "NONE",
    pourSizes: [],
  });
  config.subs.sort((a, b) => a.name.localeCompare(b.name));
  await saveCategoriesConfig(config);
  return { success: true };
}

// Legacy compat
export async function deleteProductCategory(name: string) {
  return deleteSubCategory(name);
}

export async function renameProductCategory(oldName: string, newName: string) {
  const config = await getCategoriesConfig();
  const sub = config.subs.find((s) => s.name === oldName);
  if (!sub) return { error: "Category not found" };
  return updateSubCategory(oldName, { ...sub, name: newName.trim() });
}

export async function removeProductCategory(name: string) {
  return deleteSubCategory(name);
}

// ===== Bottle Sizes =====

export async function addBottleSize(sizeMl: number) {
  const orgId = await getOrganizationId();
  const settings = await getOrgSettings();
  if (sizeMl <= 0) return { error: "Size must be positive" };
  if (settings.bottleSizes.includes(sizeMl)) {
    return { error: "That size already exists" };
  }
  const updated = [...settings.bottleSizes, sizeMl].sort((a, b) => a - b);
  await prisma.organization.update({
    where: { id: orgId },
    data: { settingsBottleSizes: JSON.stringify(updated) },
  });
  revalidateAll();
  return { success: true };
}

export async function removeBottleSize(sizeMl: number) {
  const orgId = await getOrganizationId();
  const settings = await getOrgSettings();
  const updated = settings.bottleSizes.filter((s) => s !== sizeMl);
  await prisma.organization.update({
    where: { id: orgId },
    data: { settingsBottleSizes: JSON.stringify(updated) },
  });
  revalidateAll();
  return { success: true };
}

// ===== Case Sizes =====

export async function addCaseSize(size: number) {
  const orgId = await getOrganizationId();
  const settings = await getOrgSettings();
  if (size <= 0) return { error: "Size must be positive" };
  if (settings.caseSizes.includes(size)) {
    return { error: "That case size already exists" };
  }
  const updated = [...settings.caseSizes, size].sort((a, b) => a - b);
  await prisma.organization.update({
    where: { id: orgId },
    data: { settingsCaseSizes: JSON.stringify(updated) },
  });
  revalidateAll();
  return { success: true };
}

export async function removeCaseSize(size: number) {
  const orgId = await getOrganizationId();
  const settings = await getOrgSettings();
  const updated = settings.caseSizes.filter((s) => s !== size);
  await prisma.organization.update({
    where: { id: orgId },
    data: { settingsCaseSizes: JSON.stringify(updated) },
  });
  revalidateAll();
  return { success: true };
}

// ===== Shelf Labels =====

export async function addShelfLabel(label: string) {
  const orgId = await getOrganizationId();
  const trimmed = label.trim();
  if (!trimmed) return { error: "Label is required" };
  const settings = await getOrgSettings();
  if (settings.shelfLabels.includes(trimmed)) {
    return { error: "That shelf label already exists" };
  }
  const updated = [...settings.shelfLabels, trimmed].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  await prisma.organization.update({
    where: { id: orgId },
    data: { settingsShelfLabels: JSON.stringify(updated) },
  });
  revalidateAll();
  return { success: true };
}

export async function removeShelfLabel(label: string) {
  const orgId = await getOrganizationId();
  const settings = await getOrgSettings();
  const updated = settings.shelfLabels.filter((l) => l !== label);
  await prisma.organization.update({
    where: { id: orgId },
    data: { settingsShelfLabels: JSON.stringify(updated) },
  });
  revalidateAll();
  return { success: true };
}

// Seed existing distinct categories from ingredients into org settings
export async function seedCategoriesFromIngredients() {
  const orgId = await getOrganizationId();
  const ingredients = await prisma.ingredient.findMany({
    where: { organizationId: orgId, isActive: true, ingredientCategory: { not: null } },
    select: { ingredientCategory: true },
  });
  const distinct = [...new Set(ingredients.map((i) => i.ingredientCategory!).filter((c) => c && c.trim()))].sort();
  await prisma.organization.update({
    where: { id: orgId },
    data: { settingsCategories: JSON.stringify(distinct) },
  });
  revalidateAll();
  return { success: true, count: distinct.length };
}
