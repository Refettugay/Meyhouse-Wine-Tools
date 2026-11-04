# Kiosk: "Coming off menu" look + press-and-hold item menu (2026-11-03)

Staff Ordering kiosk (Count screen, `/count/<token>`), beverage.runsophra.com.

## What it does

**Coming off menu.** An item with *any* removal mark for this store (Admin "phasing out", "→ DB" or "→ ✕", or the kiosk's own "Mark to remove") shows a light red row with **"Coming off menu · don't reorder"** under the name, in every view: area tabs, All, Type and search. It can still be counted (the count is saved), but it is never ordered: the kiosk shows "Counted · not reordered", the "to order" total leaves it out, and the server never adds it to the Order Cart. Undo the mark and it goes back to normal right away.

**Press and hold** an item row (about 0.5 s, on a phone or with a mouse) and a panel slides in from the right. A normal tap, scrolling, or the −/+/count/CS/BTL buttons never open it. To close it, tap ✕ or outside the panel.

| Action | Who | Notes |
|---|---|---|
| Mark to remove / Undo remove mark | Managers, supervisors, owners (`public.profiles.role`) | Everyone else sees it greyed with a lock: "Managers and supervisors only". **The server checks it too**, and the role is read fresh on every request. Mark sets the same flag Admin uses (`PENDING`, "⏳ phasing out"); Undo clears any of the three marks. This store only. |
| Change par | Anyone signed in | Stepper + Save. Par is in bottles (kegs for kegs), the same unit staff count in. 0 is allowed. This store only. |
| Change location & shelf | Anyone | One screen: Area 1 + Shelf 1, Area 2 + Shelf 2. Areas are picked from this store's areas; Area 2 can be "—". Shelf is free text (max 20). The item moves to its new tab at once, and a count already typed is kept. |
| Note | Anyone | Free text (max 140). Shows as a yellow tag under the name for everyone, and in Admin. An empty note means no tag. |
| Move to Product Database / Permanently Delete | Anyone (unchanged, Refet's choice) | Same as before. |

**Log.** Every change goes into `OrderActivityLog` with: who (the kiosk person), the field, old → new, the store, and the time (`source = staff_count`, `entity = PRODUCT`, `action = kiosk_edit` / `mark_to_remove` / `cancel_phase_out`). Only fields that really changed are written. If two people edit the same field, the last save wins, and the log keeps both edits.

**Admin.**
- On Beverage → Products, a product row shows its kiosk note as a yellow tag.
- Clicking a row shows a "Kiosk · <product>" strip: notes per store plus the last 20 kiosk changes.
- **Recent kiosk changes** (`/dashboard/kiosk-changes`, linked from the strip) lists the last 200, in Pacific time.
- The Products view refreshes itself within about 15 s of a kiosk change.

**Other devices.** The kiosk reloads its list every 30 s and whenever the screen comes back on. Typed counts are kept.

## Files

- `src/lib/kiosk-flags.ts`: the flag.
- `src/app/count/[token]/actions.ts`: role on sign-in check (`canMarkRemove`), server-side mark check, `updateItem`, feed fields, removal-marked items skipped when sending.
- `src/app/count/[token]/staff-count-app.tsx`: red look, note tag, `ItemPanel`, 30 s refresh.
- `src/lib/staff-count/feed-types.ts`: `CountItem` fields, `ItemEdit`.
- `src/lib/kiosk-changes.ts`, `src/lib/kiosk-changes-types.ts`, `src/lib/actions/kiosk-changes.ts`: the Admin log.
- `src/components/product/kiosk-changes-strip.tsx`, `src/app/dashboard/kiosk-changes/page.tsx`: the Admin screens.
- `src/components/product/unified-products-page.tsx`, `src/app/dashboard/products/page.tsx`: note tag, strip, Products live refresh.
- `src/lib/actions/order-review.ts`: `orderingPulse` also returns `kioskKey`.

## Migration

`prisma/migrations/20261104000000_kiosk_item_note`: adds the nullable column `InventoryItem."kioskNote"`. **Applied to live on 2026-11-03** (via Supabase MCP, as `kiosk_item_note`).
- Backup taken first: `beverage."_bak_InventoryItem_20261103_kiosk"` (858 rows). README: `C:\Sophra\_backups\2026-11-03-kiosk-item-menu\README.md`.
- Rollback: `alter table beverage."InventoryItem" drop column if exists "kioskNote";` Turn the flag off first.

## Flag

`NEXT_PUBLIC_KIOSK_ITEM_MENU`, **on by default**. To turn it off:
- Vercel → meyhouse-wine-tools → Settings → Environment Variables → `NEXT_PUBLIC_KIOSK_ITEM_MENU` = `off` (Production) → Redeploy, or
- set the line in `src/lib/kiosk-flags.ts` to `false` and push.

With the flag off, the kiosk works exactly as before: the old bottom-sheet menu and no red look.

## Tests

- **Server actions** against a local test database (the scratch harness in `_claude_tmp/kiosktest`, not committed): 39/39 pass.
  - Admin-marked item: red, countable, never sent to the cart.
  - Staff mark/unmark rejected by the server; supervisor allowed; demoting someone applies at once.
  - Par, area, shelf and note change this store only; another store's area is rejected; Area 1 can't be emptied.
  - Old → new log entries with the person's name and the store; last save wins.
- **Ordering regression suite:** 42/42 pass.
- **Clicked through in a browser** on a local copy:
  - hold opens the panel; a tap or a scroll doesn't
  - −/+ still work
  - moving an item's area keeps its count
  - par 0 and notes work
  - a "coming off" item is left out of "to order"
- **Still to check by hand:** a real iPhone and iPad (Safari long-press).
