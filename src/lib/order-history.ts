// 8-week ordering history for Count & build "Last 8 · Wk · Mo" (2026-11-03,
// ORDER_CART_FLOW). Reads order_history_entry: written by "Ordered" taps
// (and the one-time backfill). Quantities are in CASES; a bottle line of an
// item with no case pack size can't be converted and is kept apart as bottles
// (shown as "+N btl" and flagged) — never guessed.

import { prisma } from "@/lib/db";

const STORE_TZ = "America/Los_Angeles";
export type HistoryPoint = { qty: number; date: string; weekNum: number; btl?: boolean };

export function storeToday(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: STORE_TZ }); // YYYY-MM-DD
}

// week 0 = the last 7 business days including today, 1 = the 7 before, ...
export function weeksAgo(businessDate: Date, today: string) {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(businessDate.toISOString().slice(0, 10) + "T00:00:00Z")) / 86400000);
  return Math.floor(days / 7);
}

export function historyMapFromEntries(
  entries: { ingredientId: string; locationId: string; businessDate: Date; qty: number; qtyCases: number | null }[],
  today: string,
) {
  const map = new Map<string, HistoryPoint[]>();
  for (const e of entries) {
    const w = weeksAgo(e.businessDate, today);
    if (w < 0 || w > 7) continue;
    const key = `${e.ingredientId}_${e.locationId}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(
      e.qtyCases === null
        ? { qty: e.qty, date: e.businessDate.toISOString(), weekNum: w, btl: true }
        : { qty: e.qtyCases, date: e.businessDate.toISOString(), weekNum: w },
    );
  }
  return map;
}

export async function loadHistoryMap(organizationId: string, now = new Date()) {
  const today = storeToday(now);
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 55);
  const entries = await prisma.orderHistoryEntry.findMany({
    where: { organizationId, businessDate: { gte: from } },
    select: { ingredientId: true, locationId: true, businessDate: true, qty: true, qtyCases: true },
  });
  return historyMapFromEntries(entries, today);
}
