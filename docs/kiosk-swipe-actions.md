# Kiosk: swipe right "Check other areas", swipe left "Mark 86" (2026-11-21)

Staff Ordering kiosk (Count screen, `/count/<token>`), beverage.runsophra.com.

## What it does

**Swipe right** on an item row: **"Check other areas"** (amber). Swipe again: **"Remove flag"**.
- The row turns light amber with a 4px amber left edge. A tag under the name says where else to look:
  - in an Area tab: the item's *other* area ("Check other areas · Liquor Room · Shelf 4")
  - in All, Type or search: both areas
  - if the item has only one area: just "Check other areas"
- Who flagged it and when, in small text.
- Flagged items are pinned to the top of whatever tab or search is showing, under an amber bar, "Check other areas (3)". Tapping the bar opens a **checklist** of just those items in walking order (area, then shelf), each with its count box.
- The flag ends as soon as a count is entered for the item (any number, 0 too, on any device at the store). An item counted while pinned stays in place, no longer amber, until the tab or search changes, so it doesn't jump away mid-count.
- **Send to manager** with flags still open shows: "N items still flagged to check other areas. Send anyway?" (Send anyway / Go back).
- **Nightly reset:** flags still open at **4:00 AM Pacific** clear automatically. This happens the next time any device at the store loads the list, and the log entry is dated 4:00 AM.

**Swipe left** on an item row: **"Mark 86"** (dark red). Swipe again: **"Un-86"**. Only people with **"Can mark 86"** get this swipe.
- The row turns light grey with a solid dark red **86** badge next to the name and "86 · who · when" under it. The item can still be counted.
- An item marked to be removed ("Coming off menu") can't be 86'd.
- **Admin Order Cart:** a new top section, **"86'd at this store"**, shows each item with its store, who marked it, and when. Nothing is added to the cart automatically.
- **Clearing (Refet's rule):** the 86 clears when a count of **0** for that item is **sent** with Send to manager ("cleared by count sent" in the log). The confirm screen warns "86 clears when sent: …". A count that's typed but not sent doesn't clear it. A failed send doesn't clear it (the clear runs inside the send's database transaction). The nightly reset never clears an 86. **Un-86** clears it by hand. The rule lives in one function, `should86ClearOnSend()` in `src/lib/kiosk-item-flags.ts`.

**Press and hold** (the existing item panel): the same actions sit at the top: Check other areas / Remove flag, and Mark 86 / Un-86. People without "Can mark 86" see it greyed with a lock and "Not allowed".

**Gestures:**
- Only a clearly sideways drag counts. Mostly-vertical drags are left to page scrolling (`touch-action: pan-y` on rows).
- A tap, the −/+ buttons, the count box, CS/BTL and press-and-hold work as before.
- A drag must travel 72px to trigger. Drags starting on a button or the count box are ignored, and so are drags starting within 20px of the left screen edge (iPhone Back gesture).
- The list has `overscroll-behavior-x: none`.

**Shared per store:** flags are stored per store item, so every device at that store sees them on its next refresh (every 30s, or when the screen comes back on). Another store never sees them.

**Log:** every flag, clear, 86, Un-86, auto-clear and clear-by-send goes into `OrderActivityLog` (`entity = FLAG`, `source = staff_count`) with who, the item, the store and the time. Actions: `check_flag`, `check_clear`, `check_cleared_by_count`, `check_auto_clear`, `eighty_six`, `un_eighty_six`, `eighty_six_cleared_by_send`. If two people clear the same flag at once, the first wins and the log keeps both ("already cleared by someone else"). Permission changes are logged as `entity = PERMISSION`.

## Admin: Settings → Kiosk permissions

`/dashboard/settings/kiosk-permissions` lists everyone with "Staff ordering" switched on (Team app), with a **Can mark 86** switch each. If no choice has been saved for a person, their role decides: owners, managers and supervisors are on, everyone else is off. Only owners, admins and managers can change the switches. **The server checks this on every kiosk request**, so a forced request from someone without it is rejected.

## Files

- `src/lib/kiosk-flags.ts`: the flag `KIOSK_SWIPE_ACTIONS`.
- `src/lib/kiosk-item-flags.ts`: flag store, 86 rule, permission check, 4:00 AM reset.
- `src/app/count/[token]/actions.ts`: `flagItem`, `countEntered`, feed fields, `canMark86` on sign-in check, 86 clear inside `sendCounts`.
- `src/app/count/[token]/staff-count-app.tsx`: swipe gesture, row looks, pinned bar, checklist, send warning, panel actions.
- `src/lib/staff-count/feed-types.ts`: `check`, `eightySix`, `me.canMark86`.
- `src/lib/order-cart.ts`, `src/lib/order-cart-types.ts`, `src/components/product/order-cart-drawer.tsx`: the "86'd at this store" section.
- `src/lib/actions/kiosk-permissions.ts`, `src/app/dashboard/settings/kiosk-permissions/page.tsx`, `src/components/settings/kiosk-permissions-list.tsx`, `src/app/dashboard/settings/page.tsx`: the Admin page.

## Migration

`prisma/migrations/20261121000000_kiosk_swipe_flags`: two **new** tables, `beverage."KioskItemFlag"` and `beverage."KioskPermission"`. No existing table or column is changed, so no backup is needed.
- Rollback (turn the flag off first): `drop table if exists beverage."KioskItemFlag"; drop table if exists beverage."KioskPermission";`

## Flag

`NEXT_PUBLIC_KIOSK_SWIPE_ACTIONS`, **on by default**. To turn it off:
- Vercel → meyhouse-wine-tools → Settings → Environment Variables → `NEXT_PUBLIC_KIOSK_SWIPE_ACTIONS` = `off` (Production) → Redeploy, or
- set the line in `src/lib/kiosk-flags.ts` to `false` and push.

With the flag off, the kiosk, the Order Cart and Settings look and work exactly as before. Saved flags stay in the database, unused.

## Tests

- **Server actions** against a local throwaway database (`_claude_tmp/kiosktest/swipe.test.ts`, not committed): 47/47 pass with the Order Cart flow, 46/46 with the old order flow. They cover:
  - who can 86; a forced request rejected
  - flags shared per store and never at another store
  - a count ends the flag; Remove flag
  - two clears at once: first wins, both logged
  - an item coming off the menu can't be 86'd
  - the Order Cart section
  - 86 + Check together; moving the shelf keeps the flags
  - count 0 typed but not sent → still 86; count 2 sent → still 86; failed send → still 86; count 0 sent → cleared and logged
  - Un-86
  - Admin permission switches, applied at once
  - 4:00 AM reset (PST and PDT): Check cleared and logged at 4:00 AM, 86 kept, no double logging
- **Earlier kiosk suite:** 39/39 pass.
- **Ordering suite:** couldn't finish on the new local test database (connection refused partway). The same happens with this feature off, at a step this change doesn't touch.
- **Clicked through** on a local copy at phone size:
  - swipe right → amber, pinned with the right tag; swipe left → 86 badge
  - a vertical drag, a tap, and a drag from the screen edge do nothing
  - checklist in walking order; a count there ends the flag
  - Send warning lists open flags; confirm shows "86 clears when sent"; sending reports "1 86 cleared"
  - press-and-hold panel shows the new actions
- **Still to check by hand:** a real iPhone (Safari) and iPad: swipe feel, no Back navigation, scrolling.
