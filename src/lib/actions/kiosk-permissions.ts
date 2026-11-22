"use server";

// Admin → Settings → Kiosk permissions (2026-11-21, KIOSK_SWIPE_ACTIONS).
// Per person: "Can mark 86" on the staff kiosk. No saved row = the default by
// role (owner / manager / supervisor on, everyone else off). Only owners,
// admins and managers may change it. Every change is logged.

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { MARK86_DEFAULT_ROLES } from "@/lib/kiosk-item-flags";
import { revalidatePath } from "next/cache";

const EDIT_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);

export type KioskPersonRow = {
  personId: string;
  name: string;
  role: string; // owner | manager | supervisor | staff
  stores: string[];
  canMark86: boolean;
  isDefault: boolean; // true = no saved choice, using the role default
};

export async function loadKioskPeople(): Promise<{ canEdit: boolean; people: KioskPersonRow[] }> {
  const session = await requireAuth();
  const locations = await prisma.location.findMany({
    where: { organizationId: session.organizationId, scheduleLocationId: { not: null } },
    select: { name: true, scheduleLocationId: true },
  });
  const storeBySchedule = new Map(locations.map((l) => [l.scheduleLocationId!, l.name.replace("Meyhouse ", "")]));
  const scheduleIds = [...storeBySchedule.keys()];
  if (scheduleIds.length === 0) return { canEdit: EDIT_ROLES.has(session.role ?? ""), people: [] };

  // Everyone who can sign in to a kiosk here (same rule as the kiosk roster).
  const rows = await prisma.$queryRaw<{ id: string; full_name: string | null; role: string | null; location_id: string }[]>`
    select p.id::text as id, p.full_name, p.role, soa.location_id::text as location_id
    from public.staff_ordering_access soa
    join public.profile_locations pl on pl.user_id = soa.person_id and pl.location_id = soa.location_id
    join public.profiles p on p.id = soa.person_id
    where soa.enabled = true and p.active = true
      and soa.location_id = any(${scheduleIds}::uuid[])`;
  const saved = new Map(
    (await prisma.kioskPermission.findMany({ where: { organizationId: session.organizationId }, select: { personId: true, canMark86: true } }))
      .map((r) => [r.personId, r.canMark86]),
  );

  const byPerson = new Map<string, KioskPersonRow>();
  for (const r of rows) {
    const name = (r.full_name || "").trim();
    if (!name) continue;
    const role = (r.role || "staff").toLowerCase();
    const cur = byPerson.get(r.id) ?? {
      personId: r.id, name, role, stores: [],
      canMark86: saved.has(r.id) ? saved.get(r.id)! : MARK86_DEFAULT_ROLES.has(role),
      isDefault: !saved.has(r.id),
    };
    const store = storeBySchedule.get(r.location_id);
    if (store && !cur.stores.includes(store)) cur.stores.push(store);
    byPerson.set(r.id, cur);
  }
  const rank = (role: string) => (role === "owner" ? 0 : role === "manager" ? 1 : role === "supervisor" ? 2 : 3);
  const people = [...byPerson.values()].sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name));
  return { canEdit: EDIT_ROLES.has(session.role ?? ""), people };
}

export async function setCanMark86(personId: string, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAuth();
  if (!EDIT_ROLES.has(session.role ?? "")) return { ok: false, error: "Only owners and managers can change this." };
  if (typeof personId !== "string" || !/^[0-9a-f-]{36}$/i.test(personId) || typeof on !== "boolean") return { ok: false, error: "Bad request." };

  const person = await prisma.$queryRaw<{ full_name: string | null }[]>`select full_name from public.profiles where id = ${personId}::uuid`;
  if (person.length === 0) return { ok: false, error: "That person wasn't found." };
  const before = await prisma.kioskPermission.findUnique({
    where: { organizationId_personId: { organizationId: session.organizationId, personId } },
    select: { canMark86: true },
  });

  await prisma.kioskPermission.upsert({
    where: { organizationId_personId: { organizationId: session.organizationId, personId } },
    create: { organizationId: session.organizationId, personId, canMark86: on, updatedByName: session.userName },
    update: { canMark86: on, updatedAt: new Date(), updatedByName: session.userName },
  });
  await prisma.orderActivityLog.create({
    data: {
      organizationId: session.organizationId, entity: "PERMISSION", action: "can_mark_86", field: "canMark86",
      oldValue: before ? String(before.canMark86) : "default", newValue: String(on),
      actorId: session.userId, actorName: session.userName, actorKind: "manager", source: "admin",
      note: (person[0].full_name || "").trim() || personId,
    },
  });
  revalidatePath("/dashboard/settings/kiosk-permissions");
  return { ok: true };
}
