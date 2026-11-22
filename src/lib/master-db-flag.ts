// Master Database (2026-11-22).
//
// Every product ever entered lives in the Master Database. A store "uses" a
// product while its InventoryItem has removedAt = null. Taking a product off a
// store sets removedAt (the row, its counts and order history are kept);
// adding it back clears it.
//
// NEXT_PUBLIC_MASTER_DATABASE:
//   "off"   (default) = Admin and Kiosk exactly as before.
//   "admin" = Admin gets the Master Database tab and the "Remove from…" pop-up;
//             Permanent Delete only in the Master Database tab (Owner / Admin /
//             General Manager). The Kiosk is unchanged.
//   "on"    = "admin" + the Kiosk: Remove only touches its own store, no
//             "Move to Database" / "Permanently delete" on the Kiosk, and an item
//             marked to remove leaves the store when a count of 0 is entered.
//
// To change it: set NEXT_PUBLIC_MASTER_DATABASE on Vercel (meyhouse-wine-tools →
// Settings → Environment Variables → Redeploy) — or change DEFAULT_MODE below
// and push. 2026-11-22: default "admin" (Refet trying it in Admin first).
const DEFAULT_MODE = "admin";
const MODE = (process.env.NEXT_PUBLIC_MASTER_DATABASE ?? DEFAULT_MODE).toLowerCase();

export const MASTER_DB_ADMIN = MODE === "admin" || MODE === "on";
export const MASTER_DB_KIOSK = MODE === "on";

/** Schedule roles that may Permanently Delete (no supervisors). */
export const PERMANENT_DELETE_ROLES = new Set(["owner", "admin", "manager"]);

export function canPermanentDelete(session: { scheduleRole?: string } | null | undefined): boolean {
  return !!session?.scheduleRole && PERMANENT_DELETE_ROLES.has(session.scheduleRole);
}
