-- Bar Recipe Book, Phase 3 (applied 2026-09-29 via Supabase MCP as `bar_recipe_photos_bucket`).
-- Backup first: backup_pre_recipe_photos_20260929 (85 tables, 13,905 rows, 0 mismatches).
-- Private bucket for drink photos. No storage.objects policies on purpose: only
-- the server (service role) reads/writes it, after the same access check as the
-- recipes, and hands the page short-lived signed URLs. Photos are never deleted
-- (change history + revert point at old files).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bar-recipe-photos', 'bar-recipe-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;
