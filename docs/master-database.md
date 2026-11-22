# Master Database

**Built:** 2026-11-22 · **Switch:** `NEXT_PUBLIC_MASTER_DATABASE` (`off` · `admin` · `on` = current default in code)

## The idea
Every product ever entered lives in the **Master Database**. A restaurant *uses* a
product while its store record (`InventoryItem`) has `removedAt = null`.
Removing a product from a restaurant sets `removedAt`; the row, its counts and
order history stay. Adding it back clears `removedAt` (areas, shelf, par come back).

## Database (applied to live 2026-11-22, additive only)
`prisma/migrations/20261122000000_master_database/migration.sql`
- `InventoryItem.removedAt`, `InventoryItem.removedByName`
- `Ingredient.archivedAt`, `Ingredient.deletedAt`

## Where the code is
| What | File |
|---|---|
| Switch + who may Permanent Delete | `src/lib/master-db-flag.ts` |
| Add / remove / count-0 helpers (`ACTIVE_LINK`) | `src/lib/store-links.ts` |
| Admin actions (remove, add back, archive, delete, duplicate check) | `src/lib/actions/master-database.ts` |
| Master Database tab | `src/components/product/master-database-tab.tsx` |
| "Remove from…" pop-up | `src/components/product/remove-from-stores-dialog.tsx` |
| Duplicate hint on the new-product form | `src/components/product/similar-products-hint.tsx` |

**Rule for new code:** any query that lists a store's items must add
`...ACTIVE_LINK` (or `removedAt: null`) to its `where`.

## Switch levels
- **off:** looks the same as before. Behind the scenes, removing a store from a
  product (edit form untick, bulk remove, legacy location page) now keeps the
  row instead of deleting it.
- **admin:** Master Database tab; "Remove from…" pop-up (which restaurants + now /
  when it runs out); Inventory tab shows only items a restaurant uses; Permanent
  Delete only in the Master Database tab for Owner / Admin / General Manager
  (`scheduleRole` owner/admin/manager — not supervisors); duplicate check on new products.
- **on:** admin + Kiosk: "Move to Database" and "Permanently Delete" gone; "Remove
  from this store now" (managers/supervisors, own store only); an item marked to
  remove leaves the store when a count of 0 is sent (Kiosk and Admin Count).

## Permanent Delete
- Never counted / ordered → really deleted (`hardDeleteIngredient`).
- Has history → `isActive = false`, `deletedAt` set, off every store. Hidden
  everywhere; past orders and counts still show it.

## Not done (later)
Recipe Master + Recipe Kiosk (recipes linked to Master Database products,
per-restaurant versions, "used in a recipe" warning on remove).
