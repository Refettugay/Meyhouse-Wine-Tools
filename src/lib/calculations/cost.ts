import { OZ_TO_ML, DASH_TO_OZ, BARSPOON_TO_OZ } from "./units";

export interface IngredientCostInput {
  type: string;
  amount: number;
  unit: string;
  bottleCostCents?: number | null;
  bottleSizeMl?: number | null;
  purchaseCostCents?: number | null;
  purchaseQty?: number | null;
}

export function calculateIngredientCost(input: IngredientCostInput): number {
  if (input.type === "LIQUID" || input.type === "GARNISH") {
    if (!input.bottleCostCents || !input.bottleSizeMl) return 0;
    const costPerMl = input.bottleCostCents / input.bottleSizeMl;
    let amountMl: number;

    switch (input.unit) {
      case "OZ":
        amountMl = input.amount * OZ_TO_ML;
        break;
      case "ML":
        amountMl = input.amount;
        break;
      case "DASH":
        amountMl = input.amount * DASH_TO_OZ * OZ_TO_ML;
        break;
      case "BARSPOON":
        amountMl = input.amount * BARSPOON_TO_OZ * OZ_TO_ML;
        break;
      default:
        amountMl = input.amount * OZ_TO_ML;
    }

    return Math.round(costPerMl * amountMl);
  }

  if (input.type === "SOLID") {
    if (!input.purchaseCostCents || !input.purchaseQty) return 0;
    const costPerUnit = input.purchaseCostCents / input.purchaseQty;
    return Math.round(costPerUnit * input.amount);
  }

  return 0;
}

export function calculateRecipeCost(
  ingredients: IngredientCostInput[]
): number {
  return ingredients.reduce(
    (total, ing) => total + calculateIngredientCost(ing),
    0
  );
}

export function suggestMenuPrice(
  costCents: number,
  costTargetPct: number
): number {
  if (costTargetPct <= 0) return 0;
  const rawPrice = costCents / (costTargetPct / 100);
  return Math.round(rawPrice / 50) * 50; // Round to nearest $0.50
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
