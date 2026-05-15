// Convert an amount from one unit to another (same measureType).
// Uses baseFactor from each Unit record.
// fromBaseFactor = how many base units (ml/g/each) per 1 of the "from" unit
// toBaseFactor = how many base units per 1 of the "to" unit
export function convertUnits(
  amount: number,
  fromBaseFactor: number,
  toBaseFactor: number
): number {
  return (amount * fromBaseFactor) / toBaseFactor;
}

// Calculate cost per base unit (ml/g/each) from a ProductSKU
export function costPerBaseUnit(
  totalCostCents: number,
  unitsPerPack: number,
  innerSize: number,
  innerUnitBaseFactor: number
): number {
  const totalBaseUnits = unitsPerPack * innerSize * innerUnitBaseFactor;
  if (totalBaseUnits <= 0) return 0;
  return totalCostCents / totalBaseUnits;
}
