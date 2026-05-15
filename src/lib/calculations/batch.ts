import { toOz } from "./units";

export interface BatchIngredient {
  name: string;
  singleAmount: number;
  unit: string;
  isTopOff: boolean;
  batchAmount: number;
}

export interface BatchResult {
  ingredients: BatchIngredient[];
  totalOz: number;
  dilutionOz: number;
  finalVolumeOz: number;
  portions: number;
}

export function calculateBatch(
  ingredients: { name: string; amount: number; unit: string; isTopOff: boolean }[],
  portions: number,
  dilutionPct: number
): BatchResult {
  const batchIngredients: BatchIngredient[] = ingredients.map((ing) => ({
    name: ing.name,
    singleAmount: ing.amount,
    unit: ing.unit,
    isTopOff: ing.isTopOff,
    batchAmount: ing.isTopOff ? ing.amount : ing.amount * portions,
  }));

  const totalOz = batchIngredients
    .filter((ing) => !ing.isTopOff)
    .reduce((sum, ing) => sum + toOz(ing.batchAmount, ing.unit), 0);

  const dilutionOz = totalOz * (dilutionPct / 100);
  const finalVolumeOz = totalOz + dilutionOz;

  return {
    ingredients: batchIngredients,
    totalOz: Math.round(totalOz * 100) / 100,
    dilutionOz: Math.round(dilutionOz * 100) / 100,
    finalVolumeOz: Math.round(finalVolumeOz * 100) / 100,
    portions,
  };
}
