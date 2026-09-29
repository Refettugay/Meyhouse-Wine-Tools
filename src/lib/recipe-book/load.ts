// Read recipes from the DB into the page's Recipe shape. Server-only; callers
// must have checked access first.
import { prisma } from "@/lib/db";
import type { Category, Lang, Recipe, ScaleMode, Store, Tri, Unit } from "./types";

type Json = unknown;

function tri(v: Json): Tri | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: Tri = {};
  for (const k of ["en", "tr", "es"] as Lang[]) if (typeof o[k] === "string" && o[k]) out[k] = o[k] as string;
  return Object.keys(out).length ? out : null;
}

function method(v: Json): Recipe["method"] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: NonNullable<Recipe["method"]> = {};
  for (const k of ["en", "tr", "es"] as Lang[]) {
    const steps = o[k];
    if (Array.isArray(steps)) out[k] = steps.filter((s): s is string => typeof s === "string");
  }
  return Object.keys(out).length ? out : null;
}

const num = (d: { toNumber(): number } | null | undefined) => (d == null ? null : d.toNumber());

export async function loadActiveRecipes(): Promise<Recipe[]> {
  const rows = await prisma.barRecipe.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { ingredients: { orderBy: { sortOrder: "asc" } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category as Category,
    stores: r.stores as Store[],
    mode: r.scaleMode as ScaleMode,
    defaultPortions: num(r.defaultPortions),
    dilutionPct: r.dilutionPct.toNumber(),
    pourOz: num(r.pourFromBatchOz),
    glass: tri(r.glass),
    ice: tri(r.ice),
    garnish: tri(r.garnish),
    howTo: tri(r.howTo),
    storage: r.storage === "freezer" || r.storage === "fridge" ? r.storage : null,
    notes: tri(r.notes),
    method: method(r.method),
    baseYieldL: num(r.baseYieldL),
    glassL: num(r.glassL),
    needsReview: r.needsReview || r.needsSpec,
    last: r.updatedByName ? { by: r.updatedByName, at: r.updatedAt.toISOString() } : null,
    ingredients: r.ingredients.map((g) => ({
      name: tri(g.name) ?? { en: "" },
      batchName: g.batchName,
      qty: num(g.qty),
      unit: (g.unit as Unit | null) ?? null,
      text: tri(g.text),
      inBatch: g.inBatch,
      note: tri(g.note),
    })),
  }));
}
