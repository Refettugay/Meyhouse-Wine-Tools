// Structured product category types for pour size calculations and pricing
// Two-level hierarchy: Parent Category → Sub-Categories

export interface PourSize {
  label: string;   // "Glass", "Shot", "Pint", "Full Bottle", etc.
  amount: number;  // 5, 1.5, 14. 0 = full container
  unit: string;    // "oz", "ml", "dash", "each", "lb", "g", "kg"
}

// Legacy compat: convert old {label, oz} to new {label, amount, unit}
export function normalizePourSize(ps: { label: string; oz?: number; amount?: number; unit?: string }): PourSize {
  if (ps.amount !== undefined && ps.unit) return ps as PourSize;
  return { label: ps.label, amount: ps.oz || 0, unit: ps.oz === 0 ? "each" : "oz" };
}

// Standard pour name options
export const POUR_NAMES = [
  "Glass", "Shot", "Pint", "Can", "Full Bottle", "Full Can",
  "BIB", "Carafe", "Flight", "Tasting", "Standard", "Rocks", "Dash",
];

// Measurement unit options
export const POUR_UNITS = [
  { value: "oz", label: "oz" },
  { value: "ml", label: "ml" },
  { value: "dash", label: "dash" },
  { value: "each", label: "each" },
  { value: "lb", label: "lb" },
  { value: "g", label: "gram" },
  { value: "kg", label: "kg" },
];

