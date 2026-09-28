// Simplified "Type" chips for the staff count page, mapped from
// Ingredient.ingredientCategory (approved by Refet 2026-09-28).
// Shared by server and client — no secrets here.

export const TYPE_CHIPS = [
  "Red Wine",
  "White Wine",
  "Sparkling & Rosé",
  "Other Wine",
  "Whiskey",
  "Tequila & Mezcal",
  "Rakı",
  "Gin",
  "Vodka",
  "Rum",
  "Brandy & Other",
  "Liqueurs & Bitters",
  "Beer",
  "NA & Mixers",
  "Grocery",
  "Other",
] as const;

export type TypeChip = (typeof TYPE_CHIPS)[number];

const MAP: Record<string, TypeChip> = {
  "wine - red": "Red Wine",
  "wine - btg red": "Red Wine",
  "btg red": "Red Wine",
  "wine - half bottle - red": "Red Wine",
  "wine - white": "White Wine",
  "wine - btg white": "White Wine",
  "wine - half bottle - white": "White Wine",
  "wine - sparkling": "Sparkling & Rosé",
  "wine - btg sparkling": "Sparkling & Rosé",
  "wine - half bottle - sparkling": "Sparkling & Rosé",
  "wine - sparkling rose": "Sparkling & Rosé",
  "wine - rose": "Sparkling & Rosé",
  "wine - btg rose": "Sparkling & Rosé",
  "wine - orange": "Other Wine",
  "wine - dessert": "Other Wine",
  "wine - box": "Other Wine",
  "wine - keg": "Other Wine",
  whiskey: "Whiskey",
  "whiskey - bourbon": "Whiskey",
  rye: "Whiskey",
  scotch: "Whiskey",
  tequila: "Tequila & Mezcal",
  mezcal: "Tequila & Mezcal",
  raki: "Rakı",
  gin: "Gin",
  vodka: "Vodka",
  rum: "Rum",
  brandy: "Brandy & Other",
  cognac: "Brandy & Other",
  pisco: "Brandy & Other",
  cordial: "Liqueurs & Bitters",
  bitter: "Liqueurs & Bitters",
  "beer-draft": "Beer",
  "beer-bottle": "Beer",
  "beer-can": "Beer",
  "soft drink": "NA & Mixers",
  na: "NA & Mixers",
  "na beverage": "NA & Mixers",
  syrup: "NA & Mixers",
  grocery: "Grocery",
};

export function typeChipFor(category: string | null | undefined): TypeChip {
  if (!category) return "Other";
  return MAP[category.trim().toLowerCase()] ?? "Other";
}
