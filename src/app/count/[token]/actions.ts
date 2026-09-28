"use server";

// Staff count page server actions. Public endpoints reached only through a
// store's secret link token; everything after sign-in also needs the signed
// staff session cookie. Nothing here returns prices or costs.

import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { resolveCountLink, type CountLinkStore } from "@/lib/staff-count/link";
import { checkPin, setInitialPin, isValidPinFormat, pinConfigured } from "@/lib/staff-count/pin";
import { getStaffSession, setStaffSession, clearStaffSession, type StaffSession } from "@/lib/staff-count/session";
import { typeChipFor } from "@/lib/staff-count/types";
import { effectiveUnit, orderQty, type OrderUnit } from "@/lib/ordering-math";
import type { CountFeed, SendCount, SendResult, StaffPerson } from "@/lib/staff-count/feed-types";

const BAD_LINK = { ok: false as const, error: "This link isn't active. Ask your manager for the current link." };
const NOT_CONFIGURED = { ok: false as const, error: "The count page isn't set up yet. Tell your manager." };
const SIGNED_OUT = { ok: false as const, error: "Please sign in again.", signedOut: true };
const STORE_TZ = "America/Los_Angeles";

function storeDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: STORE_TZ }); // YYYY-MM-DD
}

async function rosterFor(store: CountLinkStore): Promise<StaffPerson[]> {
  if (!store.scheduleLocationId) return [];
  const rows = await prisma.$queryRaw<{ id: string; full_name: string | null; has_pin: boolean; access_on: boolean }[]>`
    select p.id::text as id, p.full_name, (pp.pin_hash is not null) as has_pin,
           coalesce(pp.access_enabled, true) as access_on
    from public.profile_locations pl
    join public.profiles p on p.id = pl.user_id
    left join public.person_pins pp on pp.person_id = p.id
    where pl.location_id = ${store.scheduleLocationId}::uuid
      -- active staff, plus owners/managers even when inactive in Schedule
      -- (Refet is kept inactive so he isn't scheduled, but he counts/tests)
      and (p.active = true or p.role in ('owner', 'manager'))
    order by p.full_name`;
  return rows
    .filter((r) => (r.full_name || "").trim())
    .map((r) => ({ id: r.id, name: (r.full_name || "").trim(), hasPin: r.has_pin, accessOff: !r.access_on }));
}

