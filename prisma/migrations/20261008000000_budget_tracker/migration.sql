-- Monthly beverage budget tracker (applied 2026-10-08 via Supabase MCP as `budget_tracker`).
-- ADDITIVE ONLY. Rollback: drop both tables.
-- RLS is on with no policies on purpose: only the server (Prisma) reads these.

create table if not exists beverage.budget_month (
  id              text primary key default (gen_random_uuid())::text,
  organization_id text not null,
  month           text not null, -- 'YYYY-MM'
  budget_cents    integer not null,
  pending_cents   integer not null default 0,
  pending_note    text,
  updated_at      timestamp not null default now(),
  unique (organization_id, month)
);

create table if not exists beverage.budget_invoice (
  id              text primary key default (gen_random_uuid())::text,
  organization_id text not null,
  month           text not null, -- 'YYYY-MM' the invoice counts toward
  location_id     text not null references beverage."Location"(id),
  vendor          text not null,
  invoice_number  text not null,
  invoice_date    date not null,
  amount_cents    integer not null,
  counted         boolean not null default true, -- false = logged but not against this month's budget
  note            text,
  created_at      timestamp not null default now()
);

create index if not exists budget_invoice_org_month on beverage.budget_invoice (organization_id, month);

alter table beverage.budget_month enable row level security;
alter table beverage.budget_invoice enable row level security;
