-- Staff Ordering — Phase 1 database additions (applied 2026-09-28 via Supabase).
--
-- ADDITIVE ONLY: new tables + new nullable columns. No existing column/table is
-- renamed, dropped or changed. Every new table gets RLS + the same two
-- manager-only policies as the other beverage tables (doc 13). The Beverage app
-- connects as `postgres` (bypasses RLS), so nothing in the app changes.
--
-- Undo: see rollback.sql in this folder.
-- Backup taken first: schema backup_pre_phase1_20260928 (71 tables, 13,316 rows).

-- ---------------------------------------------------------------------------
-- 1) Link each Beverage store to its Schedule store (public.locations.id).
--    Plain uuid, no FK, so Beverage never locks/blocks Schedule's table.
-- ---------------------------------------------------------------------------
ALTER TABLE beverage."Location" ADD COLUMN IF NOT EXISTS "scheduleLocationId" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS "Location_scheduleLocationId_key"
  ON beverage."Location" ("scheduleLocationId");

-- ---------------------------------------------------------------------------
-- 2) OrderCountLink — one secret staff count-page link per store
--    (like public.tip_entry_links).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beverage."OrderCountLink" (
  "locationId"    text PRIMARY KEY REFERENCES beverage."Location"(id) ON DELETE CASCADE,
  "token"         text NOT NULL UNIQUE,
  "enabled"       boolean NOT NULL DEFAULT true,
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedAt"     timestamp(3),
  "createdById"   text,
  "createdByName" text
);

-- ---------------------------------------------------------------------------
-- 3) OrderingStoreScope — which stores each person orders for (ORDER) or can
--    only see (VIEW). profileId = public.profiles.id (Supabase user id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beverage."OrderingStoreScope" (
  "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "profileId"     uuid NOT NULL,
  "locationId"    text NOT NULL REFERENCES beverage."Location"(id) ON DELETE CASCADE,
  "access"        text NOT NULL CHECK ("access" IN ('ORDER', 'VIEW')),
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"   text,
  CONSTRAINT "OrderingStoreScope_profileId_locationId_key" UNIQUE ("profileId", "locationId")
);

-- ---------------------------------------------------------------------------
-- 4) OrderList — who sent it (staff "Send to manager").
-- ---------------------------------------------------------------------------
ALTER TABLE beverage."OrderList" ADD COLUMN IF NOT EXISTS "submittedById"   text;
ALTER TABLE beverage."OrderList" ADD COLUMN IF NOT EXISTS "submittedByName" text;
ALTER TABLE beverage."OrderList" ADD COLUMN IF NOT EXISTS "source"          text;  -- 'staff' | 'manager'

-- ---------------------------------------------------------------------------
-- 5) OrderListItem — who counted, unit pick, move/transfer tracking, and a
--    snapshot of cost + case size at the time (Transfers log history).
-- ---------------------------------------------------------------------------
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "countedById"           text;
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "countedByName"         text;
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "countedAt"             timestamp(3);
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "source"                text;  -- 'staff' | 'manager'
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "unitIsStaffPick"       boolean DEFAULT false;
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "movedById"             text;
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "movedByName"           text;
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "movedAt"               timestamp(3);
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "transferStatus"        text;  -- 'PENDING' | 'TRANSFERRED'
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "transferredAt"         timestamp(3);
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "transferredById"       text;
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "transferredByName"     text;
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "unitCostCentsSnapshot" integer;
ALTER TABLE beverage."OrderListItem" ADD COLUMN IF NOT EXISTS "casePackSizeSnapshot"  integer;

-- ---------------------------------------------------------------------------
-- 6) OrderCountEntry — every staff count ever sent (history). The OrderListItem
--    holds the latest; older counts get supersededAt. Also answers
--    "Liquor Room already counted by Ana today".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beverage."OrderCountEntry" (
  "id"              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId"  text NOT NULL REFERENCES beverage."Organization"(id) ON DELETE CASCADE,
  "locationId"      text NOT NULL REFERENCES beverage."Location"(id) ON DELETE CASCADE,
  "orderListId"     text REFERENCES beverage."OrderList"(id) ON DELETE SET NULL,
  "ingredientId"    text NOT NULL REFERENCES beverage."Ingredient"(id) ON DELETE CASCADE,
  "inventoryItemId" text REFERENCES beverage."InventoryItem"(id) ON DELETE SET NULL,
  "storageAreaId"   text REFERENCES beverage."StorageArea"(id) ON DELETE SET NULL,
  "storageAreaName" text,
  "count"           double precision NOT NULL,
  "unitPick"        text CHECK ("unitPick" IS NULL OR "unitPick" IN ('CASE', 'BOTTLE')),
  "countedById"     text,
  "countedByName"   text,
  "countedAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supersededAt"    timestamp(3),
  "createdAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OrderCountEntry_locationId_countedAt_idx"
  ON beverage."OrderCountEntry" ("locationId", "countedAt");
CREATE INDEX IF NOT EXISTS "OrderCountEntry_orderListId_idx"
  ON beverage."OrderCountEntry" ("orderListId");

-- ---------------------------------------------------------------------------
-- 7) OrderStaffRequest — the free-text "something else" lines.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beverage."OrderStaffRequest" (
  "id"              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId"  text NOT NULL REFERENCES beverage."Organization"(id) ON DELETE CASCADE,
  "locationId"      text NOT NULL REFERENCES beverage."Location"(id) ON DELETE CASCADE,
  "orderListId"     text REFERENCES beverage."OrderList"(id) ON DELETE SET NULL,
  "text"            text NOT NULL,
  "status"          text NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'ADDED', 'DISMISSED')),
  "requestedById"   text,
  "requestedByName" text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedById"    text,
  "resolvedByName"  text,
  "resolvedAt"      timestamp(3)
);
CREATE INDEX IF NOT EXISTS "OrderStaffRequest_orderListId_idx"
  ON beverage."OrderStaffRequest" ("orderListId");

