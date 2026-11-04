# Ordering: kiosk → Order Cart → Approved orders → Order history

Status: **Phase 1 built (local branch `ordering-approved-orders`, not deployed).** Phases 2–4 to come.

## Decisions (Refet, 2026-11-03)
- One cart per store behind the scenes; the admin sees ONE combined Order Cart with a
  store selector (multi-select, only stores they ORDER for — granted in Admin). The cart shows,
  totals and (Phase 2) approves only the selected stores. Others' stores never mix in.
- "<name> is also viewing <store>" when two people have the same store's cart open.
- Kiosk + desktop add up; repeat kiosk counts add up; cs vs btl stay separate lines.
- A person's desktop part is editable: re-typing a count changes only their part.
  Editing the qty in the cart sets the line total directly.
- Moving a line to another store keeps a transfer record ("for Palo Alto · transfer").
- 8-week history: cases (bottles ÷ pack size; no pack size → kept in bottles + flagged),
  backfilled from orders that were really approved. Backfill only after Refet sees before/after.
- Each approver has their own Approved orders list (otherwise San Ramon's approvals would
  mix into Refet's and Clear all would clear them).
- Staff kiosk notes show at the top of that store's cart (Done / Dismiss).
- Hold until next order, Undo approve and Show removed go away with the Review tab.

## What differs from the prompt, and why
- The old cart was not a list of saved lines: it was calculated in the browser from typed
  counts (+ overrides in that browser's storage), auto-saved per person as a draft that was
  overwritten on every save. A real shared cart table was needed for kiosk lines.
- Desktop counts are no longer read from the device's storage; they are rebuilt from the
  person's part of the shared cart, so a second device can't re-add lines after an approve.
- The old 8-week column summed every order line of the last 56 days (drafts and removed lines
  too) and added cases and bottles together. Replaced in Phase 3.
- DB backup: the local .env password is out of date, so pg_dump/JSON export failed. Backup is
  in-database copies (`beverage._bak_*_20261103`), see
  `C:\Sophra\_backups\2026-11-03-pre-approved-orders\README.md`.

## Flag
`src/lib/order-flags.ts` → `ORDER_CART_FLOW`. `false` = old flow (kiosk → Review & approve →
Ready to email), all old code untouched. No database change needed to flip back.

## Database (migration `20261103000000_order_cart_approved_orders`, applied 2026-11-03)
Additive only; rollback SQL at the top of the migration file.
| Table / column | Purpose |
|---|---|
| `order_cart_line` | shared cart, unique store + item + unit |
| `order_cart_source` | where each part came from (kiosk / desktop / migrated / moved_in) |
| `order_cart_presence` | "is also viewing" heartbeat |
| `approved_order` | one ACTIVE list per approver; CLEARED = Order history (Phase 2/4) |
| `order_ordered_event` | each "Ordered" tap (Phase 3) |
| `order_history_entry` | 8-week history (Phase 3) |
| `OrderList.approvedOrderId`, `OrderListItem.orderedEventId`, `OrderListItem.sourceSummary` | links |

Go-live data move: `prisma/data/20261103_move_waiting_to_cart.sql` (rollback inside).
Dry run 2026-11-03: 1 waiting order / 11 lines / 20 units → 11 cart lines / 20 units.

## Files (Phase 1)
- `src/lib/order-flags.ts` — flag
- `src/lib/order-cart.ts` — server helpers (merge rules, desktop part, loader)
- `src/lib/order-cart-types.ts` — client-safe types + source tags
- `src/lib/actions/order-cart.ts` — cart actions (qty, unit, remove, move, clear, desktop counts, presence, staff notes)
- `src/components/product/order-cart-drawer.tsx` — new cart drawer
- `src/app/count/[token]/actions.ts` — kiosk sends into the cart (`sendCountsToCart`)
- `src/components/product/unified-products-page.tsx` — wiring, old drawer/tabs hidden by flag
- `src/app/dashboard/products/page.tsx` — loads the cart
- `src/lib/actions/order-review.ts` — live-update key includes the cart

## Phase 1 test checklist
- [x] Merge rules on the live DB (rolled back): kiosk 2cs + desktop 1cs = 3cs; second kiosk +2 = 5cs; 6btl stays a separate line
- [x] In-flight move dry run: 11 lines / 20 units in = 11 lines / 20 units in the cart
- [x] typecheck, lint (no new problems), production build
- [ ] In the app (needs a working DB login or a preview deploy): kiosk count from 2 stores + desktop → one cart grouped by vendor; source tags; move between stores; viewing notice
