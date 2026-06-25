-- Order approval workflow (manager → owner) + internal transfer notes.
--
-- NOTE: This project's live database is Supabase **Postgres** (schema
-- "beverage"); the older migrations in this folder predate the Postgres switch
-- and are SQLite-format. This migration is written in Postgres DDL and is the
-- one actually applied to the live DB (also runnable via `prisma db push`).

-- OrderList: status flow + approval metadata -------------------------------
ALTER TABLE "beverage"."OrderList"
  ADD COLUMN IF NOT EXISTS "submittedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedBy"     TEXT,
  ADD COLUMN IF NOT EXISTS "approvedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewNote"     TEXT;

-- New default for freshly-created orders.
ALTER TABLE "beverage"."OrderList" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

-- Preserve existing rows: DRAFT → IN_PROGRESS, COMPLETED → ORDERED.
UPDATE "beverage"."OrderList" SET "status" = 'IN_PROGRESS' WHERE "status" = 'DRAFT';
UPDATE "beverage"."OrderList" SET "status" = 'ORDERED'     WHERE "status" = 'COMPLETED';

-- OrderListItem: internal transfer notes -----------------------------------
ALTER TABLE "beverage"."OrderListItem"
  ADD COLUMN IF NOT EXISTS "transferFromLocationId" TEXT,
  ADD COLUMN IF NOT EXISTS "transferToLocationId"   TEXT,
  ADD COLUMN IF NOT EXISTS "transferNote"           TEXT;