// Suggested sizes per pour name (shown as dropdown options)
export const SUGGESTED_SIZES: Record<string, { amount: number; unit: string; label: string }[]> = {
  "Full Bottle": [
    { amount: 12, unit: "oz", label: "12oz (355ml)" },
    { amount: 22, unit: "oz", label: "22oz" },
    { amount: 330, unit: "ml", label: "330ml" },
    { amount: 500, unit: "ml", label: "500ml" },
    { amount: 750, unit: "ml", label: "750ml" },
    { amount: 64, unit: "oz", label: "64oz" },
    { amount: 187.5, unit: "ml", label: "Split / Piccolo (187.5ml)" },
    { amount: 375, unit: "ml", label: "Half Bottle (375ml)" },
    { amount: 750, unit: "ml", label: "Standard Bottle (750ml)" },
    { amount: 1500, unit: "ml", label: "Magnum (1.5L)" },
    { amount: 3000, unit: "ml", label: "Jeroboam (3L)" },
    { amount: 4500, unit: "ml", label: "Rehoboam (4.5L)" },
    { amount: 6000, unit: "ml", label: "Methuselah (6L)" },
    { amount: 9000, unit: "ml", label: "Salmanazar (9L)" },
    { amount: 12000, unit: "ml", label: "Balthazar (12L)" },
    { amount: 15000, unit: "ml", label: "Nebuchadnezzar (15L)" },
  ],
  "BIB": [
    { amount: 1500, unit: "ml", label: "1.5L" },
    { amount: 3000, unit: "ml", label: "3L" },
    { amount: 5000, unit: "ml", label: "5L" },
    { amount: 10000, unit: "ml", label: "10L" },
    { amount: 15000, unit: "ml", label: "15L" },
    { amount: 20000, unit: "ml", label: "20L" },
    { amount: 128, unit: "oz", label: "1 gallon (128oz)" },
    { amount: 320, unit: "oz", label: "2.5 gallon (320oz)" },
    { amount: 640, unit: "oz", label: "5 gallon (640oz)" },
  ],
  "Can": [
    { amount: 200, unit: "ml", label: "200ml (Slim)" },
    { amount: 250, unit: "ml", label: "250ml" },
    { amount: 330, unit: "ml", label: "330ml" },
    { amount: 355, unit: "ml", label: "355ml (12oz)" },
    { amount: 375, unit: "ml", label: "375ml" },
    { amount: 473, unit: "ml", label: "473ml (16oz)" },
    { amount: 500, unit: "ml", label: "500ml" },
    { amount: 568, unit: "ml", label: "568ml (19.2oz)" },
    { amount: 8, unit: "oz", label: "8oz" },
    { amount: 12, unit: "oz", label: "12oz" },
    { amount: 16, unit: "oz", label: "16oz (Tallboy)" },
    { amount: 19.2, unit: "oz", label: "19.2oz (Stovepipe)" },
    { amount: 24, unit: "oz", label: "24oz" },
    { amount: 25, unit: "oz", label: "25oz" },
    { amount: 32, unit: "oz", label: "32oz (Crowler)" },
  ],
  "Full Can": [
    { amount: 355, unit: "ml", label: "355ml (12oz)" },
    { amount: 473, unit: "ml", label: "473ml (16oz)" },
    { amount: 250, unit: "ml", label: "250ml" },
    { amount: 330, unit: "ml", label: "330ml" },
    { amount: 500, unit: "ml", label: "500ml" },
    { amount: 12, unit: "oz", label: "12oz" },
    { amount: 16, unit: "oz", label: "16oz" },
  ],
  "Glass": [
    { amount: 1, unit: "oz", label: "1oz" },
    { amount: 2, unit: "oz", label: "2oz" },
    { amount: 3, unit: "oz", label: "3oz" },
    { amount: 4, unit: "oz", label: "4oz" },
    { amount: 4.5, unit: "oz", label: "4.5oz" },
    { amount: 5, unit: "oz", label: "5oz" },
    { amount: 5.5, unit: "oz", label: "5.5oz" },
    { amount: 6, unit: "oz", label: "6oz" },
    { amount: 6.5, unit: "oz", label: "6.5oz" },
    { amount: 7, unit: "oz", label: "7oz" },
    { amount: 7.5, unit: "oz", label: "7.5oz" },
    { amount: 8, unit: "oz", label: "8oz" },
    { amount: 10, unit: "oz", label: "10oz" },
    { amount: 12, unit: "oz", label: "12oz" },
    { amount: 13, unit: "oz", label: "13oz" },
    { amount: 14, unit: "oz", label: "14oz" },
    { amount: 16, unit: "oz", label: "16oz" },
    { amount: 17, unit: "oz", label: "17oz" },
    { amount: 20, unit: "oz", label: "20oz" },
    { amount: 22, unit: "oz", label: "22oz" },
    { amount: 24, unit: "oz", label: "24oz" },
    { amount: 32, unit: "oz", label: "32oz" },
    { amount: 64, unit: "oz", label: "64oz" },
  ],
  "Pint": [
    { amount: 14, unit: "oz", label: "14oz" },
    { amount: 16, unit: "oz", label: "16oz (US Pint)" },
    { amount: 20, unit: "oz", label: "20oz (Imperial)" },
    { amount: 25, unit: "oz", label: "25oz" },
  ],
  "Shot": [
    { amount: 0.5, unit: "oz", label: "0.5oz" },
    { amount: 0.75, unit: "oz", label: "0.75oz" },
    { amount: 1, unit: "oz", label: "1oz" },
    { amount: 1.25, unit: "oz", label: "1.25oz" },
    { amount: 1.5, unit: "oz", label: "1.5oz" },
    { amount: 1.75, unit: "oz", label: "1.75oz" },
    { amount: 2, unit: "oz", label: "2oz" },
    { amount: 2.5, unit: "oz", label: "2.5oz" },
    { amount: 3, unit: "oz", label: "3oz" },
    { amount: 30, unit: "ml", label: "30ml" },
    { amount: 45, unit: "ml", label: "45ml" },
    { amount: 60, unit: "ml", label: "60ml" },
  ],
  "Standard": [
    { amount: 0.5, unit: "oz", label: "0.5oz" },
    { amount: 0.75, unit: "oz", label: "0.75oz" },
    { amount: 1, unit: "oz", label: "1oz" },
    { amount: 1.25, unit: "oz", label: "1.25oz" },
    { amount: 1.5, unit: "oz", label: "1.5oz" },
    { amount: 1.75, unit: "oz", label: "1.75oz" },
    { amount: 2, unit: "oz", label: "2oz" },
    { amount: 2.5, unit: "oz", label: "2.5oz" },
    { amount: 3, unit: "oz", label: "3oz" },
  ],
  "Rocks": [
    { amount: 1.5, unit: "oz", label: "1.5oz" },
    { amount: 2, unit: "oz", label: "2oz" },
    { amount: 3, unit: "oz", label: "3oz" },
  ],
  "Carafe": [
    { amount: 5, unit: "oz", label: "5oz" },
    { amount: 8, unit: "oz", label: "8oz" },
    { amount: 10, unit: "oz", label: "10oz" },
    { amount: 12, unit: "oz", label: "12oz" },
    { amount: 13, unit: "oz", label: "13oz" },
    { amount: 14, unit: "oz", label: "14oz" },
    { amount: 16, unit: "oz", label: "16oz" },
    { amount: 17, unit: "oz", label: "17oz" },
    { amount: 20, unit: "oz", label: "20oz" },
    { amount: 22, unit: "oz", label: "22oz" },
    { amount: 24, unit: "oz", label: "24oz" },
    { amount: 32, unit: "oz", label: "32oz" },
    { amount: 64, unit: "oz", label: "64oz" },
  ],
  "Flight": [
    { amount: 2, unit: "oz", label: "2oz (per glass)" },
    { amount: 3, unit: "oz", label: "3oz (per glass)" },
    { amount: 5, unit: "oz", label: "5oz (total)" },
    { amount: 6, unit: "oz", label: "6oz (total)" },
  ],
  "Tasting": [
    { amount: 1, unit: "oz", label: "1oz" },
    { amount: 2, unit: "oz", label: "2oz" },
    { amount: 3, unit: "oz", label: "3oz" },
    { amount: 30, unit: "ml", label: "30ml" },
    { amount: 60, unit: "ml", label: "60ml" },
  ],
  "Dash": [
    { amount: 1, unit: "dash", label: "1 dash" },
    { amount: 2, unit: "dash", label: "2 dashes" },
    { amount: 3, unit: "dash", label: "3 dashes" },
    { amount: 4, unit: "dash", label: "4 dashes" },
    { amount: 5, unit: "dash", label: "5 dashes" },
  ],
};

