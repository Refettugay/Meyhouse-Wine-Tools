// Read recipes from the DB. Server-only; callers must have checked access first.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { signPhotos, thumbPathOf } from "./photos";
import type { Category, Lang, Recipe, RecipeData, ScaleMode, Snapshot, Store, Tri, Unit } from "./types";

function tri(v: unknown): Tri | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: Tri = {};
  for (const k of ["en", "tr", "es"] as Lang[]) if (typeof o[k] === "string" && o[k]) out[k] = o[k] as string;
  return Object.keys(out).length ? out : null;
}

function method(v: unknown): RecipeData["method"] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: NonNullable<RecipeData["method"]> = {};
  for (const k of ["en", "tr", "es"] as Lang[]) {
    const steps = o[k];
    if (Array.isArray(steps)) {
      const clean = steps.filter((s): s is string => typeof s === "string" && s.trim() !== "");
      if (clean.length) out[k] = clean;
    }
  }
  return Object.keys(out).length ? out : null;
}

const num = (d: { toNumber(): number } | null | undefined) => (d == null ? null : d.toNumber());

const include = { ingredients: { orderBy: { sortOrder: "asc" as const } } };
type Row = Prisma.BarRecipeGetPayload<{ include: { ingredients: true } }>;

export function toSnapshot(r: Row): Snapshot {
  return {
    id: r.id,
    name: r.name,
    category: r.category as Category,
    stores: r.stores as Store[],
    mode: r.scaleMode as ScaleMode,
    batchable: r.batchable,
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
    needsReview: r.needsReview,
    needsSpec: r.needsSpec,
    active: r.active,
    photoPath: r.photoPath,
    ingredients: r.ingredients.map((g) => ({
      name: tri(g.name) ?? { en: "" },
      batchName: g.batchName,
      qty: num(g.qty),
      unit: (g.unit as Unit | null) ?? null,
      text: tri(g.text),
      inBatch: g.inBatch,
      note: tri(g.note),
    })),
  };
}

export async function loadSnapshot(id: string): Promise<{ snap: Snapshot; updatedAt: Date } | null> {
  const r = await prisma.barRecipe.findUnique({ where: { id }, include });
  return r ? { snap: toSnapshot(r), updatedAt: r.updatedAt } : null;
}

export async function loadActiveRecipes(): Promise<Recipe[]> {
  const rows = await prisma.barRecipe.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include,
  });
  const paths = rows.flatMap((r) => (r.photoPath ? [r.photoPath, thumbPathOf(r.photoPath)] : []));
  const urls = await signPhotos(paths);
  return rows.map((r) => ({
    ...toSnapshot(r),
    photoUrl: r.photoPath ? urls.get(r.photoPath) ?? null : null,
    thumbUrl: r.photoPath ? urls.get(thumbPathOf(r.photoPath)) ?? null : null,
    updatedAt: r.updatedAt.toISOString(),
    last: r.updatedByName ? { by: r.updatedByName, at: r.updatedAt.toISOString() } : null,
  }));
}
