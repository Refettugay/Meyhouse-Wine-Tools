# TODO List

_Status audited against codebase 2026-07-12._

## Pending Tasks

### 1. House-Made Bar Ingredients Cleanup — PARTIAL
- [DONE] Sub-recipe system built: schema (`Recipe.isSubRecipe`, `Ingredient.isHouseMade`/`subRecipeId`), routes (`/dashboard/recipes/sub-recipe/...`), forms/actions
- [TODO] Remove Cinnamon Syrup, Cucumber Juice, Sage Tea Syrup, Ginger Syrup, Simple Syrup from Products list and create as sub-recipes
- [TODO] Add raw ingredients (cucumbers, sugar, cinnamon sticks, fresh ginger, loose sage tea) as Products under "Bar Prep Ingredients" category
- [TODO] Build a Prep List view where prep staff can see par levels for house-made items and make accordingly (see #2)

### 2. Prep List for Team Members — NOT STARTED
- Staff can view house-made items with par levels
- Shows what needs to be prepped today based on stock vs par
- Tied to sub-recipe system (shows recipe instructions)

### 3. Toast POS Integration — PARTIAL
- [DONE] Schema tables exist (`SalesSnapshot`/`SalesItemSale`/`SalesMenuGroupSale`, `source` supports "TOAST_API"); manual CSV/PMIX upload works (`sales-upload.tsx`)
- [DONE] Populate Theoretical column in Inventory mode — deployed 2026-07-14 (prompt `docs/18`). Computes depletion from matched recipe sales + direct hard-liquor pours. Ships with the safe `periodStart >= lastCountedAt` cutoff, so it reads 0.00 until a sales snapshot whose period starts on/after a count date is uploaded (current Jan–Jun blob predates the Apr 14 counts).
- [DONE] Pour-size parser fix — deployed 2026-07-14 (prompt `docs/19`). Real POS labels are "Half Bottle" (350ml) / "Full Bottle" (700ml), not "350ml"/"700ml"; single/double now case-insensitive; single=2oz(59.15ml), double=4oz(118.3ml). Parsing scoped to `productType = "SPIRIT"` so beer ("Double IPA"/"Efes") can't false-match. Validated against real PMIX (Yeni Raki Ala ≈ 26 bottles/6mo) and confirmed via DB that all rakı brands are classified SPIRIT.
  - [TODO follow-up] Sub-recipe expansion — house-made items are leaf-treated (`// TODO: expand sub-recipes`)
  - [TODO follow-up] Transfers and waste still flat at 0 in the variance row
  - [TODO follow-up] Align sales uploads to count cycles so theoretical actually populates on the live report (this is the key unlock — no prompt written yet)
  - [KNOWN/minor] Pre-existing non-spirit path applies ×2 on "double" in wine/beer names; moot for theoretical (SPIRIT-scoped), left as-is
- [TODO] User needs to create new API credentials in Toast (separate from existing ones)
- [TODO] Build Settings → Integrations → Toast page
- [TODO] Connect to Toast API for sales data, menu items (currently CSV-only)

### 4. Dashboard Redesign (R365-style) — PARTIAL
- [DONE] Basic tile grid with stat cards + quick actions (`/dashboard/page.tsx`)
- [TODO] Location selector in top bar
- [TODO] "Yesterday / Week to Date" sales cards (needs POS)
- [TODO] Logbook / Manager notes

### 5. Sidebar Hover Flyout with Sub-menus — NOT STARTED
- Group sidebar items with nested sub-items on hover (R365 style)
- Current `sophra-rail.tsx` is a flat icon rail

### 6. Pricing Mode — PARTIAL
- [DONE] Pricing tab exists in unified Products page; Pricing Hub with per-category tabs and `IngredientPrice` model (pour sizes, menu price, cost target %)
- [TODO] Confirm/finish inline menu price editing in the Products page pricing mode
- [TODO] Confirm/finish cost analysis with color coding in that view

### 7. Invoice Scanning — NOT STARTED
- Multiple ways to input invoices
- Auto-update product costs from scanned invoices
- Verify vendor item numbers, sizes, prices

### 8. Multi-location Ordering Toggle — DEPLOYING (2026-07-13)
- [DONE] Merged order view works (`/dashboard/inventory/orders/merged`, `merged-order-view.tsx`); `Organization.useMergedOrderCart` flag in schema
- [DONE] Single/Multiple Locations segmented control added to the ordering toolbar (next to Email Approved Orders) via Code Mode prompt `docs/16 — Ordering Mode Toggle...`; pushed to `main` → Vercel
- [VERIFY] Once live: switch modes on the ordering screen, confirm cart relabels + persists after reload. Then move this item to Completed.

### 9. Shelf Label Creator in Settings — NOT STARTED
- Schema field `Organization.settingsShelfLabels` exists, but no UI
- Build UI in Settings → Lookup Values for managing shelf labels
- Same pattern as bottle sizes and case sizes

### 10. Position-Specific Opening & Closing Duties — NOT STARTED
- Duties lists tied to position/role (bartender, server, host, kitchen, etc.)
- Interactive checklist for each shift (opening / closing)
- Track completion (who checked off what, timestamp)
- Manager view to see status across positions

### 11. Local dev .env Postgres password refresh — CAN'T VERIFY FROM CODE
- `.env` DATABASE_URL has a stale Supabase Postgres password
- Local `npm run dev` boots, but `/dashboard` throws PrismaClientKnownRequestError on first DB query
- Get fresh password from Supabase project `rcigqnzxikslmswszqvo` settings → Database
- Production isn't affected; this only blocks local development

## Completed

### Mobile cross-tool switch — DONE (2026-07-12 audit)
- `MobileToolSwitcher` implemented (`mobile-tool-switcher.tsx`): dropdown pill in top bar with Home, Schedule, Beverage, Tips, Team
- `SophraRail` correctly hides on mobile via `hidden sm:flex`; switcher shows via `sm:hidden`
- Lets users jump between Beverage and Schedule on mobile