async function signedIn(token: string): Promise<{ store: CountLinkStore; session: StaffSession } | null> {
  const store = await resolveCountLink(token);
  if (!store) return null;
  const session = await getStaffSession(token, store.locationId);
  if (!session) return null;
  // Still on this store's roster with Tip Entry access on? (removed or
  // switched-off people lose access right away)
  const ok = (await rosterFor(store)).some((p) => p.id === session.personId && !p.accessOff);
  return ok ? { store, session } : null;
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export async function listStaff(token: string): Promise<{ ok: true; storeName: string; people: StaffPerson[]; me: string | null } | { ok: false; error: string }> {
  if (!pinConfigured()) return NOT_CONFIGURED;
  const store = await resolveCountLink(token);
  if (!store) return BAD_LINK;
  const people = await rosterFor(store);
  const session = await getStaffSession(token, store.locationId);
  const me = session && people.some((p) => p.id === session.personId && !p.accessOff) ? session.name : null;
  return { ok: true, storeName: store.name.replace("Meyhouse ", ""), people, me };
}

export async function signIn(token: string, personId: string, pin: string): Promise<{ ok: true } | { ok: false; error: string; needsPin?: boolean }> {
  if (!pinConfigured()) return NOT_CONFIGURED;
  const store = await resolveCountLink(token);
  if (!store) return BAD_LINK;
  const person = (await rosterFor(store)).find((p) => p.id === personId);
  if (!person) return { ok: false, error: "That name isn't on this store's team." };
  if (person.accessOff) return { ok: false, error: "Your access is switched off. Ask a manager." };
  if (!person.hasPin) return { ok: false, error: "Create your PIN first.", needsPin: true };

  const r = await checkPin(personId, pin);
  if (!r.ok) {
    if (r.error === "wrong") return { ok: false, error: "Wrong PIN. Try again." };
    if (r.error === "disabled") return { ok: false, error: "Your access is switched off. Ask a manager." };
    if (r.error === "not_set") return { ok: false, error: "Create your PIN first.", needsPin: true };
    return { ok: false, error: "Enter your 4-digit PIN." };
  }
  await setStaffSession(token, { personId, name: person.name, locationId: store.locationId });
  await prisma.orderActivityLog.create({
    data: {
      organizationId: store.organizationId, locationId: store.locationId, entity: "LINK", action: "staff_sign_in",
      actorId: personId, actorName: person.name, actorKind: "staff", source: "staff_count",
    },
  });
  return { ok: true };
}

// First sign-in without a PIN: the person creates one (same rules as Tip Entry).
export async function createPin(token: string, personId: string, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pinConfigured()) return NOT_CONFIGURED;
  const store = await resolveCountLink(token);
  if (!store) return BAD_LINK;
  const person = (await rosterFor(store)).find((p) => p.id === personId);
  if (!person) return { ok: false, error: "That name isn't on this store's team." };
  if (person.accessOff) return { ok: false, error: "Your access is switched off. Ask a manager." };
  if (!isValidPinFormat(pin)) return { ok: false, error: "A PIN is 4 digits." };

  const w = await setInitialPin(personId, pin, person.name);
  if (!w.ok) {
    if (w.error === "already_set") return { ok: false, error: "You already have a PIN — sign in with it." };
    if (w.error === "taken") return { ok: false, error: "That PIN is already used by someone else. Pick another." };
    return { ok: false, error: "Couldn't save your PIN. Try again." };
  }
  await setStaffSession(token, { personId, name: person.name, locationId: store.locationId });
  await prisma.orderActivityLog.create({
    data: {
      organizationId: store.organizationId, locationId: store.locationId, entity: "PIN", action: "pin_created",
      actorId: personId, actorName: person.name, actorKind: "staff", source: "staff_count",
      note: "First-time PIN created on the staff count page",
    },
  });
  return { ok: true };
}

export async function signOut(token: string): Promise<{ ok: true }> {
  await clearStaffSession(token);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The count list (no prices, no costs)
// ---------------------------------------------------------------------------

export async function loadCountFeed(token: string): Promise<{ ok: true; feed: CountFeed } | { ok: false; error: string; signedOut?: boolean }> {
  if (!pinConfigured()) return NOT_CONFIGURED;
  const auth = await signedIn(token);
  if (!auth) return (await resolveCountLink(token)) ? SIGNED_OUT : BAD_LINK;
  const { store, session } = auth;

  const [inv, areas, todays] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { locationId: store.locationId, ingredient: { isActive: true } },
      select: {
        id: true,
        parLevel: true,
        storageArea: { select: { id: true, name: true } },
        ingredient: {
          select: {
            name: true, ingredientCategory: true, orderUnit: true, casePackSize: true, vendor: true, menuStatus: true,
            vendorRef: { select: { name: true } },
          },
        },
      },
      orderBy: { ingredient: { name: "asc" } },
    }),
    prisma.storageArea.findMany({
      where: { locationId: store.locationId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.orderCountEntry.findMany({
      where: { locationId: store.locationId, countedAt: { gte: new Date(Date.now() - 36 * 3600_000) } },
      orderBy: { countedAt: "desc" },
      select: { storageAreaId: true, countedById: true, countedByName: true, countedAt: true },
    }),
  ]);

  const today = storeDay(new Date());
  const countedToday: CountFeed["countedToday"] = {};
  for (const e of todays) {
    if (storeDay(e.countedAt) !== today) continue;
    const k = e.storageAreaId ?? "none";
    if (countedToday[k]) continue; // newest first
    countedToday[k] = { byName: e.countedByName || "Someone", at: e.countedAt.toISOString(), byMe: e.countedById === session.personId };
  }

  const items = inv.map((i) => {
    const g = i.ingredient;
    const cps = g.casePackSize ?? null;
    return {
      id: i.id,
      name: g.name,
      type: typeChipFor(g.ingredientCategory),
      areaId: i.storageArea?.id ?? null,
      areaName: i.storageArea?.name ?? null,
      vendor: g.vendorRef?.name || g.vendor || null,
      casePack: cps && cps > 1 ? cps : null,
      par: i.parLevel,
      unit: effectiveUnit(g.orderUnit, cps),
      keg: cps === -3,
      offMenu: g.menuStatus !== "ON_MENU",
    };
  });

  return {
    ok: true,
    feed: {
      storeName: store.name.replace("Meyhouse ", ""),
      me: { name: session.name },
      items,
      areas: areas.filter((a) => items.some((it) => it.areaId === a.id)),
      countedToday,
    },
  };
}

