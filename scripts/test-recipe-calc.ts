// Recipe Book calculator checks (spec section 7). Run: npm run test:recipes
// Uses prisma/seed-data/bar_recipes_seed.json mapped the same way as the DB
// seed (scripts/bar-recipes-seed-sql.mjs; the loaded DB matched it by md5).

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  calcPortions, calcLiters, calcMultiplier, fmtOz, fmtDashMl, fmt, fmtFrac, fmtMl, parseAmount,
} from "../src/lib/recipe-book/calc";
import type { Recipe, ScaleMode, Snapshot, Tri, Unit } from "../src/lib/recipe-book/types";
import { buildInput, dataOf, draftFrom, warnings } from "../src/components/recipe-book/draft";
import { summarize, validate } from "../src/lib/recipe-book/diff";
import { makeT, pick } from "../src/components/recipe-book/i18n";

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

// ---------------------------------------------------------------------------
// Editing (Phase 3): full seed recipes with translations, as the page gets them
// ---------------------------------------------------------------------------
type AnyObj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function triOf(en: string | undefined, i?: AnyObj): Tri | null {
  if (!en) return null;
  return { en, ...(i?.tr ? { tr: i.tr } : {}), ...(i?.es ? { es: i.es } : {}) };
}
const joinLines = (v: unknown) => (Array.isArray(v) ? v.join("\n") : (v as string | undefined));
function full(r: AnyObj): Recipe {
  const b = r.build || {}, i = r.i18n || {};
  return {
    id: r.id, name: r.name, category: r.category, stores: r.stores, mode: mode(r as SeedRecipe), batchable: !!r.batchable,
    defaultPortions: r.default_portions ?? null, dilutionPct: r.dilution_pct ?? 0, pourOz: r.pour_from_batch_oz ?? null,
    glass: triOf(b.Glass, i.glass), ice: triOf(b.Ice, i.ice), garnish: triOf(b.Garnish, i.garnish), howTo: triOf(b["How to"], i.how_to),
    storage: r.storage ? (/freezer/i.test(r.storage) ? "freezer" : "fridge") : null,
    notes: triOf(joinLines(r.notes), i.notes ? { tr: joinLines(i.notes.tr), es: joinLines(i.notes.es) } : undefined),
    method: r.method ?? null, baseYieldL: r.base_yield_l ?? null, glassL: r.glass_l ?? null,
    needsReview: !!r.needs_review, needsSpec: !!r.needs_spec, active: true, photoPath: null,
    photoUrl: null, thumbUrl: null, updatedAt: "2026-09-29T00:00:00.000Z", last: null,
    ingredients: r.ingredients.map((g: AnyObj) => ({
      name: triOf(g.name, g.name_i18n) ?? { en: "" }, batchName: g.batch_name ?? null, qty: g.qty ?? null,
      unit: g.unit === "gr" ? "g" : g.unit ?? null, text: triOf(g.text, g.text_i18n), inBatch: g.in_batch ?? true, note: triOf(g.note, g.note_i18n),
    })),
  };
}
const snapOf = (r: Recipe): Snapshot => {
  const { photoUrl, thumbUrl, updatedAt, last, ...snap } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
  return snap;
};
// What the server stores after validating what the page sent.
function serverAfter(before: Snapshot, input: ReturnType<typeof buildInput>): Snapshot {
  const v = validate(input.data);
  if (!v.ok) throw new Error(v.message);
  return { id: before.id, ...v.data, active: before.active, photoPath: before.photoPath };
}

check("Opening and saving any of the 94 recipes untouched changes nothing (EN, TR, ES)", () => {
  const bad: string[] = [];
  for (const raw of seed as AnyObj[]) {
    const r = full(raw);
    for (const lang of ["en", "tr", "es"] as const) {
      const input = buildInput(draftFrom(r), lang);
      const s = summarize(snapOf(r), serverAfter(snapOf(r), input));
      if (s) bad.push(`${r.id} (${lang}): ${s}`);
      if (JSON.stringify(dataOf(r)) !== JSON.stringify(input.data)) bad.push(`${r.id} (${lang}): page thinks it changed`);
    }
  }
  assert.deepEqual(bad, []);
});

check('Bodrum Fashion sage 0.5 -> 0.75 is logged as "Sage Tea Syrup 0.5 oz → 0.75 oz"', () => {
  const r = full(seed.find((x) => x.id === "bodrum-fashion") as AnyObj);
  const d = draftFrom(r);
  d.ingredients = d.ingredients.map((g) => (g.name.en === "Sage Tea Syrup" ? { ...g, amt: "0.75" } : g));
  const input = buildInput(d, "en");
  assert.equal(summarize(snapOf(r), serverAfter(snapOf(r), input)), "Sage Tea Syrup 0.5 oz → 0.75 oz");
  assert.deepEqual(warnings(r, input.data, makeT("en"), "en", pick), []); // 1.5x is not a typo
});

check("Garnish edited in Spanish is logged with (ES)", () => {
  const r = full(seed.find((x) => x.id === "cappadocia-fire") as AnyObj);
  const d = draftFrom(r);
  d.garnish = { ...d.garnish, es: "Chile asado" };
  assert.equal(summarize(snapOf(r), serverAfter(snapOf(r), buildInput(d, "es"))), "Garnish (ES): Chile serrano asado → Chile asado");
});

check("Typo guardrails: 0.5 -> 5 oz warns and suggests 0.5; zero warns; nothing in batch warns", () => {
  const r = full(seed.find((x) => x.id === "bodrum-fashion") as AnyObj);
  const t = makeT("en");
  const d = draftFrom(r);
  d.ingredients = d.ingredients.map((g) => (g.name.en === "Sage Tea Syrup" ? { ...g, amt: "5" } : g));
  const w1 = warnings(r, buildInput(d, "en").data, t, "en", pick);
  assert.equal(w1.length, 1);
  assert.match(w1[0], /went from 0\.5 to 5 oz.*Did you mean 0\.5 oz\?/);
  d.ingredients = d.ingredients.map((g) => ({ ...g, amt: g.amt === "5" ? "0" : g.amt, inBatch: false }));
  const w2 = warnings(r, buildInput(d, "en").data, t, "en", pick);
  assert.ok(w2.some((x) => x.includes("must be above zero")));
  assert.ok(w2.some((x) => x.includes("Goes in the batch")));
});

check("Photo, archive and new-recipe summaries", () => {
  const r = snapOf(full(seed[0] as AnyObj));
  assert.equal(summarize(r, { ...r, photoPath: "x/1.jpg" }), "Photo added");
  assert.equal(summarize({ ...r, photoPath: "x/1.jpg" }, { ...r, photoPath: "x/2.jpg" }), "Photo changed");
  assert.equal(summarize(r, { ...r, active: false }), "Archived");
  assert.equal(summarize(null, r), "Created Pins & Needles");
});

console.log(`\n${passed} checks passed.`);
