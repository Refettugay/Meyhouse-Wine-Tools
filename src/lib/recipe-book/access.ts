// Who may open the staff Recipe Book. Server-only; every server action calls
// this again (UI state is never trusted).
//
// Rule (Refet, 2026-09-29):
//   - owners: ALWAYS, even if their profile is inactive or hidden from the
//     schedule (an owner's "inactive" only means "not on the schedule");
//   - managers / supervisors: when active;
//   - everyone else: when active AND at least one of their positions is ticked
//     "Recipe access" in Team settings (beverage.position_recipe_access).
// "Hide from schedule" never matters here.

import { prisma } from "@/lib/db";
import { verifyPinAsync, isValidPinFormat } from "@/lib/staff-count/pin";
import type { StaffRole } from "./types";

export type AccessCheck = {
  personId: string;
  name: string;
  role: StaffRole;
  allowed: boolean;
  positions: string[]; // the person's position names (for the "no access" screen)
};

// PINs are universal and unique across people (the Tip Entry kiosk relies on
// this too), so the PIN alone says who is typing. Scans every holder in
// parallel — same approach as the launcher's identifyKioskActor.
export async function identifyByPin(pin: unknown): Promise<string | null> {
  if (!isValidPinFormat(pin)) return null;
  const rows = await prisma.$queryRaw<{ person_id: string; pin_hash: string }[]>`
    select person_id::text as person_id, pin_hash from public.person_pins where pin_hash is not null`;
  const hits = await Promise.all(rows.map(async (r) => ((await verifyPinAsync(pin, r.pin_hash)) ? r.person_id : null)));
  const found = hits.filter((h): h is string => h !== null);
  return found.length === 1 ? found[0] : null; // 0 = nobody; 2+ should never happen (PINs are unique)
}

// People who may open the Recipe Book but have no PIN yet (first-time setup,
// same as the count page's "create your PIN"). Same rule as checkAccess.
export async function listAllowedWithoutPin(): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.$queryRaw<{ id: string; full_name: string | null }[]>`
    select p.id::text as id, p.full_name
    from public.profiles p
    left join public.person_pins pin on pin.person_id = p.id
    where (pin.pin_hash is null)
      and (
        p.role = 'owner'
        or (p.active = true and p.role in ('manager', 'supervisor'))
        or (p.active = true and exists (
          select 1 from public.profile_positions pp
          join beverage.position_recipe_access pra on pra.position_id = pp.position_id and pra.enabled
          where pp.user_id = p.id))
      )
    order by p.full_name`;
  return rows.filter((r) => (r.full_name || "").trim()).map((r) => ({ id: r.id, name: (r.full_name || "").trim() }));
}

function normRole(role: string | null): StaffRole {
  return role === "owner" || role === "manager" || role === "supervisor" ? role : "staff";
}

export async function checkAccess(personId: string): Promise<AccessCheck | null> {
  const rows = await prisma.$queryRaw<
    { id: string; full_name: string | null; role: string | null; active: boolean | null; positions: string[] | null; ticked: boolean }[]
  >`
    select p.id::text as id, p.full_name, p.role, p.active,
      array_remove(array_agg(pos.name order by pos.sort_order, pos.name), null) as positions,
      coalesce(bool_or(pra.enabled), false) as ticked
    from public.profiles p
    left join public.profile_positions pp on pp.user_id = p.id
    left join public.positions pos on pos.id = pp.position_id
    left join beverage.position_recipe_access pra on pra.position_id = pp.position_id
    where p.id = ${personId}::uuid
    group by p.id`;
  const r = rows[0];
  if (!r) return null;
  const role = normRole(r.role);
  const active = r.active === true;
  const allowed = role === "owner" || (active && (role === "manager" || role === "supervisor" || r.ticked));
  return {
    personId: r.id,
    name: (r.full_name || "").trim() || "Team member",
    role,
    allowed,
    positions: r.positions ?? [],
  };
}
