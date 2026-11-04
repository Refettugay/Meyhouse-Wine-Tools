// Ordering flow switch (2026-11-03).
//
// ON  = new flow: kiosk + desktop → shared Order Cart → Approve → Approved
//       orders → Order history; 8-week column reads order_history_entry.
//       "Review & approve" / "Ready to email" hidden.
// OFF = old flow, exactly as before (kiosk → Review & approve → Ready to email).
//
// Turned on by the Vercel env var NEXT_PUBLIC_ORDER_CART_FLOW = "on" (then
// Redeploy — NEXT_PUBLIC_ values are baked in at build time). Missing or any
// other value = OFF. No database change is needed to flip either way.
export const ORDER_CART_FLOW = process.env.NEXT_PUBLIC_ORDER_CART_FLOW === "on";
