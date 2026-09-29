-- Rollback for 20260929000000_bar_recipe_book. Nothing existing was changed, so
-- rollback = hide the staff link (turn it off in the admin app, or drop the
-- table below) and drop everything the migration added.
-- The storage bucket (Phase 3) is removed separately in the Supabase dashboard.

drop function if exists public.set_position_recipe_access(uuid, boolean, uuid, text);
drop function if exists public.recipe_access_positions();
drop table if exists beverage.bar_recipe_link;
drop table if exists beverage.position_recipe_access;
drop table if exists beverage.bar_recipe_change_log; -- DROP is not blocked by the append-only trigger
drop function if exists beverage.bar_recipe_change_log_immutable();
drop table if exists beverage.bar_recipe_ingredient;
drop table if exists beverage.bar_recipe;
