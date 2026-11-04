-- Kiosk press-and-hold menu (2026-11-03): a short note per store item that
-- shows as a yellow tag on the kiosk and in Admin. ADDITIVE ONLY.
-- Backup taken first: beverage."_bak_InventoryItem_20261103_kiosk" (858 rows).
--
-- ROLLBACK:
--   alter table beverage."InventoryItem" drop column if exists "kioskNote";
alter table beverage."InventoryItem" add column if not exists "kioskNote" text;
