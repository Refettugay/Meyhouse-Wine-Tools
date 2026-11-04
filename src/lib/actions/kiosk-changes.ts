"use server";

import { requireAuth } from "@/lib/session";
import { loadKioskChanges } from "@/lib/kiosk-changes";
import type { KioskChange } from "@/lib/kiosk-changes-types";

// Admin: the kiosk changes for one product (all stores), newest first.
export async function kioskChangesFor(ingredientId: string): Promise<KioskChange[]> {
  const session = await requireAuth();
  if (typeof ingredientId !== "string" || !ingredientId) return [];
  return loadKioskChanges(session.organizationId, { ingredientId, take: 20 });
}
