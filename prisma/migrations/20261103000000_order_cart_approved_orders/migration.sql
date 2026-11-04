-- Ordering: shared Order Cart → Approved orders → Order history (2026-11-03).
-- ADDITIVE ONLY: new tables + nullable columns. Nothing dropped or renamed.
-- RLS on with no policies on purpose: only the server (Prisma) reads these.
--
-- ROLLBACK (safe in this order; loses only data written by the new flow):
--   alter table beverage."OrderListItem" drop column if exists "orderedEventId", drop column if exists "sourceSummary";
--   alter table beverage."OrderList" drop column if exists "approvedOrderId";
--   drop table if exists beverage.order_history_entry, beverage.order_ordered_event,
--     beverage.order_cart_presence, beverage.order_cart_source, beverage.order_cart_line,
--     beverage.approved_order;

-- 1) Shared Order Cart: one line per store + item + unit. Kiosk sends and
--    desktop counts both add into it. qty is the total the cart shows.
create table if not exists beverage.order_cart_line (
  id                text primary key default (gen_random_uuid())::text,
  organization_id   text not null,
  location_id       text not null references beverage."Location"(id) on delete cascade,
  ingredient_id     text not null references beverage."Ingredient"(id) on delete cascade,
  unit              text not null,               -- 'case' | 'bottle'
  qty               double precision not null,   -- total in the cart
  vendor            text,
  created_at        timestamp not null default now(),
  updated_at        timestamp not null default now(),
  unique (location_id, ingredient_id, unit)
);
create index if not exists order_cart_line_org on beverage.order_cart_line (organization_id, location_id);

-- Where each part of a cart line came from (source tags + audit).
--   kind: kiosk | desktop | migrated | moved_in | add
--   desktop rows are per person and get updated when that person re-types a count.
create table if not exists beverage.order_cart_source (
  id                text primary key default (gen_random_uuid())::text,
  line_id           text not null references beverage.order_cart_line(id) on delete cascade,
  kind              text not null,
  qty               double precision not null,
  actor_id          text,
  actor_name        text,
  counted_stock     double precision,
  par_snapshot      double precision,
  from_location_id  text,                        -- moved_in: the store that needed it (transfer)
  at                timestamp not null default now()
);
create index if not exists order_cart_source_line on beverage.order_cart_source (line_id);

-- "<name> is also viewing <store>" (heartbeat from the Order tab).
create table if not exists beverage.order_cart_presence (
  user_id      text not null,
  location_id  text not null,
  user_name    text,
  seen_at      timestamp not null default now(),
  primary key (user_id, location_id)
);

-- 2) Approved orders: one ACTIVE list per approver; CLEARED = Order history.
create table if not exists beverage.approved_order (
  id                text primary key default (gen_random_uuid())::text,
  organization_id   text not null,
  approved_by_id    text not null,
  approved_by_name  text,
  approved_at       timestamp not null default now(),  -- last approve into it
  first_approved_at timestamp not null default now(),
  status            text not null default 'ACTIVE',     -- ACTIVE | CLEARED
  cleared_at        timestamp,
  cleared_by_name   text
);
create index if not exists approved_order_owner on beverage.approved_order (organization_id, approved_by_id, status);
-- At most one ACTIVE list per person (two devices can't create two).
create unique index if not exists approved_order_one_active on beverage.approved_order (organization_id, approved_by_id) where status = 'ACTIVE';

-- The per-store order rows an approve creates point back at their approved list.
alter table beverage."OrderList" add column if not exists "approvedOrderId" text references beverage.approved_order(id) on delete set null;
create index if not exists orderlist_approved_order on beverage."OrderList" ("approvedOrderId");

-- 3) "Ordered" taps. One row per tap; the lines it covered carry its id, so
--    Undo removes exactly those history entries.
create table if not exists beverage.order_ordered_event (
  id                text primary key default (gen_random_uuid())::text,
  approved_order_id text not null references beverage.approved_order(id) on delete cascade,
  vendor_name       text not null,
  ordered_at        timestamp not null default now(),
  ordered_by_id     text,
  ordered_by_name   text
);
alter table beverage."OrderListItem" add column if not exists "orderedEventId" text references beverage.order_ordered_event(id) on delete set null;
alter table beverage."OrderListItem" add column if not exists "sourceSummary" text;

-- 4) 8-week ordering history (Count & build "Last 8 · Wk · Mo").
--    qty_cases = qty converted with the item's case pack size; NULL when the
--    line is in bottles and the item has no pack size (shown as bottles, flagged).
create table if not exists beverage.order_history_entry (
  id                 text primary key default (gen_random_uuid())::text,
  organization_id    text not null,
  location_id        text not null,
  ingredient_id      text not null,
  business_date      date not null,                 -- America/Los_Angeles
  qty                double precision not null,     -- as ordered
  unit               text not null,                 -- 'case' | 'bottle'
  qty_cases          double precision,
  ordered_event_id   text references beverage.order_ordered_event(id) on delete cascade,
  order_list_item_id text,
  source             text not null default 'ordered', -- ordered | backfill
  created_at         timestamp not null default now()
);
create index if not exists order_history_lookup on beverage.order_history_entry (organization_id, business_date);
create index if not exists order_history_event on beverage.order_history_entry (ordered_event_id);

alter table beverage.order_cart_line enable row level security;
alter table beverage.order_cart_source enable row level security;
alter table beverage.order_cart_presence enable row level security;
alter table beverage.approved_order enable row level security;
alter table beverage.order_ordered_event enable row level security;
alter table beverage.order_history_entry enable row level security;
