// Ordering flow switch (2026-11-03).
//
// ON  = new flow: kiosk + desktop → shared Order Cart → Approve → Approved
//       orders → Order history; 8-week column reads order_history_entry.
//       "Review & approve" / "Ready to email" hidden.
// OFF = old flow, exactly as before (kiosk → Review & approve → Ready to email).
//
// ON by default since 2026-11-03 (Refet: go live). To turn it OFF either:
//   * Vercel → meyhouse-wine-tools → Settings → Environment Variables →
//     NEXT_PUBLIC_ORDER_CART_FLOW = "off" (Production) → Redeploy, or
//   * change the line below to `false` and push.
// NEXT_PUBLIC_ values are baked in at build time, so a redeploy is needed.
// No database change is needed to flip either way.
export const ORDER_CART_FLOW = process.env.NEXT_PUBLIC_ORDER_CART_FLOW !== "off";
