// Per-person store scope for Ordering (table beverage."OrderingStoreScope").
//
//   ORDER — this person builds/sends orders for the store.
//   VIEW  — this person can see the store but not order for it
//           (e.g. San Ramon for Refet: "Ordered by Sarper Oztemiz · view only").
//
// A person with NO scope rows sees every store as VIEW (decided 2026-09-28):
// managers/supervisors keep visibility without being able to place orders
// until someone assigns them stores. Server-only — always enforced in the
// server actions too, never trust the client's copy.

import { prisma } from "./db";
import { createClient } from "./supabase/server";

export type StoreAccess = "ORDER" | "VIEW";

export type OrderingScope = {
  // locationId → this person's access
  access: Record<string, StoreAccess>;
  // locationId → names of OTHER people who order for that store
  orderedBy: Record<string, string[]>;
};

export async function getOrderingScope(userId: string, orgId: string): Promise<OrderingScope> {
  const [locations, rows] = await Promise.all([
    prisma.location.findMany({ where: { organizationId: orgId }, select: { id: true } }),
    prisma.orderingStoreScope.findMany({
      where: { location: { organizationId: orgId } },
      select: { profileId: true, locationId: true, access: true },
    }),
  ]);

  const mine = rows.filter((r) => r.profileId === userId);
  const access: Record<string, StoreAccess> = {};
  for (const loc of locations) {
    const row = mine.find((r) => r.locationId === loc.id);
    access[loc.id] = row?.access === "ORDER" ? "ORDER" : "VIEW";
  }

  // Names of the other people who order each store (for the "view only" label).
  const otherOrderers = rows.filter((r) => r.access === "ORDER" && r.profileId !== userId);
  const names = new Map<string, string>();
  if (otherOrderers.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...new Set(otherOrderers.map((r) => r.profileId))]);
    for (const p of (data ?? []) as { id: string; full_name: string | null }[]) {
      names.set(p.id, p.full_name || "another manager");
    }
  }
  const orderedBy: Record<string, string[]> = {};
  for (const r of otherOrderers) {
    (orderedBy[r.locationId] ??= []).push(names.get(r.profileId) || "another manager");
  }

  return { access, orderedBy };
}

// True when this person may build/send orders for the store.
export async function canOrderForStore(userId: string, locationId: string): Promise<boolean> {
  const row = await prisma.orderingStoreScope.findUnique({
    where: { profileId_locationId: { profileId: userId, locationId } },
    select: { access: true },
  });
  return row?.access === "ORDER";
}
