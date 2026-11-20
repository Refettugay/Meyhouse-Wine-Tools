# Admin items: one-panel Area / Shelf picker + bulk set location

Shipped 2026-11-19. Flag: `NEXT_PUBLIC_ADMIN_AREA_PICKER` — **on** unless set to `off`.

## What it does
- **Products table, one store picked in the Location filter:** clicking any of Area 1 / Shelf 1 / Area 2 / Shelf 2 opens one panel next to that cell.
  - Every area for that store as a checkbox list (same order as Settings → Storage areas).
  - Tick up to 2. The first ticked is Area 1, the second is Area 2. Unticking Area 1 moves the other up.
  - Each ticked area gets a free-text Shelf box (max 12 characters). The cursor jumps there right after ticking.
  - **Done** (or Enter in a Shelf box) saves all four fields at once. **Clear** unticks all. Esc, clicking outside or ✕ closes without saving.
  - An area on the item that isn't in the store's list any more shows ticked with "(removed)", so it can be unticked. It is never dropped silently.
  - If the save fails, the panel stays open with what you typed and shows the error.
- **"Set location for selected (N)"** above the table uses the row checkboxes. It opens the same panel, empty. Done **overwrites** all four fields on every selected product at the picked store (Clear + Done clears them), then shows "Updated N products" and unticks the rows.
- With "All stores" picked, the cells still show "N stores" and can't be edited (same as before). The bulk button asks you to pick a store.

## Saving + log
- One server action, `setProductLocations` (src/lib/actions/area-picker.ts). It saves one or many products in **one transaction**, only for the picked store's rows in this org. Area ids are checked against that store's area list.
- Every real change writes an `OrderActivityLog` row: `source "admin"`, `action "admin_edit"`, `actorKind "manager"`, with who, old → new, store and time.
- **Recent kiosk changes** (and the strip under a picked row) now list these too, with a gold **Admin** tag.
- No database changes. Same four columns (`storageAreaId`, `shelfLocation`, `storageArea2Id`, `shelfLocation2`), so the kiosk, counts and ordering read them exactly as before.

## Files
- `src/lib/admin-area-picker-flag.ts` — flag + shelf max length
- `src/components/product/area-shelf-picker.tsx` — the panel (portal, stays on screen, 44px rows, 16px Shelf input)
- `src/lib/actions/area-picker.ts` — save + log
- `src/components/product/unified-products-page.tsx` — cells open the panel; bulk button
- `src/lib/kiosk-changes.ts`, `kiosk-changes-types.ts`, `kiosk-changes-strip.tsx`, `app/dashboard/kiosk-changes/page.tsx` — Admin rows in the change log

## Turning it off
Vercel → meyhouse-wine-tools → Settings → Environment Variables → `NEXT_PUBLIC_ADMIN_AREA_PICKER` = `off` (Production) → Redeploy. The old four dropdowns come back.
