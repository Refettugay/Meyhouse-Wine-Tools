// Kiosk swipe actions (2026-11-21, KIOSK_SWIPE_ACTIONS). Server-only.
//
// Two flags per store item, shared by every device at that store:
//   CHECK      = "Check other areas" — a reminder while counting. Clears when a
//                count is entered for the item (any device), by "Remove flag",
//                or at the nightly reset (4:00 AM Pacific).
//   EIGHTY_SIX = "86" (completely out). Only people with "Can mark 86". Clears by
//                "Un-86", or when a count that passes should86ClearOnSend() is
//                sent with Send Manager. Never cleared by the nightly reset.
// Rows are never deleted: a cleared row keeps who/when/why. Every change is
// also written to OrderActivityLog (entity = FLAG).

import { prisma } from "@/lib/db";
import { ACTIVE_LINK } from "@/lib/store-links";
import type { Prisma } from "@/generated/prisma/client";
import type { ItemFlag } from "@/lib/staff-count/feed-types";

type Tx = Prisma.TransactionClient;
export type FlagKind = "CHECK" | "EIGHTY_SIX";
type Store = { organizationId: string; locationId: string };
type Actor = { personId: string; name: string };

// ---------------------------------------------------------------------------
// Refet's rule for clearing an 86 (keep it here, in one place, so it's easy to
// change): the 86 clears when a count of 0 for the item is SENT with "Send
// Manager". The item then goes to the manager / Order Cart through the normal
// flow, so the 86 has done its job. A count that's only typed (not sent) never
// clears it, and neither does the nightly reset.
// ---------------------------------------------------------------------------
export function should86ClearOnSend(sentCount: number): boolean {
  return sentCount === 0;
}

// Owners, managers and supervisors may mark 86 unless Admin switched them off;
// everyone else only if Admin switched them on (Settings → Kiosk permissions).
export const MARK86_DEFAULT_ROLES = new Set(["owner", "manager", "supervisor"]);

export async function canMark86(organizationId: string, personId: string, role: string): Promise<boolean> {
  const row = await prisma.kioskPermission.findUnique({
    where: { organizationId_personId: { organizationId, personId } },
    select: { canMark86: true },
  });
  return row ? row.canMark86 : MARK86_DEFAULT_ROLES.has(role);
}

// ---------------------------------------------------------------------------
// Nightly reset: 4:00 AM Pacific ends the business day.
// ---------------------------------------------------------------------------
const STORE_TZ = "America/Los_Angeles";
const RESET_HOUR = 4;

function laParts(t: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: STORE_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]),
  ) as Record<string, number>;
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

// The UTC instant of a Pacific wall-clock time (handles PST / PDT).
function laWallToUtc(y: number, m: number, d: number, h: number): number {
  const guess = Date.UTC(y, m - 1, d, h);
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = laParts(t);
    const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
    t = guess - offset;
  }
  return t;
}

/** The most recent 4:00 AM Pacific at or before `now`. */
export function lastResetAt(now = new Date()): Date {
  const p = laParts(now.getTime());
  let c = laWallToUtc(p.y, p.m, p.d, RESET_HOUR);
  if (c > now.getTime()) {
    const prev = new Date(Date.UTC(p.y, p.m - 1, p.d - 1));
    c = laWallToUtc(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), RESET_HOUR);
  }
  return new Date(c);
}

function logRow(store: Store, d: { ingredientId?: string | null; action: string; actor: Actor | null; note?: string; oldValue?: string; newValue?: string }): Prisma.OrderActivityLogCreateManyInput {
  return {
    organizationId: store.organizationId, locationId: store.locationId, ingredientId: d.ingredientId ?? null,
    entity: "FLAG", action: d.action, field: null, oldValue: d.oldValue ?? null, newValue: d.newValue ?? null,
    actorId: d.actor?.personId ?? null, actorName: d.actor?.name ?? "Nightly reset",
    actorKind: d.actor ? "staff" : "system", source: "staff_count", note: d.note ?? null,
  };
}

