-- Bar Recipe Book, Phase 1 (applied 2026-09-29 via Supabase MCP as `bar_recipe_book_phase1`).
-- Spec: docs/recipe-book/Recipe_Book_Build_Spec.md. Backup taken first:
-- backup_pre_recipe_book_20260929 (78 tables, 13,375 rows).
--
-- ADDITIVE ONLY: five new tables in the beverage schema + two public RPCs for the
-- launcher's Team page. Nothing existing is altered. Named bar_* so they don't
-- collide with the costing tables beverage."Recipe" / "RecipeIngredient".
-- Rollback: rollback.sql next to this file.
--
-- Translatable text is stored as jsonb {"en": ..., "tr": ..., "es": ...}; a missing
-- language falls back to English in the UI. Brand/spirit names are not translated.

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------
create table beverage.bar_recipe (
  id                 text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  name               text not null,
  subtitle           jsonb,
  photo_path         text,
  category           text not null check (category in ('craft', 'classic', 'na', 'syrup')),
  stores             text[] not null default '{meyhouse,meze-kebab}'
                     check (stores <@ array['meyhouse', 'meze-kebab']::text[]),
  scale_mode         text not null default 'none' check (scale_mode in ('portions', 'liters', 'multiplier', 'none')),
  batchable          boolean not null default false,
  default_portions   numeric,
  dilution_pct       numeric not null default 0 check (dilution_pct >= 0 and dilution_pct < 1), -- 0.2 = 20%
  pour_from_batch_oz numeric,
  glass              jsonb,
  ice                jsonb,
  garnish            jsonb,
  how_to             jsonb,
  storage            text check (storage in ('freezer', 'fridge')),
  notes              jsonb,
  method             jsonb, -- {"en": ["step", ...], "tr": [...], "es": [...]}
  base_yield_l       numeric,
  glass_l            numeric,
  needs_review       boolean not null default false,
  needs_spec         boolean not null default false,
  active             boolean not null default true, -- archive = false; never hard-deleted
  sort_order         integer not null default 0,
  updated_by         uuid,  -- public.profiles.id of the last editor (null = seed)
  updated_by_name    text,
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create table beverage.bar_recipe_ingredient (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   text not null references beverage.bar_recipe(id) on delete cascade,
  sort_order  integer not null default 0,
  name        jsonb not null,  -- {"en": "Lime Juice", "tr": ..., "es": ...}
  batch_name  text,            -- name on the batch card, e.g. "Serrano Infused Madre Mezcal"
  qty         numeric,
  unit        text check (unit in ('oz', 'dash', 'kg', 'g', 'L', 'ea', 'cup', 'ml')),
  text        jsonb,           -- non-numeric amounts: "top off", "2 slice", "rinse"
  in_batch    boolean not null default true,
  note        jsonb
);
create index bar_recipe_ingredient_recipe_idx on beverage.bar_recipe_ingredient (recipe_id, sort_order);

-- ---------------------------------------------------------------------------
-- Change log — append-only. Nobody can edit or delete a row: no update/delete
-- RLS policy, AND a trigger that refuses UPDATE/DELETE/TRUNCATE for every role
-- (the Beverage app connects as a role that skips RLS, so RLS alone isn't enough).
-- ---------------------------------------------------------------------------
create table beverage.bar_recipe_change_log (
  id                   bigint generated always as identity primary key,
  recipe_id            text not null, -- no FK: the log outlives anything
  changed_by_person_id uuid,
  changed_by_name      text not null,
  changed_at           timestamptz not null default now(),
  source               text not null check (source in ('staff_page', 'admin')),
  device               text,
  language             text check (language in ('en', 'tr', 'es')),
  action               text not null check (action in ('create', 'update', 'archive', 'restore', 'revert')),
  reverted_log_id      bigint,
  before               jsonb, -- full recipe + ingredients (null on create)
  after                jsonb not null,
  summary              text not null
);
create index bar_recipe_change_log_recipe_idx on beverage.bar_recipe_change_log (recipe_id, changed_at desc);
create index bar_recipe_change_log_time_idx on beverage.bar_recipe_change_log (changed_at desc);

create function beverage.bar_recipe_change_log_immutable() returns trigger
language plpgsql set search_path = '' as $$ -- search_path added right after (migration bar_recipe_log_fn_search_path)
begin
  raise exception 'bar_recipe_change_log is append-only (% refused)', tg_op;
end $$;

create trigger bar_recipe_change_log_no_update_delete
  before update or delete on beverage.bar_recipe_change_log
  for each row execute function beverage.bar_recipe_change_log_immutable();
create trigger bar_recipe_change_log_no_truncate
  before truncate on beverage.bar_recipe_change_log
  for each statement execute function beverage.bar_recipe_change_log_immutable();

-- ---------------------------------------------------------------------------
-- "Recipe access" per Schedule position. No row = OFF.
-- ---------------------------------------------------------------------------
create table beverage.position_recipe_access (
  position_id     uuid primary key references public.positions(id) on delete cascade,
  enabled         boolean not null default false,
  updated_by      uuid,
  updated_by_name text,
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The ONE staff link for the whole group (single row, id = 1).
-- "Make a new link" replaces the token; "Turn off" sets enabled = false.
-- ---------------------------------------------------------------------------
create table beverage.bar_recipe_link (
  id              smallint primary key default 1 check (id = 1),
  token           text not null unique check (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  rotated_at      timestamptz,
  created_by_id   uuid,
  created_by_name text
);

-- ---------------------------------------------------------------------------
-- RLS on, manager-only policies like the other beverage tables.
-- ---------------------------------------------------------------------------
alter table beverage.bar_recipe             enable row level security;
alter table beverage.bar_recipe_ingredient  enable row level security;
alter table beverage.bar_recipe_change_log  enable row level security;
alter table beverage.position_recipe_access enable row level security;
alter table beverage.bar_recipe_link        enable row level security;

create policy bar_recipe_read_manager  on beverage.bar_recipe for select to authenticated using (public.is_manager());
create policy bar_recipe_write_manager on beverage.bar_recipe for all    to authenticated using (public.is_manager()) with check (public.is_manager());

create policy bar_recipe_ingredient_read_manager  on beverage.bar_recipe_ingredient for select to authenticated using (public.is_manager());
create policy bar_recipe_ingredient_write_manager on beverage.bar_recipe_ingredient for all    to authenticated using (public.is_manager()) with check (public.is_manager());

-- log: read + insert only. Deliberately NO update and NO delete policy.
create policy bar_recipe_change_log_read_manager   on beverage.bar_recipe_change_log for select to authenticated using (public.is_manager());
create policy bar_recipe_change_log_insert_manager on beverage.bar_recipe_change_log for insert to authenticated with check (public.is_manager());

create policy position_recipe_access_read_manager  on beverage.position_recipe_access for select to authenticated using (public.is_manager());
create policy position_recipe_access_write_manager on beverage.position_recipe_access for all    to authenticated using (public.is_manager()) with check (public.is_manager());

create policy bar_recipe_link_read_manager  on beverage.bar_recipe_link for select to authenticated using (public.is_manager());
create policy bar_recipe_link_write_manager on beverage.bar_recipe_link for all    to authenticated using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- Launcher Team page: read / set "Recipe access" per position. The launcher's
-- Supabase client only reaches the public schema, so it goes through these two
-- functions. Service role only; the launcher checks the caller is an
-- owner/manager/supervisor before calling (same as staff_ordering_access).
-- ---------------------------------------------------------------------------
create function public.recipe_access_positions()
returns table (position_id uuid, enabled boolean, updated_by_name text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.position_id, a.enabled, a.updated_by_name, a.updated_at from beverage.position_recipe_access a
$$;

create function public.set_position_recipe_access(p_position_id uuid, p_enabled boolean, p_actor_id uuid, p_actor_name text)
returns void
language sql volatile security definer set search_path = '' as $$
  insert into beverage.position_recipe_access (position_id, enabled, updated_by, updated_by_name, updated_at)
  values (p_position_id, p_enabled, p_actor_id, p_actor_name, now())
  on conflict (position_id) do update
    set enabled = excluded.enabled, updated_by = excluded.updated_by,
        updated_by_name = excluded.updated_by_name, updated_at = excluded.updated_at
$$;

revoke all on function public.recipe_access_positions() from public, anon, authenticated;
revoke all on function public.set_position_recipe_access(uuid, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.recipe_access_positions() to service_role;
grant execute on function public.set_position_recipe_access(uuid, boolean, uuid, text) to service_role;
