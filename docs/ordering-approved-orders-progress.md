# Ordering: kiosk → Order Cart → Approved orders → Order history

Status (2026-11-03): **LIVE — new flow ON in production** (default ON in code; see "Switch").
Started clean: the old Review & approve / Ready to email / transfer rows were test data —
kept in the DB, hidden when the flow is on. The move and backfill scripts were NOT run
(and should not be).

## What the new flow does (when ON)
Tabs: **Count & build · Approved orders · Order history** (Review & approve and Ready to email hidden).
1. Staff count on the kiosk exactly as today. Every kiosk line lands in the shared Order Cart.
2. Desktop counts on Count & build land in the same cart. Same item + store + unit adds up
   (kiosk 2cs + desktop 1cs = 3cs; repeat kiosk counts add up). cs vs btl stay separate lines.
   Each line has a source tag ("Kiosk · Palo Alto · 3:12pm · Sam", "Added by you").
3. The cart header picks which of your stores it shows/approves; "<name> is also viewing
   <store>" when someone else has it open. Move to another store keeps a transfer record.
   Staff kiosk notes show at the top (Done / Dismiss).
4. **Approve** moves the selected stores' lines into **your** Approved orders and empties those
   carts (other stores untouched). Desktop counts are committed to stock (as the old Submit did).
5. Approved orders: header "Approved by · time · N of M vendors ordered", Clear all; one card
   per vendor (A→Z), store blocks inside, lines "2cs Isabey Sauvignon Blanc". **Copy** = plain
   text (vendor, store, lines). **Ordered** → card turns green, lines written to the 8-week
   history (cases, business date Pacific); **Undo** removes exactly those entries.
   Approving again adds into the same list; vendors already Ordered stay green and new lines
   show "new" with "Ordered (N new)" (Copy then copies only the new lines).
