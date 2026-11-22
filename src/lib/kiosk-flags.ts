// Kiosk press-and-hold item menu + "Coming off menu" look (2026-11-03).
//
// ON  = items marked to remove (any of: phasing out / → DB / → ✕) show light
//       red with "Coming off menu · don't reorder" and never go to the Order
//       Cart; press-and-hold opens the side panel (mark/unmark for managers,
//       supervisors and owners; par, area + shelf, note for everyone), every
//       change logged. The kiosk refreshes itself every 30s.
// OFF = the kiosk exactly as before (bottom-sheet remove menu, no red look).
//
// ON by default. To turn it OFF: Vercel → meyhouse-wine-tools → Settings →
// Environment Variables → NEXT_PUBLIC_KIOSK_ITEM_MENU = "off" (Production) →
// Redeploy — or change the line below to `false` and push.
export const KIOSK_ITEM_MENU = process.env.NEXT_PUBLIC_KIOSK_ITEM_MENU !== "off";

// Kiosk swipe actions (2026-11-21): swipe right = "Check other areas" (amber,
// pinned to the top, cleared by entering a count / Remove flag / 4:00 AM reset);
// swipe left = "Mark 86" (people with "Can mark 86" only; shows in the Order
// Cart's "86'd at this store"; cleared by sending a count of 0 or Un-86). The
// same actions sit at the top of the press-and-hold menu.
// ON by default. To turn it OFF: Vercel → meyhouse-wine-tools → Settings →
// Environment Variables → NEXT_PUBLIC_KIOSK_SWIPE_ACTIONS = "off" (Production)
// → Redeploy — or change the line below to `false` and push.
export const KIOSK_SWIPE_ACTIONS = process.env.NEXT_PUBLIC_KIOSK_SWIPE_ACTIONS !== "off";
