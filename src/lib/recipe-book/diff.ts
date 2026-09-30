// Recipe Book: validate edits and write the plain-English change summary.
// Pure (no DB) so scripts/test-recipe-calc.ts can test the whole save path.

import {
  CATEGORIES, MODES, UNITS, type Category, type Lang, type RecipeData, type RecipeIngredient, type ScaleMode,
  type Snapshot, type Store, type Tri, type Unit,
} from "./types";

const LANGS: Lang[] = ["en", "tr", "es"];
const MAX_TEXT = 600;

// ---------------------------------------------------------------------------
// Validation (the client already warns about typos; this just refuses junk)
// ---------------------------------------------------------------------------
function cleanTri(v: unknown, max = MAX_TEXT): Tri | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: Tri = {};
  for (const l of LANGS) {
    const s = typeof o[l] === "string" ? (o[l] as string).trim().slice(0, max) : "";
    if (s) out[l] = s;
  }
  if (!out.en) { const other = out.tr || out.es; if (other) out.en = other; } // English is the fallback, so never leave it empty
  return Object.keys(out).length ? out : null;
}

function cleanNum(v: unknown, opts: { min?: number; max?: number; positive?: boolean } = {}): number | null | "bad" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "bad";
  if (opts.positive && n <= 0) return "bad";
  if (opts.min !== undefined && n < opts.min) return "bad";
  if (opts.max !== undefined && n > opts.max) return "bad";
  return Math.round(n * 10000) / 10000;
}

function cleanMethod(v: unknown): RecipeData["method"] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: NonNullable<RecipeData["method"]> = {};
  for (const l of LANGS) {
    const steps = o[l];
    if (!Array.isArray(steps)) continue;
    const clean = steps.filter((s): s is string => typeof s === "string").map((s) => s.trim().slice(0, 400)).filter(Boolean).slice(0, 40);
    if (clean.length) out[l] = clean;
  }
  return Object.keys(out).length ? out : null;
}

export function validate(d: RecipeData): { ok: true; data: Omit<RecipeData, "photoPath" | "active"> } | { ok: false; message: string } {
  const name = typeof d.name === "string" ? d.name.trim().slice(0, 80) : "";
  if (!name) return { ok: false, message: "The recipe needs a name." };
  if (!CATEGORIES.includes(d.category as Category)) return { ok: false, message: "Unknown category." };
  if (!MODES.includes(d.mode as ScaleMode)) return { ok: false, message: "Unknown calculator type." };
  const stores = [...new Set(Array.isArray(d.stores) ? d.stores : [])].filter((s): s is Store => s === "meyhouse" || s === "meze-kebab");
  if (!stores.length) return { ok: false, message: "Pick at least one store." };

  const defaultPortions = cleanNum(d.defaultPortions, { positive: true, max: 10000 });
  const pourOz = cleanNum(d.pourOz, { positive: true, max: 1000 });
  const dilution = cleanNum(d.dilutionPct, { min: 0, max: 0.99 });
  const baseYieldL = cleanNum(d.baseYieldL, { positive: true, max: 10000 });
  const glassL = cleanNum(d.glassL, { positive: true, max: 100 });
  if ([defaultPortions, pourOz, dilution, baseYieldL, glassL].includes("bad")) return { ok: false, message: "A number is out of range." };
  if (d.mode === "liters" && baseYieldL === null) return { ok: false, message: "A liters recipe needs its base yield in liters." };

  if (!Array.isArray(d.ingredients) || d.ingredients.length > 40) return { ok: false, message: "Too many ingredients." };
  const ingredients: RecipeIngredient[] = [];
  for (const g of d.ingredients) {
    const gname = cleanTri(g?.name, 120);
    if (!gname) continue; // blank rows are dropped
    const qty = cleanNum(g.qty, { min: -100000, max: 100000 });
    if (qty === "bad") return { ok: false, message: `Amount for ${gname.en} isn't a number.` };
    const unit = g.unit && UNITS.includes(g.unit as Unit) ? (g.unit as Unit) : null;
    ingredients.push({
      name: gname,
      batchName: typeof g.batchName === "string" && g.batchName.trim() ? g.batchName.trim().slice(0, 80) : null,
      qty,
      unit,
      text: qty === null ? cleanTri(g.text, 120) : null,
      inBatch: g.inBatch === true,
      note: cleanTri(g.note, 200),
    });
  }

  return {
    ok: true,
    data: {
      name,
      category: d.category,
      stores,
      mode: d.mode,
      batchable: d.mode === "portions",
      defaultPortions: defaultPortions as number | null,
      dilutionPct: (dilution as number | null) ?? 0,
      pourOz: pourOz as number | null,
      glass: cleanTri(d.glass),
      ice: cleanTri(d.ice),
      garnish: cleanTri(d.garnish),
      howTo: cleanTri(d.howTo),
      storage: d.storage === "freezer" || d.storage === "fridge" ? d.storage : null,
      notes: cleanTri(d.notes),
      method: cleanMethod(d.method),
      baseYieldL: baseYieldL as number | null,
      glassL: glassL as number | null,
      needsReview: d.needsReview === true,
      needsSpec: d.needsSpec === true,
      ingredients,
    },
  };
}

