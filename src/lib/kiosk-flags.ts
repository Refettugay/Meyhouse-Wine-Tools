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
