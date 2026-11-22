-- Master Database (2026-11-22). Additive only: new nullable columns, no data changed.
-- InventoryItem.removedAt: product taken off this store (row + history kept).
-- Ingredient.archivedAt / deletedAt: hidden from Master list / "Permanent Delete" of a used product.
ALTER TABLE "beverage"."InventoryItem" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);
ALTER TABLE "beverage"."InventoryItem" ADD COLUMN IF NOT EXISTS "removedByName" TEXT;
ALTER TABLE "beverage"."Ingredient" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "beverage"."Ingredient" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
-- Applied to live 2026-11-22 (Supabase migration "master_database").
-- ROLLBACK:
--   alter table beverage."InventoryItem" drop column if exists "removedAt", drop column if exists "removedByName";
--   alter table beverage."Ingredient" drop column if exists "archivedAt", drop column if exists "deletedAt";
