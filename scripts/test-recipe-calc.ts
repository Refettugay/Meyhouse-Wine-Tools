// Recipe Book calculator checks (spec section 7). Run: npm run test:recipes
// Uses prisma/seed-data/bar_recipes_seed.json mapped the same way as the DB
// seed (scripts/bar-recipes-seed-sql.mjs; the loaded DB matched it by md5).

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  calcPortions, calcLiters, calcMultiplier, fmtOz, fmtDashMl, fmt, fmtFrac, fmtMl, parseAmount,
} from "../src/lib/recipe-book/calc";
import type { Recipe, ScaleMode, Unit } from "../src/lib/recipe-book/types";

type SeedIng = { name: string; qty: number | null; unit: string | null; in_batch?: boolean; batch_name?: string; text?: string };
type SeedRecipe = {
  id: string; name: string; category: Recipe["category"]; stores: Recipe["stores"]; batchable?: boolean; scale_mode?: ScaleMode;
  default_portions?: number | null; dilution_pct?: number; pour_from_batch_oz?: number; base_yield_l?: number; glass_l?: number;
  ingredients: SeedIng[];
};

const seed = JSON.parse(readFileSync(new URL("../prisma/seed-data/bar_recipes_seed.json", import.meta.url), "utf8")) as SeedRecipe[];

function mode(r: SeedRecipe): ScaleMode {
  if (r.scale_mode) return r.scale_mode;
  if (r.category === "craft" || r.category === "na") return r.batchable ? "portions" : "none";
  return "none";
}

function recipe(id: string): Recipe {
  const r = seed.find((x) => x.id === id);
  assert.ok(r, `missing recipe ${id}`);
  return {
    id: r.id, name: r.name, category: r.category, stores: r.stores, mode: mode(r),
    defaultPortions: r.default_portions ?? null, dilutionPct: r.dilution_pct ?? 0, pourOz: r.pour_from_batch_oz ?? null,
    glass: null, ice: null, garnish: null, howTo: null, storage: null, notes: null, method: null,
    baseYieldL: r.base_yield_l ?? null, glassL: r.glass_l ?? null, needsReview: false, last: null,
    ingredients: r.ingredients.map((g) => ({
      name: { en: g.name }, batchName: g.batch_name ?? null, qty: g.qty ?? null,
      unit: (g.unit === "gr" ? "g" : g.unit) as Unit | null, text: g.text ? { en: g.text } : null, inBatch: g.in_batch ?? true, note: null,
    })),
  };
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("Recipe Book calculator — spec section 7");

check("Pins & Needles at 16 portions", () => {
  const c = calcPortions(recipe("pins-needles"), 16);
  const got = Object.fromEntries(c.rows.map((x) => [x.ing.name.en, x.kind === "oz" ? fmtOz(x.oz) : "dash"]));
  assert.deepEqual(got, {
    "Haku Vodka": "32", "St George Spiced Pear Liq": "12", "Lime Juice": "8", "Sage Tea Syrup": "8", "Simple Syrup": "4",
  });
  assert.equal(fmtOz(c.totalOz), "64");
  assert.equal(c.dilutionOz, 0);
});

check("Last Sip at 5 -> Scrappy's Chocolate Bitters 15 dashes = 13.5 ml", () => {
  const c = calcPortions(recipe("last-sip"), 5);
  const b = c.rows.find((x) => x.ing.name.en === "Scrappy's Chocolate Bitters");
  assert.ok(b && b.kind === "dash");
  assert.equal(fmt(b.dashes, 1), "15");
  assert.equal(fmtDashMl(b.ml), "13.5");
});

check("Turkish Delight -> no calculator", () => {
  assert.equal(recipe("turkish-delight").mode, "none");
});

check("Cappadocia Fire batch shows the batch name; serrano under Add at service", () => {
  const c = calcPortions(recipe("cappadocia-fire"), 16);
  assert.ok(c.rows.some((x) => x.ing.batchName === "Serrano Infused Madre Mezcal"));
  assert.deepEqual(c.service.map((g) => g.name.en), ["Slice of Fresh Serrano Pepper"]);
  const mezcal = c.rows.find((x) => x.ing.batchName);
  assert.ok(mezcal && mezcal.kind === "oz");
  assert.equal(fmtOz(mezcal.oz), "24");
});

check("Limonata at 13 L -> Lemons 30, Oranges 4, Sugar 1600 g, water to 13 L", () => {
  const c = calcLiters(recipe("limonata"), 13);
  const got = Object.fromEntries(c.rows.map((x) => [x.ing.name.en, x.kind === "qty" ? fmt(x.qty, x.decimals) : `to ${fmt(x.liters, 2)}`]));
  assert.deepEqual(got, { Lemons: "30", Oranges: "4", Sugar: "1600", Water: "to 13" });
  assert.equal(fmt(c.glasses ?? 0, 0), "43");
});

check("Cinnamon Syrup x 2 -> Sugar 5 kg, Water 6 L, Lemon 1, Cinnamon sticks 12", () => {
  const rows = calcMultiplier(recipe("cinnamon-syrup"), 2);
  const got = Object.fromEntries(rows.map((x) => [x.ing.name.en, x.kind === "qty" ? fmtFrac(x.qty) : "text"]));
  assert.deepEqual(got, { Sugar: "5", Water: "6", Lemon: "1", "Cinnamon Sticks": "12" });
});

check("Syrup x 1 shows half a lemon as ½; text amounts stay text", () => {
  const rows = calcMultiplier(recipe("sage-syrup"), 1.5);
  const lemon = rows.find((x) => x.ing.name.en === "Lemon");
  assert.ok(lemon && lemon.kind === "qty");
  assert.equal(fmtFrac(lemon.qty), "¾");
  assert.equal(fmtFrac(0.5), "½");
  assert.equal(fmtFrac(1.5), "1½");
  assert.ok(rows.some((x) => x.kind === "text" && x.times === 1.5));
});

check("Decimal portions (25.5) and unrounded math", () => {
  const c = calcPortions(recipe("pins-needles"), 25.5);
  // 25.5 × 0.75 = 19.125 oz -> shown to nearest 0.25 = 19.25 (19.125 rounds half up)
  const pear = c.rows.find((x) => x.ing.name.en === "St George Spiced Pear Liq");
  assert.ok(pear && pear.kind === "oz");
  assert.equal(pear.oz, 19.125);
  assert.equal(fmtOz(pear.oz), "19.25");
  assert.equal(fmtMl(pear.ml), "566");
  assert.equal(parseAmount("25,5"), 25.5);
});

check("Dilution water only when dilution_pct > 0", () => {
  const r = { ...recipe("pins-needles"), dilutionPct: 0.2 };
  const c = calcPortions(r, 16);
  assert.equal(fmtOz(c.dilutionOz), "12.75"); // 64 oz × 0.2 = 12.8 -> nearest 0.25
  assert.equal(fmtOz(c.totalOz), "76.75");
});

console.log(`\n${passed} checks passed.`);
