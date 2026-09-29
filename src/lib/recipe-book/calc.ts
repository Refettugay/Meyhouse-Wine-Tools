// Batch / liters / syrup calculators for the staff Recipe Book (spec section 4).
// Pure functions: always compute from unrounded numbers; round only in the
// fmt* helpers used for display. Tested by scripts/test-recipe-calc.ts.

import type { Recipe, RecipeIngredient, Unit } from "./types";

export const OZ_ML = 29.5735;
export const DASH_ML = 0.9; // house conversion from the sheet

// ---------------------------------------------------------------------------
// Portions (craft batches): single spec × portions.
// ---------------------------------------------------------------------------
export type PortionRow =
  | { kind: "oz"; ing: RecipeIngredient; oz: number; ml: number }
  | { kind: "dash"; ing: RecipeIngredient; dashes: number; ml: number };

export type PortionBatch = {
  rows: PortionRow[];
  service: RecipeIngredient[]; // "Add at service (not in batch)"
  dilutionOz: number; // 0 when dilution_pct is 0
  totalOz: number; // ingredients + dilution water
};

export function calcPortions(r: Pick<Recipe, "ingredients" | "dilutionPct">, portions: number): PortionBatch {
  const n = Number.isFinite(portions) && portions > 0 ? portions : 0;
  const rows: PortionRow[] = [];
  const service: RecipeIngredient[] = [];
  let sumOz = 0;
  for (const ing of r.ingredients) {
    if (ing.inBatch && ing.qty != null && ing.unit === "oz") {
      const oz = ing.qty * n;
      sumOz += oz;
      rows.push({ kind: "oz", ing, oz, ml: oz * OZ_ML });
    } else if (ing.inBatch && ing.qty != null && ing.unit === "dash") {
      const dashes = ing.qty * n;
      const ml = dashes * DASH_ML;
      sumOz += ml / OZ_ML;
      rows.push({ kind: "dash", ing, dashes, ml });
    } else {
      service.push(ing);
    }
  }
  const dilutionOz = sumOz * (r.dilutionPct || 0);
  return { rows, service, dilutionOz, totalOz: sumOz + dilutionOz };
}

// ---------------------------------------------------------------------------
// Liters (Limonata, Ayran): base qty × (liters ÷ base yield).
// ---------------------------------------------------------------------------
export type LiterRow =
  | { kind: "qty"; ing: RecipeIngredient; qty: number; decimals: number }
  | { kind: "topUp"; ing: RecipeIngredient; liters: number };

export function literDecimals(unit: Unit | null): number {
  if (unit === "ea") return 1; // sheet rounding: ea to 0.1, g to whole, kg/cup/L to 0.01
  if (unit === "g" || unit === "ml") return 0;
  return 2;
}

export function calcLiters(r: Pick<Recipe, "ingredients" | "baseYieldL" | "glassL">, liters: number) {
  const L = Number.isFinite(liters) && liters > 0 ? liters : 0;
  const f = r.baseYieldL ? L / r.baseYieldL : 0;
  const rows: LiterRow[] = r.ingredients.map((ing) =>
    ing.qty == null ? { kind: "topUp", ing, liters: L } : { kind: "qty", ing, qty: ing.qty * f, decimals: literDecimals(ing.unit) },
  );
  const glasses = r.glassL ? L / r.glassL : null;
  return { rows, glasses };
}

// ---------------------------------------------------------------------------
// Syrups: numeric qty × number of batches; text amounts shown unchanged "× N".
// ---------------------------------------------------------------------------
export type MultiplierRow =
  | { kind: "qty"; ing: RecipeIngredient; qty: number }
  | { kind: "text"; ing: RecipeIngredient; times: number };

export function calcMultiplier(r: Pick<Recipe, "ingredients">, batches: number): MultiplierRow[] {
  const m = Number.isFinite(batches) && batches > 0 ? batches : 0;
  return r.ingredients.map((ing) => (ing.qty == null ? { kind: "text", ing, times: m } : { kind: "qty", ing, qty: ing.qty * m }));
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
function trim(n: number, d: number): string {
  const m = Math.pow(10, d);
  const v = Math.round(n * m) / m;
  return (Object.is(v, -0) ? 0 : v).toString();
}

export const fmt = (v: number, decimals: number) => trim(v, decimals);

// Batch oz: nearest 0.25.
export const fmtOz = (oz: number) => trim(Math.round(oz * 4) / 4, 2);

export const fmtMl = (ml: number) => trim(ml, 0);

// Dash ml keeps one decimal (Last Sip × 5 = 13.5 ml, not 14).
export const fmtDashMl = (ml: number) => trim(ml, 1);

// 0.5 -> "½", 1.5 -> "1½", 0.25 -> "¼", 2 -> "2", 1.2 -> "1.2"
export function fmtFrac(v: number): string {
  const whole = Math.floor(v + 1e-9);
  const rest = Math.round((v - whole) * 100) / 100;
  const glyph = rest === 0.25 ? "¼" : rest === 0.5 ? "½" : rest === 0.75 ? "¾" : null;
  if (glyph) return whole === 0 ? glyph : `${whole}${glyph}`;
  return trim(v, 2);
}

// Parse what staff type into the amount box ("25,5" works too).
export function parseAmount(s: string): number | null {
  const v = Number(String(s).trim().replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? v : null;
}
