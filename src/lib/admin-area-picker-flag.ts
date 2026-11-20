// Admin → Beverage products: one-panel Area / Shelf picker + "Set location for
// selected" bulk button (2026-11-19).
//
// ON  = clicking Area 1 / Shelf 1 / Area 2 / Shelf 2 on a row opens one panel
//       (tick up to 2 areas, type a shelf for each, Done saves all four at
//       once). Every change is logged as an Admin change in Recent kiosk changes.
// OFF = the four separate dropdowns / text boxes exactly as before.
//
// ON by default. To turn it OFF: Vercel → meyhouse-wine-tools → Settings →
// Environment Variables → NEXT_PUBLIC_ADMIN_AREA_PICKER = "off" (Production) →
// Redeploy — or change the line below to `false` and push.
export const ADMIN_AREA_PICKER = process.env.NEXT_PUBLIC_ADMIN_AREA_PICKER !== "off";

export const ADMIN_SHELF_MAX = 12;