// ---------------------------------------------------------------------------
// Plain-English summary of what changed (stored with the log row)
// e.g. "Sage Tea Syrup 0.5 oz → 0.75 oz; Garnish (ES): Chile serrano asado → Chile asado"
// ---------------------------------------------------------------------------
const n2s = (n: number | null | undefined) => (n === null || n === undefined ? "—" : String(Math.round(n * 10000) / 10000));
const short = (s: string | undefined | null) => {
  const v = (s ?? "").replace(/\s+/g, " ").trim();
  return v ? (v.length > 60 ? v.slice(0, 57) + "…" : v) : "—";
};
const amount = (g: RecipeIngredient) =>
  g.qty !== null ? `${n2s(g.qty)} ${g.unit === "dash" ? "dash" : g.unit ?? ""}`.trim() : short(g.text?.en ?? "");
const langTag = (l: Lang) => (l === "en" ? "" : ` (${l.toUpperCase()})`);

function triChanges(label: string, a: Tri | null, b: Tri | null): string[] {
  const out: string[] = [];
  for (const l of LANGS) {
    const x = a?.[l] ?? "", y = b?.[l] ?? "";
    if (x !== y) out.push(`${label}${langTag(l)}: ${short(x)} → ${short(y)}`);
  }
  return out;
}

