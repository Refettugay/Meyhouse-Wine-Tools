// Recipe Book editing, change history and revert. Server-only.
//
// Callers (staff page actions after a PIN, admin actions after a login check)
// decide WHO the editor is; everything here trusts that and only validates data.
// Every write happens in one transaction together with its row in
// beverage.bar_recipe_change_log (append-only: a DB trigger refuses UPDATE /
// DELETE / TRUNCATE), holding the full before + after snapshot.

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { loadSnapshot, toSnapshot } from "./load";
import { signPhotos, uploadPhoto } from "./photos";
import { summarize, validate } from "./diff";
import type { HistoryEntry, HistoryFilters, HistoryRow, Lang, LogAction, SaveInput, SaveResult, Snapshot } from "./types";

export type Editor = { personId: string | null; name: string };
export type Source = "staff_page" | "admin";

const LANGS: Lang[] = ["en", "tr", "es"];

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
function slugify(name: string): string {
  const s = name
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return s || "recipe";
}

const json = (v: unknown) => (v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue));
const jsonOrNull = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue);

async function writeSnapshot(tx: Prisma.TransactionClient, snap: Snapshot, editor: Editor, create: boolean, sortOrder?: number) {
  const fields = {
    name: snap.name,
    category: snap.category,
    stores: snap.stores,
    scaleMode: snap.mode,
    batchable: snap.batchable,
    defaultPortions: snap.defaultPortions,
    dilutionPct: snap.dilutionPct,
    pourFromBatchOz: snap.pourOz,
    glass: jsonOrNull(snap.glass),
    ice: jsonOrNull(snap.ice),
    garnish: jsonOrNull(snap.garnish),
    howTo: jsonOrNull(snap.howTo),
    storage: snap.storage,
    notes: jsonOrNull(snap.notes),
    method: jsonOrNull(snap.method),
    baseYieldL: snap.baseYieldL,
    glassL: snap.glassL,
    needsReview: snap.needsReview,
    needsSpec: snap.needsSpec,
    active: snap.active,
    photoPath: snap.photoPath,
    updatedBy: editor.personId,
    updatedByName: editor.name,
    updatedAt: new Date(),
  };
  if (create) await tx.barRecipe.create({ data: { id: snap.id, sortOrder: sortOrder ?? 0, ...fields } });
  else await tx.barRecipe.update({ where: { id: snap.id }, data: fields });
  await tx.barRecipeIngredient.deleteMany({ where: { recipeId: snap.id } });
  if (snap.ingredients.length) {
    await tx.barRecipeIngredient.createMany({
      data: snap.ingredients.map((g, i) => ({
        recipeId: snap.id,
        sortOrder: (i + 1) * 10,
        name: json(g.name) ?? { en: "" },
        batchName: g.batchName,
        qty: g.qty,
        unit: g.unit,
        text: jsonOrNull(g.text),
        inBatch: g.inBatch,
        note: jsonOrNull(g.note),
      })),
    });
  }
}

