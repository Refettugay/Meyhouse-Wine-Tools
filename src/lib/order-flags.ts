// Ordering flow switch (2026-11-03).
// true  = new flow: kiosk + desktop → shared Order Cart → Approve → Approved
//         orders → Order history. "Review & approve" / "Ready to email" hidden.
// false = old flow (kiosk → Review & approve → Ready to email), code untouched.
// Flip back to false to roll back the UI + kiosk without a database change.
export const ORDER_CART_FLOW = true;
