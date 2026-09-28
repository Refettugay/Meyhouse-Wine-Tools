-- Allow a blank Ingredient.orderUnit ("Not set"). Applied 2026-09-28 AFTER the
-- app deploy 7c0e82a (whose Prisma client reads orderUnit as optional).
-- Approved by Refet. Backup first: schema backup_pre_orderunit_20260928.
-- No data changes: existing CASE/BOTTLE values stay as they are.
ALTER TABLE beverage."Ingredient" ALTER COLUMN "orderUnit" DROP NOT NULL;
ALTER TABLE beverage."Ingredient" ALTER COLUMN "orderUnit" DROP DEFAULT;  -- new products start as Not set