// ---------------------------------------------------------------------------
// Send to manager
// ---------------------------------------------------------------------------
// Goes into the store's ONE open cart (latest SUBMITTED order; created if none).
// Each line keeps who counted it and when (source = staff). If an item was
// already counted, the latest count wins; every count is kept in
// OrderCountEntry. Every change is logged. Does NOT touch inventory stock.

export async function sendCounts(token: string, counts: SendCount[], request: string): Promise<SendResult> {
  if (!pinConfigured()) return NOT_CONFIGURED;
  const auth = await signedIn(token);
  if (!auth) return (await resolveCountLink(token)) ? SIGNED_OUT : BAD_LINK;
  const { store, session } = auth;

  const clean = new Map<string, { count: number; unitPick: OrderUnit | null }>();
  for (const c of Array.isArray(counts) ? counts : []) {
    const n = Number(c?.count);
    if (typeof c?.id !== "string" || !Number.isFinite(n) || n < 0 || n > 9999) continue;
    const pick = c.unitPick === "CASE" || c.unitPick === "BOTTLE" ? c.unitPick : null;
    clean.set(c.id, { count: Math.round(n * 100) / 100, unitPick: pick });
  }
  const note = typeof request === "string" ? request.trim().slice(0, 500) : "";
  if (clean.size === 0 && !note) return { ok: false, error: "Count at least one item (or write what you need)." };

  const inv = await prisma.inventoryItem.findMany({
    where: { id: { in: [...clean.keys()] }, locationId: store.locationId, ingredient: { isActive: true } },
    select: {
      id: true, parLevel: true, ingredientId: true,
      storageArea: { select: { id: true, name: true } },
      ingredient: { select: { name: true, orderUnit: true, casePackSize: true, vendor: true, vendorRef: { select: { name: true } } } },
    },
  });

  const now = new Date();
  const actor = { actorId: session.personId, actorName: session.name, actorKind: "staff", source: "staff_count" } as const;
  let linesOrdered = 0;

  await prisma.$transaction(
    async (tx) => {
      // One send per store at a time, so two phones sending together can't
      // each open a separate cart.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"staff-count:" + store.locationId}))`;
      let order = await tx.orderList.findFirst({
        where: { organizationId: store.organizationId, locationId: store.locationId, status: "SUBMITTED" },
        orderBy: { submittedAt: "desc" },
        select: { id: true, items: { select: { id: true, ingredientId: true, quantityNeeded: true, unit: true, countedStock: true, source: true, transferFromLocationId: true } } },
      });
      const logs: Prisma.OrderActivityLogCreateManyInput[] = [];

      if (!order) {
        const created = await tx.orderList.create({
          data: {
            organizationId: store.organizationId,
            locationId: store.locationId,
            name: `${store.name} - ${now.toLocaleDateString("en-US", { timeZone: STORE_TZ })}`,
            status: "SUBMITTED",
            source: "staff",
            createdBy: session.personId,
            createdByName: session.name,
            submittedAt: now,
            submittedById: session.personId,
            submittedByName: session.name,
            countedAt: now,
          },
          select: { id: true },
        });
        order = { id: created.id, items: [] };
        logs.push({ organizationId: store.organizationId, locationId: store.locationId, orderListId: created.id, entity: "ORDER", action: "create", note: "Opened by a staff send", ...actor });
      } else {
        await tx.orderList.update({
          where: { id: order.id },
          data: { submittedAt: now, submittedById: session.personId, submittedByName: session.name, countedAt: now },
        });
      }
      const orderId = order.id;

      // Keep every count; the older ones for these items become history.
      if (inv.length > 0) {
        await tx.orderCountEntry.updateMany({
          where: { locationId: store.locationId, inventoryItemId: { in: inv.map((i) => i.id) }, supersededAt: null },
          data: { supersededAt: now },
        });
        await tx.orderCountEntry.createMany({
          data: inv.map((i) => {
            const c = clean.get(i.id)!;
            const unit = effectiveUnit(i.ingredient.orderUnit, i.ingredient.casePackSize);
            return {
              organizationId: store.organizationId,
              locationId: store.locationId,
              orderListId: orderId,
              ingredientId: i.ingredientId,
              inventoryItemId: i.id,
              storageAreaId: i.storageArea?.id ?? null,
              storageAreaName: i.storageArea?.name ?? null,
              count: c.count,
              unitPick: unit === null ? c.unitPick : null,
              countedById: session.personId,
              countedByName: session.name,
              countedAt: now,
            };
          }),
        });
      }

      for (const i of inv) {
        const c = clean.get(i.id)!;
        const adminUnit = effectiveUnit(i.ingredient.orderUnit, i.ingredient.casePackSize);
        const unitUsed = adminUnit ?? c.unitPick;
        const qty = orderQty(i.parLevel, c.count, unitUsed, i.ingredient.casePackSize);
        const unitStr = unitUsed === "CASE" ? "case" : "bottle";
        const existing = order.items.find((l) => l.ingredientId === i.ingredientId && !l.transferFromLocationId);
        const lineData = {
          countedStock: c.count,
          parSnapshot: i.parLevel,
          quantityNeeded: qty,
          unit: unitStr,
          unitIsStaffPick: adminUnit === null && c.unitPick !== null,
          vendor: i.ingredient.vendorRef?.name || i.ingredient.vendor || null,
          storageArea: i.storageArea?.name ?? null,
          countedById: session.personId,
          countedByName: session.name,
          countedAt: now,
          source: "staff",
          status: "PENDING",
        };
        const base = { organizationId: store.organizationId, locationId: store.locationId, orderListId: orderId, ingredientId: i.ingredientId, ...actor };

        if (qty > 0) {
          linesOrdered++;
          if (existing) {
            await tx.orderListItem.update({ where: { id: existing.id }, data: lineData });
            logs.push({ ...base, orderListItemId: existing.id, entity: "LINE", action: "recount", field: "quantityNeeded",
              oldValue: `${existing.quantityNeeded} ${existing.unit} (count ${existing.countedStock ?? "—"})`,
              newValue: `${qty} ${unitStr} (count ${c.count})` });
          } else {
            const created = await tx.orderListItem.create({ data: { orderListId: orderId, ingredientId: i.ingredientId, ...lineData }, select: { id: true } });
            logs.push({ ...base, orderListItemId: created.id, entity: "LINE", action: "count", field: "quantityNeeded",
              oldValue: null, newValue: `${qty} ${unitStr} (count ${c.count})` });
          }
        } else if (existing && existing.source === "staff") {
          // Latest count says nothing is needed any more → drop the staff line.
          await tx.orderListItem.delete({ where: { id: existing.id } });
          logs.push({ ...base, orderListItemId: existing.id, entity: "LINE", action: "remove", field: "quantityNeeded",
            oldValue: `${existing.quantityNeeded} ${existing.unit}`, newValue: "0", note: `Recounted at/above par (count ${c.count})` });
        }
      }

      if (note) {
        await tx.orderStaffRequest.create({
          data: { organizationId: store.organizationId, locationId: store.locationId, orderListId: orderId, text: note, requestedById: session.personId, requestedByName: session.name },
        });
        logs.push({ organizationId: store.organizationId, locationId: store.locationId, orderListId: orderId, entity: "REQUEST", action: "add", newValue: note, ...actor });
      }

      logs.push({ organizationId: store.organizationId, locationId: store.locationId, orderListId: orderId, entity: "ORDER", action: "staff_send",
        note: `${inv.length} counted, ${linesOrdered} to order${note ? ", 1 request" : ""}`, ...actor });
      await tx.orderActivityLog.createMany({ data: logs });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  // Sent → signed out automatically (the next person signs in fresh).
  await clearStaffSession(token);
  return { ok: true, linesOrdered, itemsCounted: inv.length };
}
