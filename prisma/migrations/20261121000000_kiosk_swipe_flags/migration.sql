-- Kiosk swipe actions (2026-11-21): "Check other areas" flags and "86" marks
-- per store item, plus a per-person "Can mark 86" setting. ADDITIVE ONLY:
-- two new tables, no existing table or column is changed (so no backup needed).
--
-- ROLLBACK (turn NEXT_PUBLIC_KIOSK_SWIPE_ACTIONS=off first):
--   drop table if exists beverage."KioskItemFlag";
--   drop table if exists beverage."KioskPermission";
-- Every flag / clear is also in beverage."OrderActivityLog" (entity = 'FLAG'),
-- which the rollback leaves in place.

create table if not exists beverage."KioskItemFlag" (
  "id"              text primary key,
  "organizationId"  text not null,
  "locationId"      text not null,
  "inventoryItemId" text not null,
  "kind"            text not null,          -- 'CHECK' (check other areas) | 'EIGHTY_SIX'
  "setById"         text,
  "setByName"       text,
  "setAt"           timestamptz not null default now(),
  "clearedAt"       timestamptz,
  "clearedById"     text,
  "clearedByName"   text,
  "clearReason"     text                    -- manual | counted | count_sent | nightly_reset
);
-- At most ONE open flag of each kind per store item (two people clearing at once: first wins).
create unique index if not exists "KioskItemFlag_open_uniq"
  on beverage."KioskItemFlag" ("inventoryItemId", "kind") where "clearedAt" is null;
create index if not exists "KioskItemFlag_loc_open_idx"
  on beverage."KioskItemFlag" ("locationId") where "clearedAt" is null;

create table if not exists beverage."KioskPermission" (
  "organizationId" text not null,
  "personId"       text not null,           -- public.profiles.id
  "canMark86"      boolean not null,
  "updatedAt"      timestamptz not null default now(),
  "updatedByName"  text,
  primary key ("organizationId", "personId")
);

-- Match the other beverage tables: RLS on, no policies (only the app's server
-- connection reads/writes them). Rollback: disable row level security on both.
alter table beverage."KioskItemFlag" enable row level security;
alter table beverage."KioskPermission" enable row level security;