export type ServingStyle = "STANDARD" | "BTG" | "BTB" | "NONE";

// Parent Category — e.g. Spirit, Wine, Beer, Cordial
export interface ParentCategory {
  name: string;                    // "Spirit", "Wine", "Beer"
  icon: string;                    // emoji
  defaultServingStyle: ServingStyle;
  defaultPourSizes: PourSize[];
}

// Sub-Category — e.g. Bourbon, BTG Red, Draft Beer
// This is what gets assigned to products via ingredientCategory
export interface SubCategory {
  name: string;                    // "Bourbon", "BTG Red", "Draft Beer"
  parent: string;                  // parent category name
  servingStyle: ServingStyle;      // can override parent
  pourSizes: PourSize[];           // can override parent
}

// The full structured categories stored in Organization.settingsCategories
export interface CategoriesConfig {
  parents: ParentCategory[];
  subs: SubCategory[];
}

// Default parent categories with sensible defaults
export const DEFAULT_PARENTS: ParentCategory[] = [
  { name: "Spirit", icon: "🥃", defaultServingStyle: "STANDARD", defaultPourSizes: [{ label: "Standard", amount: 1.5, unit: "oz" }] },
  { name: "Wine", icon: "🍷", defaultServingStyle: "BTG", defaultPourSizes: [{ label: "Glass", amount: 5, unit: "oz" }] },
  { name: "Beer", icon: "🍺", defaultServingStyle: "STANDARD", defaultPourSizes: [{ label: "Pint", amount: 12, unit: "oz" }] },
  { name: "Cordial", icon: "🍸", defaultServingStyle: "STANDARD", defaultPourSizes: [{ label: "Standard", amount: 1, unit: "oz" }] },
  { name: "Non-Alcoholic", icon: "🧃", defaultServingStyle: "STANDARD", defaultPourSizes: [{ label: "Glass", amount: 8, unit: "oz" }] },
  { name: "Bitters", icon: "💧", defaultServingStyle: "STANDARD", defaultPourSizes: [{ label: "Standard", amount: 1, unit: "dash" }] },
  { name: "Syrup", icon: "🍯", defaultServingStyle: "STANDARD", defaultPourSizes: [{ label: "Standard", amount: 0.5, unit: "oz" }] },
  { name: "Grocery", icon: "🛒", defaultServingStyle: "NONE", defaultPourSizes: [] },
  { name: "Produce", icon: "🥬", defaultServingStyle: "NONE", defaultPourSizes: [] },
  { name: "Meat & Seafood", icon: "🥩", defaultServingStyle: "NONE", defaultPourSizes: [] },
  { name: "Dairy", icon: "🧈", defaultServingStyle: "NONE", defaultPourSizes: [] },
  { name: "Dry Goods", icon: "🌾", defaultServingStyle: "NONE", defaultPourSizes: [] },
  { name: "Other", icon: "📦", defaultServingStyle: "NONE", defaultPourSizes: [] },
];

