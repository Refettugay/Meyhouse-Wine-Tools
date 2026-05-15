// Product type templates define smart defaults when adding a new product.
// Picking a type pre-fills units, container types, common sizes, and categories.

export interface ProductTemplate {
  type: string;
  label: string;
  description: string;
  icon: string; // emoji for visual card
  baseUnit: string; // code from Unit table (ml, g, each)
  countUnit: string; // what staff counts (each, bunch, lb, etc.)
  defaultContainerType: string; // bottle, can, bag, box, bunch, each
  suggestedSizes: number[]; // common inner sizes for the dropdown
  sizeUnit: string; // unit code for the sizes (ml, g, each)
  suggestedCaseSizes: number[];
  defaultCategory: string;
  suggestedCategories: string[];
  measureType: string; // VOLUME, WEIGHT, COUNT
}

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  // ===== BEVERAGES =====
  {
    type: "SPIRIT",
    label: "Spirit / Liquor",
    description: "Vodka, gin, whiskey, tequila, rum, etc.",
    icon: "🥃",
    baseUnit: "ml",
    countUnit: "each",
    defaultContainerType: "bottle",
    suggestedSizes: [375, 500, 700, 750, 1000, 1750],
    sizeUnit: "ml",
    suggestedCaseSizes: [1, 6, 12],
    defaultCategory: "Spirit",
    suggestedCategories: [
      "Bourbon",
      "Gin",
      "Mezcal",
      "Pisco",
      "Raki",
      "Rum",
      "Rye",
      "Scotch",
      "Tequila",
      "Vodka",
      "Whiskey",
      "Cognac",
    ],
    measureType: "VOLUME",
  },
  {
    type: "WINE",
    label: "Wine",
    description: "Red, white, rosé, sparkling, dessert",
    icon: "🍷",
    baseUnit: "ml",
    countUnit: "each",
    defaultContainerType: "bottle",
    suggestedSizes: [375, 500, 750, 1500],
    sizeUnit: "ml",
    suggestedCaseSizes: [1, 6, 12],
    defaultCategory: "Wine",
    suggestedCategories: [
      "Wine - RED",
      "Wine - WHITE",
      "Wine - ROSE",
      "Sparkling",
      "Dessert",
      "BTG Red",
      "BTG White",
      "BTG Sparkling",
      "Half Red",
      "Half White",
    ],
    measureType: "VOLUME",
  },
  {
    type: "BEER",
    label: "Beer",
    description: "Bottled, canned, draft, NA beer",
    icon: "🍺",
    baseUnit: "ml",
    countUnit: "each",
    defaultContainerType: "can",
    suggestedSizes: [200, 300, 330, 355, 473, 500, 650, 750],
    sizeUnit: "ml",
    suggestedCaseSizes: [1, 4, 6, 12, 24],
    defaultCategory: "Beer",
    suggestedCategories: ["Beer", "IPA", "Ale", "Lager", "NA Beer"],
    measureType: "VOLUME",
  },
  {
    type: "NA_BEVERAGE",
    label: "Non-Alcoholic",
    description: "Sodas, tonics, juices, NA spirits",
    icon: "🧃",
    baseUnit: "ml",
    countUnit: "each",
    defaultContainerType: "bottle",
    suggestedSizes: [200, 250, 330, 355, 500, 700, 750, 1000],
    sizeUnit: "ml",
    suggestedCaseSizes: [1, 6, 12, 24],
    defaultCategory: "NA Beverage",
    suggestedCategories: ["NA Beverage", "Juice", "Soda", "Tonic", "Water"],
    measureType: "VOLUME",
  },
  {
    type: "CORDIAL",
    label: "Cordial / Liqueur",
    description: "Amaretto, Chambord, Cointreau, Vermouth, etc.",
    icon: "🍸",
    baseUnit: "ml",
    countUnit: "each",
    defaultContainerType: "bottle",
    suggestedSizes: [375, 500, 700, 750, 1000],
    sizeUnit: "ml",
    suggestedCaseSizes: [1, 6, 12],
    defaultCategory: "Cordial",
    suggestedCategories: ["Cordial", "Liqueur", "Amaro", "Vermouth", "Aperitif"],
    measureType: "VOLUME",
  },
  {
    type: "BITTER",
    label: "Bitters",
    description: "Angostura, Scrappy's, etc.",
    icon: "💧",
    baseUnit: "ml",
    countUnit: "each",
    defaultContainerType: "bottle",
    suggestedSizes: [100, 148, 200, 500],
    sizeUnit: "ml",
    suggestedCaseSizes: [1, 12],
    defaultCategory: "Bitter",
    suggestedCategories: ["Bitter"],
    measureType: "VOLUME",
  },
  {
    type: "SYRUP",
    label: "Syrup / Mixer",
    description: "Simple syrup, ginger syrup, grenadine, etc.",
    icon: "🍯",
    baseUnit: "ml",
    countUnit: "each",
    defaultContainerType: "bottle",
    suggestedSizes: [250, 375, 500, 750, 1000],
    sizeUnit: "ml",
    suggestedCaseSizes: [1, 6, 12],
    defaultCategory: "Syrup",
    suggestedCategories: ["Syrup", "Mixer"],
    measureType: "VOLUME",
  },

  // ===== GROCERY / FOOD =====
  {
    type: "GROCERY",
    label: "Grocery",
    description: "Olives, cherries, ice, napkins, straws, bar supplies",
    icon: "🛒",
    baseUnit: "each",
    countUnit: "each",
    defaultContainerType: "each",
    suggestedSizes: [1],
    sizeUnit: "each",
    suggestedCaseSizes: [1, 6, 12, 24],
    defaultCategory: "Grocery",
    suggestedCategories: [
      "Grocery",
      "Paper Goods",
      "Cleaning",
      "Ice",
      "Bar Supply",
    ],
    measureType: "COUNT",
  },
  {
    type: "PRODUCE",
    label: "Produce / Fresh Herbs",
    description: "Fruits, vegetables, herbs, garnishes, fresh items",
    icon: "🥬",
    baseUnit: "each",
    countUnit: "each",
    defaultContainerType: "each",
    suggestedSizes: [1],
    sizeUnit: "each",
    suggestedCaseSizes: [1, 12, 24],
    defaultCategory: "Produce",
    suggestedCategories: [
      "Produce",
      "Fruit",
      "Vegetable",
      "Fresh Herb",
      "Garnish",
      "Citrus",
    ],
    measureType: "COUNT",
  },
  {
    type: "MEAT",
    label: "Meat / Seafood",
    description: "Proteins bought by weight",
    icon: "🥩",
    baseUnit: "g",
    countUnit: "lb",
    defaultContainerType: "bag",
    suggestedSizes: [1, 5, 10, 25, 50],
    sizeUnit: "lb",
    suggestedCaseSizes: [1],
    defaultCategory: "Meat",
    suggestedCategories: ["Meat", "Seafood", "Poultry"],
    measureType: "WEIGHT",
  },
  {
    type: "DAIRY",
    label: "Dairy",
    description: "Milk, cream, butter, cheese",
    icon: "🧈",
    baseUnit: "ml",
    countUnit: "each",
    defaultContainerType: "each",
    suggestedSizes: [236, 473, 946, 3785],
    sizeUnit: "ml",
    suggestedCaseSizes: [1, 6, 12],
    defaultCategory: "Dairy",
    suggestedCategories: ["Dairy", "Cream", "Cheese", "Butter"],
    measureType: "VOLUME",
  },
  {
    type: "DRY_GOODS",
    label: "Dry Goods",
    description: "Flour, sugar, salt, rice, spices — bought by weight",
    icon: "🌾",
    baseUnit: "g",
    countUnit: "lb",
    defaultContainerType: "bag",
    suggestedSizes: [1, 5, 10, 25, 50],
    sizeUnit: "lb",
    suggestedCaseSizes: [1],
    defaultCategory: "Dry Goods",
    suggestedCategories: ["Dry Goods", "Baking", "Spice"],
    measureType: "WEIGHT",
  },
  // NOTE: House-Made Bar Ingredients lives in Recipes, not Products.
  // It will be a recipe category called "House-Made Bar Ingredients"
  // where sub-recipes (Sage Tea Syrup, Ginger Syrup, etc.) are created.
  // The sub-recipe auto-creates an ingredient usable in cocktail recipes.
  {
    type: "OTHER",
    label: "Other",
    description: "Anything that doesn't fit above",
    icon: "📦",
    baseUnit: "each",
    countUnit: "each",
    defaultContainerType: "each",
    suggestedSizes: [1],
    sizeUnit: "each",
    suggestedCaseSizes: [1],
    defaultCategory: "Other",
    suggestedCategories: ["Other"],
    measureType: "COUNT",
  },
];

