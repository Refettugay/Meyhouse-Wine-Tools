# TODO List

## Pending Tasks

### 1. House-Made Bar Ingredients Cleanup
- Remove Cinnamon Syrup, Cucumber Juice, Sage Tea Syrup, Ginger Syrup, Simple Syrup from Products list
- Create them as sub-recipes under Recipes → House-Made Bar Ingredients
- Add raw ingredients (cucumbers, sugar, cinnamon sticks, fresh ginger, loose sage tea) as Products under "Bar Prep Ingredients" category
- Build a Prep List view where prep staff can see par levels for house-made items and make accordingly

### 2. Prep List for Team Members
- Staff can view house-made items with par levels
- Shows what needs to be prepped today based on stock vs par
- Tied to sub-recipe system (shows recipe instructions)

### 3. Toast POS Integration
- User needs to create new API credentials in Toast (separate from existing ones)
- Build Settings → Integrations → Toast page
- Add SalesData, POSMapping tables to schema
- Connect to Toast API for sales data, menu items
- Populate Theoretical column in Inventory mode

### 4. Dashboard Redesign (R365-style)
- Tile grid for quick actions
- Location selector in top bar
- "Yesterday / Week to Date" sales cards (needs POS)
- Logbook / Manager notes

### 5. Sidebar Hover Flyout with Sub-menus
- Group sidebar items with nested sub-items on hover (R365 style)

### 6. Pricing Mode
- Build the Pricing tab in unified Products page
- Inline menu price editing
- Cost analysis with color coding

### 7. Invoice Scanning
- Multiple ways to input invoices
- Auto-update product costs from scanned invoices
- Verify vendor item numbers, sizes, prices

### 8. Multi-location Ordering Toggle
- Settings option: single vs multi-location ordering mode
- Single: each store orders independently
- Multi: one person orders for all stores, merged view

### 9. Shelf Label Creator in Settings
- Build UI in Settings → Lookup Values for managing shelf labels
- Same pattern as bottle sizes and case sizes

### 10. Mobile cross-tool switch
- SophraRail is `hidden sm:flex` (76px rail collapses on <640px screens)
- On mobile users have no way to jump between Beverage and Schedule
- Schedule has the same gap; fix once for both apps
- Options: hamburger menu in top bar, or a small floating tool-switcher

### 11. Local dev .env Postgres password refresh
- `.env` DATABASE_URL has a stale Supabase Postgres password
- Local `npm run dev` boots, but `/dashboard` throws PrismaClientKnownRequestError on first DB query
- Get fresh password from Supabase project `rcigqnzxikslmswszqvo` settings → Database
- Production isn't affected; this only blocks local development