// Serving style options
export const SERVING_STYLES: { value: ServingStyle; label: string; description: string }[] = [
  { value: "STANDARD", label: "Standard Pour", description: "Single standard pour size (e.g., 1.5oz for spirits)" },
  { value: "BTG", label: "By the Glass", description: "Multiple pour options (e.g., 5oz, 8oz glass for wine)" },
  { value: "BTB", label: "By the Bottle", description: "Sold as full container — no pour cost calculation" },
  { value: "NONE", label: "Not Poured", description: "Not a poured item (grocery, produce, etc.)" },
];

// Check if settingsCategories is in new CategoriesConfig format
export function isNewCategoryFormat(json: string | null | undefined): boolean {
  if (!json) return false;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) && "parents" in parsed && "subs" in parsed;
  } catch {
    return false;
  }
}

// Parse CategoriesConfig from JSON
export function parseCategoriesConfig(json: string | null | undefined): CategoriesConfig | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "parents" in parsed && "subs" in parsed) {
      return parsed as CategoriesConfig;
    }
    return null;
  } catch {
    return null;
  }
}

// Helper: get serving style display label
export function getServingStyleLabel(style: ServingStyle): string {
  switch (style) {
    case "STANDARD": return "Standard Pour";
    case "BTG": return "By the Glass";
    case "BTB": return "By the Bottle";
    case "NONE": return "Not Poured";
  }
}

// Helper: get pour sizes summary text
export function getPourSizesSummary(pourSizes: PourSize[]): string {
  if (pourSizes.length === 0) return "—";
  return pourSizes.map((p) => {
    if (p.amount === 0) return p.label;
    return `${p.amount}${p.unit || "oz"}`;
  }).join(", ");
}

// Helper: convert pour size amount to fluid ounces for cost calculations
export function pourSizeToOz(ps: PourSize): number {
  if (ps.amount === 0) return 0; // full container
  switch (ps.unit) {
    case "oz": return ps.amount;
    case "ml": return ps.amount / 29.5735;
    case "dash": return ps.amount * 0.03; // ~1ml per dash
    default: return ps.amount; // fallback assume oz
  }
}

// Whether a wine category is "by the glass" (BTG) rather than by-the-bottle.
// True when the category name carries a BTG prefix — e.g. "Wine - BTG Red",
// "Wine - BTG White", or a bare "BTG Red".
//
// This is the SINGLE source of truth for BTG vs BTB placement in the Pricing
// Hub. The legacy Ingredient.isBTG / InventoryItem.isBTG flags are deliberately
// NOT consulted: there is no UI to manage them, so they go stale and would keep
// a wine pinned to the BTG tab even after its category is changed to a non-BTG
// (by-the-bottle) one.
export function isBTGCategory(category: string | null | undefined): boolean {
  const c = (category || "").toUpperCase();
  return c.includes("WINE - BTG") || c.startsWith("BTG ");
}

// Keyword-based inference of a product's type from its category name.
// Mirrors the migration logic in settings.ts so newly-created products are
// assigned the same productType the category migration would have given them.
export function inferProductTypeFromName(catName: string | null | undefined): string {
  const lower = (catName || "").toLowerCase();
  if (!lower) return "OTHER";
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

// Resolve the productType code for a chosen category. Prefers the org's
// structured category config (sub-category → parent → type), so custom-named
// categories still map correctly, and falls back to keyword inference.
export function resolveProductType(
  catName: string | null | undefined,
  config?: CategoriesConfig | null
): string {
  if (config && catName) {
    const sub = config.subs.find((s) => s.name === catName);
    if (sub) {
      const type = PARENT_TO_PRODUCT_TYPE[sub.parent];
      if (type) return type;
    }
    // Allow picking a parent category name directly as the category.
    const parentType = PARENT_TO_PRODUCT_TYPE[catName];
    if (parentType) return parentType;
  }
  return inferProductTypeFromName(catName);
}

// Map old productType codes to new parent category names
export const PRODUCT_TYPE_TO_PARENT: Record<string, string> = {
  SPIRIT: "Spirit",
  WINE: "Wine",
  BEER: "Beer",
  CORDIAL: "Cordial",
  NA_BEVERAGE: "Non-Alcoholic",
  BITTER: "Bitters",
  SYRUP: "Syrup",
  GROCERY: "Grocery",
  PRODUCE: "Produce",
  MEAT: "Meat & Seafood",
  DAIRY: "Dairy",
  DRY_GOODS: "Dry Goods",
  OTHER: "Other",
};

// Reverse map: parent category name → productType code (for resolveProductType)
export const PARENT_TO_PRODUCT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(PRODUCT_TYPE_TO_PARENT).map(([type, parent]) => [parent, type])
);