async function logChange(
  tx: Prisma.TransactionClient,
  a: { recipeId: string; editor: Editor; source: Source; device: string | null; lang: Lang | null; action: LogAction; before: Snapshot | null; after: Snapshot; summary: string; revertedLogId?: bigint },
) {
  await tx.barRecipeChangeLog.create({
    data: {
      recipeId: a.recipeId,
      changedByPersonId: a.editor.personId,
      changedByName: a.editor.name,
      source: a.source,
      device: a.device,
      language: a.lang,
      action: a.action,
      revertedLogId: a.revertedLogId ?? null,
      before: a.before ? (a.before as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      after: a.after as unknown as Prisma.InputJsonValue,
      summary: a.summary.slice(0, 4000),
    },
  });
}

export async function saveRecipe(editor: Editor, source: Source, input: SaveInput, device: string | null): Promise<SaveResult> {
  const v = validate(input.data);
  if (!v.ok) return { ok: false, error: "invalid", message: v.message };
  const lang: Lang = LANGS.includes(input.lang) ? input.lang : "en";

  const current = input.id ? await loadSnapshot(input.id) : null;
  if (input.id && !current) return { ok: false, error: "invalid", message: "That recipe no longer exists." };
  if (current && input.baseUpdatedAt && current.updatedAt.toISOString() !== input.baseUpdatedAt) {
    return { ok: false, error: "conflict" };
  }

  let id = input.id;
  if (!id) {
    const base = slugify(v.data.name);
    id = base;
    for (let i = 2; await prisma.barRecipe.findUnique({ where: { id }, select: { id: true } }); i++) id = `${base}-${i}`;
  }

  let photoPath = current?.snap.photoPath ?? null;
  if (input.photo?.kind === "remove") photoPath = null;
  if (input.photo?.kind === "new") {
    const p = await uploadPhoto(id, input.photo.full, input.photo.thumb);
    if (!p) return { ok: false, error: "invalid", message: "That photo couldn't be used. Try another one." };
    photoPath = p;
  }

  const after: Snapshot = { id, ...v.data, active: current?.snap.active ?? true, photoPath };
  const before = current?.snap ?? null;
  const summary = summarize(before, after);
  if (before && !summary) return { ok: false, error: "nothing" };

  const maxSort = current ? undefined : ((await prisma.barRecipe.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 10;
  await prisma.$transaction(async (tx) => {
    if (before) {
      // re-check inside the transaction so two saves can't both pass the conflict check
      const row = await tx.barRecipe.findUnique({ where: { id: id! }, select: { updatedAt: true } });
      if (!row || row.updatedAt.getTime() !== current!.updatedAt.getTime()) throw new ConflictError();
    }
    await writeSnapshot(tx, after, editor, !before, maxSort);
    await logChange(tx, { recipeId: id!, editor, source, device, lang, action: before ? "update" : "create", before, after, summary });
  });
  return { ok: true, id, summary, by: editor.name };
}

class ConflictError extends Error {}

export async function saveRecipeSafe(editor: Editor, source: Source, input: SaveInput, device: string | null): Promise<SaveResult> {
  try {
    return await saveRecipe(editor, source, input, device);
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, error: "conflict" };
    console.error("recipe-book save", e);
    return { ok: false, error: "server" };
  }
}

// Archive (never hard-delete) / bring back.
export async function setActive(editor: Editor, source: Source, id: string, active: boolean, device: string | null): Promise<SaveResult> {
  try {
    const current = await loadSnapshot(id);
    if (!current) return { ok: false, error: "invalid", message: "That recipe no longer exists." };
    if (current.snap.active === active) return { ok: false, error: "nothing" };
    const after: Snapshot = { ...current.snap, active };
    const summary = summarize(current.snap, after);
    await prisma.$transaction(async (tx) => {
      await tx.barRecipe.update({ where: { id }, data: { active, updatedBy: editor.personId, updatedByName: editor.name, updatedAt: new Date() } });
      await logChange(tx, { recipeId: id, editor, source, device, lang: null, action: active ? "restore" : "archive", before: current.snap, after, summary });
    });
    return { ok: true, id, summary, by: editor.name };
  } catch (e) {
    console.error("recipe-book archive", e);
    return { ok: false, error: "server" };
  }
}

// "Revert to this version": write the entry's BEFORE snapshot back and log the
// revert as its own entry (stamped with whoever reverted). Reverting a
// "create" archives the recipe instead (there is no earlier version).
export async function revertTo(editor: Editor, source: Source, logId: string, device: string | null): Promise<SaveResult> {
  try {
    if (!/^\d{1,18}$/.test(logId)) return { ok: false, error: "invalid" };
    const entry = await prisma.barRecipeChangeLog.findUnique({ where: { id: BigInt(logId) } });
    if (!entry) return { ok: false, error: "invalid", message: "That change no longer exists." };
    const current = await loadSnapshot(entry.recipeId);
    if (!current) return { ok: false, error: "invalid", message: "That recipe no longer exists." };

    const target: Snapshot = entry.before
      ? { ...(entry.before as unknown as Snapshot), id: entry.recipeId }
      : { ...current.snap, active: false };
    const summary = summarize(current.snap, target);
    if (!summary) return { ok: false, error: "nothing" };
    const action: LogAction = !current.snap.active && target.active ? "restore" : !target.active && current.snap.active ? "archive" : "revert";
    await prisma.$transaction(async (tx) => {
      await writeSnapshot(tx, target, editor, false);
      await logChange(tx, {
        recipeId: entry.recipeId, editor, source, device, lang: null, action, before: current.snap, after: target,
        summary: `Reverted to before change #${entry.id}: ${summary}`, revertedLogId: entry.id,
      });
    });
    return { ok: true, id: entry.recipeId, summary, by: editor.name };
  } catch (e) {
    console.error("recipe-book revert", e);
    return { ok: false, error: "server" };
  }
}

// ---------------------------------------------------------------------------
// Reads (owners + managers only — callers check)
// ---------------------------------------------------------------------------
function toRow(e: { id: bigint; recipeId: string; changedByName: string; changedAt: Date; action: string; language: string | null; source: string; summary: string; after: unknown }): HistoryRow {
  const after = e.after as { name?: string } | null;
  return {
    id: e.id.toString(),
    recipeId: e.recipeId,
    recipeName: after?.name ?? e.recipeId,
    by: e.changedByName,
    at: e.changedAt.toISOString(),
    action: e.action as LogAction,
    language: (e.language as Lang | null) ?? null,
    source: e.source === "admin" ? "admin" : "staff_page",
    summary: e.summary,
  };
}

export async function listHistory(f: HistoryFilters) {
  const where: Prisma.BarRecipeChangeLogWhereInput = {};
  if (f.person) where.changedByName = f.person;
  if (f.recipeId) where.recipeId = f.recipeId;
  if (f.from || f.to) {
    where.changedAt = {};
    if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) where.changedAt.gte = new Date(`${f.from}T00:00:00-08:00`);
    if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) where.changedAt.lt = new Date(new Date(`${f.to}T00:00:00-08:00`).getTime() + 86400_000);
  }
  const [rows, people, recipes] = await Promise.all([
    prisma.barRecipeChangeLog.findMany({ where, orderBy: { changedAt: "desc" }, take: 300 }),
    prisma.barRecipeChangeLog.findMany({ distinct: ["changedByName"], select: { changedByName: true }, orderBy: { changedByName: "asc" } }),
    prisma.barRecipe.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { rows: rows.map(toRow), people: people.map((p) => p.changedByName), recipes };
}

export async function getEntry(id: string): Promise<HistoryEntry | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const e = await prisma.barRecipeChangeLog.findUnique({ where: { id: BigInt(id) } });
  if (!e) return null;
  const before = (e.before as unknown as Snapshot | null) ?? null;
  const after = e.after as unknown as Snapshot;
  const urls = await signPhotos([before?.photoPath ?? "", after?.photoPath ?? ""]);
  return {
    ...toRow(e),
    before,
    after,
    beforePhotoUrl: before?.photoPath ? urls.get(before.photoPath) ?? null : null,
    afterPhotoUrl: after?.photoPath ? urls.get(after.photoPath) ?? null : null,
  };
}

// "Who can see this" — read-only (it's changed on the launcher Team page).
export async function accessOverview() {
  const rows = await prisma.$queryRaw<{ name: string; enabled: boolean; people: string[] | null }[]>`
    select pos.name, coalesce(pra.enabled, false) as enabled,
      array_remove(array_agg(p.full_name order by p.full_name) filter (where p.active), null) as people
    from public.positions pos
    left join beverage.position_recipe_access pra on pra.position_id = pos.id
    left join public.profile_positions pp on pp.position_id = pos.id
    left join public.profiles p on p.id = pp.user_id
    group by pos.id, pos.name, pos.sort_order, pra.enabled
    order by pos.sort_order, pos.name`;
  return rows.map((r) => ({ name: r.name, enabled: r.enabled, people: r.people ?? [] }));
}

export { toSnapshot };
