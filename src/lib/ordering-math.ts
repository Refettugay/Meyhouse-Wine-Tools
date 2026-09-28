// Order math shared by the staff count page (server + client). No secrets.
//
// Ingredient.orderUnit decides how a product is ordered:
//   "CASE" with a real case size → CASE;  "BOTTLE" → BOTTLE;
//   blank, or "CASE" with no case size → null ("Not set" — staff may pick).
// short = par − count; bottle → ceil(short); case → ceil(short / case size).

export type OrderUnit = "CASE" | "BOTTLE";

export function effectiveUnit(orderUnit: string | null | undefined, casePackSize: number | null | undefined): OrderUnit | null {
  if (orderUnit === "CASE") return (casePackSize ?? 0) > 1 ? "CASE" : null;
  if (orderUnit === "BOTTLE") return "BOTTLE";
  return null;
}

// `unit` is the unit actually used (admin's, or the staff pick when Not set).
// A staff "CS" pick on a product with no case size can't be sized, so it asks
// for 1 case and the manager adjusts it in review.
export function orderQty(par: number, count: number, unit: OrderUnit | null, casePackSize: number | null | undefined): number {
  const short = par - count;
  if (!(short > 0)) return 0;
  if (unit === "CASE") return (casePackSize ?? 0) > 1 ? Math.ceil(short / (casePackSize as number)) : 1;
  return Math.ceil(short);
}