6. **Clear all** (no pop-up) → Order history (last 8 kept). View (same layout, Copy) and
   Restore (asks before replacing a list that's showing). Clearing / pruning never changes
   the 8-week history.

## Decisions (Refet, 2026-11-03)
- One cart per store behind the scenes; one combined cart with a store selector in the UI.
- Desktop part editable; repeat counts add; transfer record kept on store moves.
- 8-week history in cases; bottles ÷ case size; no case size → kept as bottles and flagged
  ("+6 btl · no case size"); backfilled from orders that really went out.
- Each approver has their own Approved orders / Order history (San Ramon never mixes in).
- Staff notes in the cart; Hold / Undo approve / Show removed go away with Review & approve.

## Different from the prompt, and why
- Old cart was calculated in the browser (not saved lines) → new shared cart table.
- Desktop counts come from your part of the shared cart, not the device's storage (a second
  device can't re-add lines after an approve).
- Old 8-week column counted every order line of 56 days (drafts, never-approved, removed lines)
  and added cases + bottles together. New column reads only Ordered history in cases.
  Week buckets now use the business date of the order (Pacific), not "7×24h since creation",
  so an entry can sit one week earlier/later than before.
- "Delete the oldest after 8": the 9th oldest is hidden (status PRUNED), not deleted, so its
  order rows and 8-week entries stay. Nothing visible differs.
- Phases 2–4 share files, so they are one commit (79862a4) rather than three.
- Backup: local .env password is out of date → in-database copies `beverage._bak_*_20261103`
  (see `C:\Sophra\_backups\2026-11-03-pre-approved-orders\README.md`). Do the JSON backup
  before turning on (see below).

## Switch
`src/lib/order-flags.ts`: `ORDER_CART_FLOW = process.env.NEXT_PUBLIC_ORDER_CART_FLOW !== "off"`
(ON unless the variable says `off`). Turn OFF: Vercel **meyhouse-wine-tools** → Settings →
Environment Variables → `NEXT_PUBLIC_ORDER_CART_FLOW` = `off` (Production) → Redeploy; or set
the line to `false` and push. (Claude's Vercel connection can't create production env vars.)

## Database
Migration `20261103000000_order_cart_approved_orders` (applied 2026-11-03, additive; rollback
SQL at top of file): `order_cart_line`, `order_cart_source`, `order_cart_presence`,
`approved_order`, `order_ordered_event`, `order_history_entry`; columns
`OrderList.approvedOrderId`, `OrderListItem.orderedEventId`, `OrderListItem.sourceSummary`.

Go-live data scripts (NOT run yet; each has its rollback at the top):
- `prisma/data/20261103_move_waiting_to_cart.sql` — Review & approve → cart; Ready to email →
  Approved orders. Dry run: 1 order / 11 lines / 20 units → 11 cart lines / 20 units;
  2 Ready-to-email orders (19 lines, all emails drafts) → 1 Approved list (Refet), 19 lines.
- `prisma/data/20261103_backfill_8week_history.sql` — dry run: 50 rows ≈ 66.9 cases,
  19 bottle rows with no case size (flagged). Safe to run twice.

## Turning it on (in order)
1. JSON backup (needs the current DB password, see below).
2. Vercel → meyhouse-wine-tools → Settings → Environment Variables → add
   `NEXT_PUBLIC_ORDER_CART_FLOW` = `on` (Production) → Deployments → latest → Redeploy.
3. Supabase → SQL editor → run `20261103_move_waiting_to_cart.sql`.
4. Supabase → SQL editor → run `20261103_backfill_8week_history.sql`.
Turning off: set the variable to `off` (or delete it) → Redeploy. Optionally run the rollback
lines at the top of the two data scripts to put the waiting orders back in Review & approve.

## Files
- `src/lib/order-flags.ts` — switch
- `src/lib/order-cart.ts` — server helpers: merge rules, desktop part, cart + approved loaders
- `src/lib/order-cart-types.ts` — client-safe types, source tags, vendor grouping, Copy text
- `src/lib/order-history.ts` — 8-week history reader
- `src/lib/actions/order-cart.ts` — cart actions
- `src/lib/actions/approved-orders.ts` — Approve, Ordered/Undo, Clear all, Restore
- `src/components/product/order-cart-drawer.tsx` — new cart
- `src/components/product/approved-orders-panel.tsx` — Approved orders + Order history tabs
- `src/app/count/[token]/actions.ts` — kiosk → cart
- `src/components/product/unified-products-page.tsx`, `src/app/dashboard/products/page.tsx`,
  `src/lib/actions/order-review.ts` — wiring (all behind the switch)

## Tests (2026-11-03)
Real server actions run against a throwaway local Postgres (PGlite) with the full app schema;
only login and page refresh faked. **42 / 42 passed**:
- Phase 1: kiosk+desktop merge (3cs), repeat kiosk adds (5cs), re-typed desktop count changes only
  my part, cs/btl separate, move-to-store merge + transfer, unit-switch merge, qty 0 removed,
  "is also viewing", San Ramon isolation both ways.
- Phase 2: double approve → once; carts emptied only for selected stores; approved_by; desktop
  count → stock; Transfers record; source summary; vendors A→Z; re-approve merges; Copy text
  `KALARA / Palo Alto / 9cs Isabey Sauvignon Blanc / Sunnyvale / 1cs Bomonti / 1cs Isabey…`.
- Phase 3: double-tap Ordered → one write; history rows; no-pack bottles kept + flagged; business
  date Pacific; column reads new entries immediately; new line after Ordered = not ordered;
  6btl of 12/cs = 0.5cs; Undo removes exactly that vendor's entries.
- Phase 4: Clear all → history, 8-week untouched; Restore asks / replaces / keeps green states;
  10 clears → 8 kept; pruning leaves history unchanged.
Also: typecheck, lint (no new problems; the page's 18 old `any` errors unchanged), production
build with the switch OFF and ON. Not done: clicking through in a browser (no local DB login).
