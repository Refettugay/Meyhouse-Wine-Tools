# Item search: ignores apostrophes, quotes, accents and punctuation

**Shipped:** 2026-11-21

## Why
iPhone "Smart Punctuation" types `’` instead of `'` (and `“ ”`, `– —`).
Items are saved with the straight `'`, so searching `O’Shaunghnessy` on an
iPhone showed "No items match".

## The helper
`src/lib/search-normalize.ts`

- `normalizeForSearch(text)` — lowercase, strip accents (é→e, ñ→n, ß→ss, ø→o…),
  remove all apostrophes/quote marks (straight and curly), turn `- – — . , / &`
  into spaces, collapse spaces.
- `searchMatcher(query)` — returns a test function. An item matches when every
  typed word appears somewhere in its normalized text, any order. Also checked
  with spaces removed, so `saintemilion` finds "Saint-Émilion". Empty search
  matches everything.

Only the text being compared is normalized. Saved item names are never changed;
no DB column or migration.

## Screens that use it (all search the item name only, as before)
- Kiosk Count screen search — `src/app/count/[token]/staff-count-app.tsx`
  (normal list, flagged/pinned list, and the "Coming off menu" list)
- Admin items search + Order tab search — `src/components/product/unified-products-page.tsx`
- Order Review "+ Add item" search — `src/components/product/order-review-panel.tsx`

The Order Cart drawer has no search box. Other older screens (recipes, pricing
hub, vendors…) still use plain matching; switch them to `searchMatcher` if needed.

## Tests
`npm run test:search` (node test runner via tsx) — `src/lib/search-normalize.test.ts`