async function itemInfo(db: Tx | typeof prisma, store: Store, inventoryItemIds: string[]) {
  const rows = await db.inventoryItem.findMany({
    where: { id: { in: inventoryItemIds }, locationId: store.locationId, organizationId: store.organizationId, ...ACTIVE_LINK },
    select: { id: true, ingredientId: true, markedForRemoval: true, ingredient: { select: { name: true } } },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

/** Clear "Check other areas" flags left open past the last 4:00 AM reset (logged at the reset time). */
export async function expireCheckFlags(store: Store, now = new Date()): Promise<number> {
  const cutoff = lastResetAt(now);
  const stale = await prisma.kioskItemFlag.findMany({
    where: { locationId: store.locationId, kind: "CHECK", clearedAt: null, setAt: { lt: cutoff } },
    select: { id: true, inventoryItemId: true, setByName: true },
  });
  if (stale.length === 0) return 0;
  const cleared: typeof stale = [];
  for (const f of stale) {
    // Only rows still open: if another device cleared it a moment ago, it wins.
    const r = await prisma.kioskItemFlag.updateMany({
      where: { id: f.id, clearedAt: null },
      data: { clearedAt: cutoff, clearedById: null, clearedByName: "Nightly reset", clearReason: "nightly_reset" },
    });
    if (r.count > 0) cleared.push(f);
  }
  if (cleared.length === 0) return 0;
  const info = await itemInfo(prisma, store, cleared.map((f) => f.inventoryItemId));
  await prisma.orderActivityLog.createMany({
    data: cleared.map((f) => ({
      ...logRow(store, {
        ingredientId: info.get(f.inventoryItemId)?.ingredientId, action: "check_auto_clear", actor: null,
        note: `${info.get(f.inventoryItemId)?.ingredient.name ?? "Item"} — flagged by ${f.setByName || "someone"}, cleared at the 4:00 AM reset`,
      }),
      at: cutoff,
    })),
  });
  return cleared.length;
}

/** Open flags for this store, by store item id. */
export async function openFlagsFor(locationId: string): Promise<Map<string, { check: ItemFlag | null; eightySix: ItemFlag | null }>> {
  const rows = await prisma.kioskItemFlag.findMany({
    where: { locationId, clearedAt: null },
    select: { inventoryItemId: true, kind: true, setByName: true, setAt: true },
  });
  const out = new Map<string, { check: ItemFlag | null; eightySix: ItemFlag | null }>();
  for (const r of rows) {
    const cur = out.get(r.inventoryItemId) ?? { check: null, eightySix: null };
    const f: ItemFlag = { byName: r.setByName || "Someone", at: r.setAt.toISOString() };
    if (r.kind === "CHECK") cur.check = f;
    else if (r.kind === "EIGHTY_SIX") cur.eightySix = f;
    out.set(r.inventoryItemId, cur);
  }
  return out;
}

const ACTION = {
  CHECK: { on: "check_flag", off: "check_clear" },
  EIGHTY_SIX: { on: "eighty_six", off: "un_eighty_six" },
} as const;

/** Turn a flag on (no-op if already on). Caller checks permission. */
export async function setFlag(store: Store, actor: Actor, inventoryItemId: string, ingredientId: string, name: string, kind: FlagKind) {
  try {
    await prisma.kioskItemFlag.create({
      data: { organizationId: store.organizationId, locationId: store.locationId, inventoryItemId, kind, setById: actor.personId, setByName: actor.name },
    });
  } catch (e) {
    // Unique open-flag index: someone already flagged it — fine, leave theirs.
    if ((e as { code?: string })?.code === "P2002" || String(e).includes("KioskItemFlag_open_uniq")) {
      await prisma.orderActivityLog.create({ data: logRow(store, { ingredientId, action: ACTION[kind].on, actor, note: `${name} — already flagged by someone else` }) });
      return;
    }
    throw e;
  }
  await prisma.orderActivityLog.create({ data: logRow(store, { ingredientId, action: ACTION[kind].on, actor, note: name }) });
}

/**
 * Clear an open flag. The first clear wins (only an open row is updated); a
 * second clear at the same moment changes nothing but is still logged.
 */
export async function clearFlag(
  db: Tx | typeof prisma,
  store: Store,
  actor: Actor,
  inventoryItemId: string,
  ingredientId: string,
  name: string,
  kind: FlagKind,
  reason: "manual" | "counted" | "count_sent",
  logIfNothing = true,
): Promise<boolean> {
  const r = await db.kioskItemFlag.updateMany({
    where: { inventoryItemId, locationId: store.locationId, kind, clearedAt: null },
    data: { clearedAt: new Date(), clearedById: actor.personId, clearedByName: actor.name, clearReason: reason },
  });
  if (r.count === 0 && !logIfNothing) return false;
  const action =
    reason === "count_sent" ? "eighty_six_cleared_by_send" : reason === "counted" ? "check_cleared_by_count" : ACTION[kind].off;
  const note =
    r.count === 0 ? `${name} — already cleared by someone else`
      : reason === "count_sent" ? `${name} — cleared by count sent (count 0 sent to manager)`
        : reason === "counted" ? `${name} — count entered`
          : name;
  await db.orderActivityLog.create({ data: logRow(store, { ingredientId, action, actor, note }) });
  return r.count > 0;
}

/**
 * Called inside the Send Manager transaction, after the counts are saved: clears
 * the 86 on items whose sent count passes should86ClearOnSend(). Runs in the
 * same transaction, so a failed send leaves every 86 in place.
 */
export async function clear86OnSend(tx: Tx, store: Store, actor: Actor, sent: { inventoryItemId: string; ingredientId: string; name: string; count: number }[]) {
  const candidates = sent.filter((s) => should86ClearOnSend(s.count));
  if (candidates.length === 0) return 0;
  const open = await tx.kioskItemFlag.findMany({
    where: { locationId: store.locationId, kind: "EIGHTY_SIX", clearedAt: null, inventoryItemId: { in: candidates.map((c) => c.inventoryItemId) } },
    select: { inventoryItemId: true },
  });
  const openIds = new Set(open.map((o) => o.inventoryItemId));
  let n = 0;
  for (const c of candidates) {
    if (!openIds.has(c.inventoryItemId)) continue;
    if (await clearFlag(tx, store, actor, c.inventoryItemId, c.ingredientId, c.name, "EIGHTY_SIX", "count_sent", false)) n++;
  }
  return n;
}

export { itemInfo as kioskItemInfo };
