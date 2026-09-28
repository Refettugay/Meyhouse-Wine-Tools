-- Undo: blank units become BOTTLE (the old default), then the rule comes back.
UPDATE beverage."Ingredient" SET "orderUnit" = 'BOTTLE' WHERE "orderUnit" IS NULL;
ALTER TABLE beverage."Ingredient" ALTER COLUMN "orderUnit" SET DEFAULT 'BOTTLE';
ALTER TABLE beverage."Ingredient" ALTER COLUMN "orderUnit" SET NOT NULL;
