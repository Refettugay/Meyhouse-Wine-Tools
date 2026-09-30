// Editor draft <-> saved data, and the save guardrails. Pure (no React), so
// scripts/test-recipe-calc.ts can check that opening a recipe and saving it
// untouched changes nothing (round trip is lossless for every recipe).

import { fmt, parseAmount } from "@/lib/recipe-book/calc";
import type { Category, Lang, PhotoChange, Recipe, RecipeData, RecipeIngredient, SaveInput, ScaleMode, Store, Tri, Unit } from "@/lib/recipe-book/types";

type TFn = (key: string, ...args: string[]) => string;
const LANGS: Lang[] = ["en", "tr", "es"];

export type DraftIng = {
  key: number;
  name: Tri;
  amt: string; // numeric amount as typed
  text: Tri | null; // non-numeric amount ("top off") per language
  unit: Unit | null;
  inBatch: boolean;
  batchName: string;
  note: Tri | null;
};

export type Draft = {
  id: string | null;
  baseUpdatedAt: string | null;
  name: string;
  category: Category;
  mode: ScaleMode;
  stores: Store[];
  glass: Tri; ice: Tri; garnish: Tri; howTo: Tri; notes: Tri;
  method: Partial<Record<Lang, string>>; // one step per line
  storage: "freezer" | "fridge" | null;
  defaultPortions: string; pourOz: string; dilution: string; baseYieldL: string; glassL: string;
  needsReview: boolean; needsSpec: boolean;
  ingredients: DraftIng[];
  photo: PhotoChange;
  photoPreview: string | null;
};

let keySeq = 1;
export const nextKey = () => keySeq++;
const numStr = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export function draftFrom(r: Recipe): Draft {
  return {
    id: r.id,
    baseUpdatedAt: r.updatedAt,
    name: r.name,
    category: r.category,
    mode: r.mode,
    stores: [...r.stores],
    glass: { ...(r.glass ?? {}) }, ice: { ...(r.ice ?? {}) }, garnish: { ...(r.garnish ?? {}) }, howTo: { ...(r.howTo ?? {}) }, notes: { ...(r.notes ?? {}) },
    method: Object.fromEntries(Object.entries(r.method ?? {}).map(([l, steps]) => [l, (steps ?? []).join("\n")])),
    storage: r.storage,
    defaultPortions: numStr(r.defaultPortions),
    pourOz: numStr(r.pourOz),
    dilution: r.dilutionPct ? String(Math.round(r.dilutionPct * 100000) / 1000) : "",
    baseYieldL: numStr(r.baseYieldL),
    glassL: numStr(r.glassL),
    needsReview: r.needsReview,
    needsSpec: r.needsSpec,
    ingredients: r.ingredients.map((g) => ({
      key: nextKey(), name: { ...g.name }, amt: numStr(g.qty), text: g.text ? { ...g.text } : null, unit: g.unit,
      inBatch: g.inBatch, batchName: g.batchName ?? "", note: g.note,
    })),
    photo: { kind: "keep" },
    photoPreview: r.photoUrl,
  };
}

export function newDraft(store: Store | "all"): Draft {
  return {
    id: null, baseUpdatedAt: null, name: "", category: "craft", mode: "portions",
    stores: store === "all" ? ["meyhouse", "meze-kebab"] : [store],
    glass: {}, ice: {}, garnish: {}, howTo: {}, notes: {}, method: {}, storage: null,
    defaultPortions: "16", pourOz: "", dilution: "", baseYieldL: "", glassL: "",
    needsReview: false, needsSpec: false,
    ingredients: [{ key: nextKey(), name: {}, amt: "", text: null, unit: "oz", inBatch: true, batchName: "", note: null }],
    photo: { kind: "keep" }, photoPreview: null,
  };
}

const triOrNull = (v: Tri | null | undefined): Tri | null => {
  const out: Tri = {};
  for (const l of LANGS) { const s = (v?.[l] ?? "").trim(); if (s) out[l] = s; }
  if (!out.en && (out.tr || out.es)) out.en = out.tr || out.es; // English is the fallback — never leave it empty
  return Object.keys(out).length ? out : null;
};
const numOrNull = (s: string) => (s.trim() === "" ? null : parseAmount(s));

// Everything is kept as-is unless it was edited (fields a calculator type
// doesn't use are hidden in the form, not cleared).
export function buildInput(d: Draft, lang: Lang): SaveInput {
  const method: Partial<Record<Lang, string[]>> = {};
  for (const l of LANGS) {
    const steps = (d.method[l] ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    if (steps.length) method[l] = steps;
  }
  const dil = numOrNull(d.dilution);
  const data: RecipeData = {
    name: d.name.trim(),
    category: d.category,
    stores: d.stores,
    mode: d.mode,
    batchable: d.mode === "portions",
    defaultPortions: numOrNull(d.defaultPortions),
    dilutionPct: dil === null ? 0 : Math.round(dil * 1000) / 100000,
    pourOz: numOrNull(d.pourOz),
    glass: triOrNull(d.glass), ice: triOrNull(d.ice), garnish: triOrNull(d.garnish), howTo: triOrNull(d.howTo), notes: triOrNull(d.notes),
    storage: d.storage,
    method: Object.keys(method).length ? method : null,
    baseYieldL: numOrNull(d.baseYieldL),
    glassL: numOrNull(d.glassL),
    needsReview: d.needsReview,
    needsSpec: d.needsSpec,
    active: true,
    photoPath: null, // server-controlled
    ingredients: d.ingredients
      .map((g): RecipeIngredient | null => {
        const name = triOrNull(g.name);
        if (!name) return null;
        const qty = numOrNull(g.amt);
        return {
          name,
          batchName: g.batchName.trim() || null,
          qty,
          unit: g.unit,
          text: qty === null ? triOrNull(g.text) : null,
          inBatch: g.inBatch,
          note: triOrNull(g.note),
        };
      })
      .filter((g): g is RecipeIngredient => g !== null),
  };
  return { id: d.id, baseUpdatedAt: d.baseUpdatedAt, lang, data, photo: d.photo };
}

// The comparable part of a saved recipe (same key order as buildInput).
export function dataOf(r: Recipe): RecipeData {
  return buildInput(draftFrom(r), "en").data;
}

// Guardrails: warn, don't block (spec section 6).
export function warnings(orig: Recipe | null, d: RecipeData, t: TFn, lang: Lang, pick: (v: Tri | null | undefined, l: Lang) => string): string[] {
  const w: string[] = [];
  for (const g of d.ingredients) {
    const nm = pick(g.name, lang);
    if (g.qty !== null && g.qty <= 0) w.push(t("w_zero", nm, fmt(g.qty, 3)));
    const og = orig?.ingredients.find((x) => (x.name.en ?? "").toLowerCase() === (g.name.en ?? "").toLowerCase());
    if (og && og.qty && g.qty && og.qty > 0 && g.qty > 0 && og.unit === g.unit && (g.qty > og.qty * 3 || g.qty < og.qty / 3)) {
      const u = g.unit ?? "";
      let line = t("w_jump", nm, fmt(og.qty, 3), fmt(g.qty, 3), u);
      const guess = g.qty > og.qty ? g.qty / 10 : g.qty * 10;
      if (guess <= og.qty * 3 && guess >= og.qty / 3) line += " " + t("w_guess", fmt(guess, 3), fmt(og.qty, 3), u);
      w.push(line);
    }
  }
  if (d.mode === "portions" && d.ingredients.length && !d.ingredients.some((g) => g.inBatch)) w.push(t("w_nob"));
  return w;
}