-- ---------------------------------------------------------------------------
-- 8) OrderEmail — which store, and "Mark as sent" (who/when).
-- ---------------------------------------------------------------------------
ALTER TABLE beverage."OrderEmail" ADD COLUMN IF NOT EXISTS "locationId"       text;
ALTER TABLE beverage."OrderEmail" ADD COLUMN IF NOT EXISTS "markedSentById"   text;
ALTER TABLE beverage."OrderEmail" ADD COLUMN IF NOT EXISTS "markedSentByName" text;
ALTER TABLE beverage."OrderEmail" ADD COLUMN IF NOT EXISTS "markedSentAt"     timestamp(3);

-- ---------------------------------------------------------------------------
-- 9) OrderActivityLog — append-only history of every staff / manager /
--    Transfers change (who, when, field, old -> new). No FKs on purpose, so
--    history survives deletes (like public.tip_input_log).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beverage."OrderActivityLog" (
  "id"              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId"  text NOT NULL,
  "locationId"      text,
  "orderListId"     text,
  "orderListItemId" text,
  "ingredientId"    text,
  "entity"          text NOT NULL,  -- ORDER | LINE | PRODUCT | PIN | LINK | EMAIL | TRANSFER | REQUEST | SCOPE
  "action"          text NOT NULL,  -- e.g. submit, count, edit_qty, switch_unit, move, undo_move, remove, add, approve, mark_sent, mark_transferred, pin_created, pin_reset
  "field"           text,
  "oldValue"        text,
  "newValue"        text,
  "actorId"         text,
  "actorName"       text,
  "actorKind"       text NOT NULL CHECK ("actorKind" IN ('staff', 'manager', 'system')),
  "source"          text,           -- staff_count | review | transfers | admin
  "note"            text,
  "at"              timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OrderActivityLog_org_at_idx"
  ON beverage."OrderActivityLog" ("organizationId", "at" DESC);
CREATE INDEX IF NOT EXISTS "OrderActivityLog_orderListId_idx"
  ON beverage."OrderActivityLog" ("orderListId");
CREATE INDEX IF NOT EXISTS "OrderActivityLog_ingredientId_idx"
  ON beverage."OrderActivityLog" ("ingredientId");

-- ---------------------------------------------------------------------------
-- 10) RLS on every new table + manager-only policies (same as doc 13).
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['OrderCountLink', 'OrderingStoreScope', 'OrderCountEntry', 'OrderStaffRequest', 'OrderActivityLog'] LOOP
    EXECUTE format('ALTER TABLE beverage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON beverage.%I', t || '_read_manager', t);
    EXECUTE format('CREATE POLICY %I ON beverage.%I FOR SELECT TO authenticated USING (public.is_manager())', t || '_read_manager', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON beverage.%I', t || '_write_manager', t);
    EXECUTE format('CREATE POLICY %I ON beverage.%I FOR ALL TO authenticated USING (public.is_manager()) WITH CHECK (public.is_manager())', t || '_write_manager', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 11) Data: store links + per-person ordering scope (approved by Refet).
-- ---------------------------------------------------------------------------
UPDATE beverage."Location" SET "scheduleLocationId" = 'a0dc5546-9b6d-453d-90c6-f2a3737fc337' WHERE id = 'cmntqy0ps0000gwf3i6jkvllb'; -- Palo Alto
UPDATE beverage."Location" SET "scheduleLocationId" = '000ad02f-fef5-4310-8bee-87a4bede726a' WHERE id = 'cmntqy3ie00gmgwf35cij7bs9'; -- Sunnyvale
UPDATE beverage."Location" SET "scheduleLocationId" = 'd846a84b-ba61-4fb8-bf09-3b3b9490c1a3' WHERE id = 'cmntqy4p200njgwf3gpqz423d'; -- Meze Kebab
UPDATE beverage."Location" SET "scheduleLocationId" = '7d36e7e0-8784-4071-ba25-b5e77de2c8af' WHERE id = 'cmpnavu5u000004juzzhaidwr'; -- San Ramon

INSERT INTO beverage."OrderingStoreScope" ("profileId", "locationId", "access") VALUES
  ('8b29229d-37c8-434e-b9c3-5290fa21a2d5', 'cmntqy0ps0000gwf3i6jkvllb', 'ORDER'), -- Refet · Palo Alto
  ('8b29229d-37c8-434e-b9c3-5290fa21a2d5', 'cmntqy3ie00gmgwf35cij7bs9', 'ORDER'), -- Refet · Sunnyvale
  ('8b29229d-37c8-434e-b9c3-5290fa21a2d5', 'cmntqy4p200njgwf3gpqz423d', 'ORDER'), -- Refet · Meze Kebab
  ('8b29229d-37c8-434e-b9c3-5290fa21a2d5', 'cmpnavu5u000004juzzhaidwr', 'VIEW'),  -- Refet · San Ramon (view only)
  ('c55d124a-7fd1-480e-bf05-904648ce7e24', 'cmpnavu5u000004juzzhaidwr', 'ORDER')  -- Sarper · San Ramon
ON CONFLICT ("profileId", "locationId") DO NOTHING;