export function summarize(before: Snapshot | null, after: Snapshot): string {
  if (!before) return `Created ${after.name}`;
  const p: string[] = [];
  if (before.active !== after.active) p.push(after.active ? "Restored (un-archived)" : "Archived");
  if (before.name !== after.name) p.push(`Name: ${short(before.name)} → ${short(after.name)}`);

  // ingredients: pair by English name first, then by position
  const bLeft = before.ingredients.map((g, i) => ({ g, i }));
  const pairs: { a: RecipeIngredient | null; b: RecipeIngredient | null }[] = [];
  const unmatchedAfter: { g: RecipeIngredient; i: number }[] = [];
  after.ingredients.forEach((g, i) => {
    const k = bLeft.findIndex((x) => (x.g.name.en ?? "").toLowerCase() === (g.name.en ?? "").toLowerCase());
    if (k >= 0) { pairs.push({ a: bLeft[k].g, b: g }); bLeft.splice(k, 1); }
    else unmatchedAfter.push({ g, i });
  });
  for (const u of unmatchedAfter) {
    const k = bLeft.findIndex((x) => x.i === u.i);
    if (k >= 0) { pairs.push({ a: bLeft[k].g, b: u.g }); bLeft.splice(k, 1); }
    else pairs.push({ a: null, b: u.g });
  }
  for (const x of bLeft) pairs.push({ a: x.g, b: null });

  for (const { a, b } of pairs) {
    if (!a && b) { p.push(`Added ${short(b.name.en)} ${amount(b)}`.trim()); continue; }
    if (a && !b) { p.push(`Removed ${short(a.name.en)}`); continue; }
    if (!a || !b) continue;
    const nm = short(b.name.en);
    for (const l of LANGS) {
      if ((a.name[l] ?? "") !== (b.name[l] ?? "")) p.push(`Ingredient${langTag(l)}: ${short(a.name[l])} → ${short(b.name[l])}`);
    }
    if (a.qty !== b.qty || a.unit !== b.unit) p.push(`${nm} ${amount(a)} → ${amount(b)}`);
    else if (a.qty === null) p.push(...triChanges(`${nm} amount`, a.text, b.text));
    if (a.inBatch !== b.inBatch) p.push(b.inBatch ? `${nm} now in batch` : `${nm} removed from batch`);
    if ((a.batchName ?? "") !== (b.batchName ?? "")) p.push(`${nm} batch name: ${short(a.batchName)} → ${short(b.batchName)}`);
    p.push(...triChanges(`${nm} note`, a.note, b.note));
  }
  const sameSet = before.ingredients.length === after.ingredients.length && pairs.every((x) => x.a && x.b);
  if (sameSet && before.ingredients.some((g, i) => (g.name.en ?? "") !== (after.ingredients[i]?.name.en ?? ""))) p.push("Ingredients reordered");

  p.push(...triChanges("Glass", before.glass, after.glass));
  p.push(...triChanges("Ice", before.ice, after.ice));
  p.push(...triChanges("Garnish", before.garnish, after.garnish));
  p.push(...triChanges("How to", before.howTo, after.howTo));
  p.push(...triChanges("Notes", before.notes, after.notes));
  for (const l of LANGS) {
    if (JSON.stringify(before.method?.[l] ?? []) !== JSON.stringify(after.method?.[l] ?? [])) p.push(`Method${langTag(l)} changed`);
  }
  const storage = (s: string | null) => (s === "freezer" ? "Keep in freezer" : s === "fridge" ? "Keep in fridge" : "—");
  if (before.storage !== after.storage) p.push(`Storage: ${storage(before.storage)} → ${storage(after.storage)}`);
  if (before.defaultPortions !== after.defaultPortions) p.push(`Usual batch: ${n2s(before.defaultPortions)} → ${n2s(after.defaultPortions)}`);
  if (before.pourOz !== after.pourOz) p.push(`Pour: ${n2s(before.pourOz)} oz → ${n2s(after.pourOz)} oz`);
  if (before.dilutionPct !== after.dilutionPct) p.push(`Dilution: ${n2s(before.dilutionPct * 100)}% → ${n2s(after.dilutionPct * 100)}%`);
  if (before.baseYieldL !== after.baseYieldL) p.push(`Base yield: ${n2s(before.baseYieldL)} L → ${n2s(after.baseYieldL)} L`);
  if (before.glassL !== after.glassL) p.push(`Glass size: ${n2s(before.glassL)} L → ${n2s(after.glassL)} L`);
  if (before.category !== after.category) p.push(`Category: ${before.category} → ${after.category}`);
  if (before.mode !== after.mode) p.push(`Calculator: ${before.mode} → ${after.mode}`);
  if ([...before.stores].sort().join() !== [...after.stores].sort().join()) p.push(`Stores: ${before.stores.join(", ")} → ${after.stores.join(", ")}`);
  if (before.needsReview !== after.needsReview) p.push(after.needsReview ? "Marked for review" : "Review done");
  if (before.needsSpec !== after.needsSpec) p.push(after.needsSpec ? "Marked as needing a spec" : "Spec added");
  if (before.photoPath !== after.photoPath) p.push(!before.photoPath ? "Photo added" : !after.photoPath ? "Photo removed" : "Photo changed");
  return p.join("; ");
}