export function getTemplate(type: string): ProductTemplate | undefined {
  // GARNISH was merged into PRODUCE
  const lookupType = type === "GARNISH" ? "PRODUCE" : type;
  return PRODUCT_TEMPLATES.find((t) => t.type === lookupType);
}

// Container / Package type options for the "How do you buy it?" row
export const CONTAINER_TYPES = [
  // Liquid containers
  { value: "bottle", label: "Bottle" },
  { value: "can", label: "Can" },
  { value: "keg_full", label: "Full Keg (15.5 gal)" },
  { value: "keg_quarter", label: "Quarter Keg (7.75 gal)" },
  { value: "keg_sixth", label: "Sixth Keg (5.16 gal)" },
  { value: "keg_mini", label: "Mini Keg (1.32 gal)" },
  { value: "bib", label: "BIB (Bag-in-Box)" },
  { value: "jug", label: "Jug" },
  { value: "carton", label: "Carton" },
  // Cases / Multi-packs
  { value: "case", label: "Case" },
  { value: "pack", label: "Pack" },
  // Dry / Solid containers
  { value: "bag", label: "Bag" },
  { value: "box", label: "Box" },
  { value: "pouch", label: "Pouch" },
  { value: "jar", label: "Jar" },
  { value: "tub", label: "Tub / Container" },
  { value: "tin", label: "Tin / Can" },
  { value: "roll", label: "Roll" },
  // Produce / Fresh
  { value: "bunch", label: "Bunch" },
  { value: "bundle", label: "Bundle" },
  { value: "crate", label: "Crate" },
  { value: "flat", label: "Flat / Tray" },
  { value: "head", label: "Head" },
  // Weight-based (buy by the pound)
  { value: "by_weight", label: "By Weight (lb/kg/oz)" },
  // Single item
  { value: "each", label: "Each / Single" },
];
