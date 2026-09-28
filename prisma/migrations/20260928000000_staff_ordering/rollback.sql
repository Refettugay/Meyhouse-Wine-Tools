-- Undo Staff Ordering Phase 1 (only if needed). Removes ONLY what migration.sql added.
-- Nothing existing depends on these objects.
DROP TABLE IF EXISTS beverage."OrderActivityLog";
DROP TABLE IF EXISTS beverage."OrderStaffRequest";
DROP TABLE IF EXISTS beverage."OrderCountEntry";
DROP TABLE IF EXISTS beverage."OrderingStoreScope";
DROP TABLE IF EXISTS beverage."OrderCountLink";

ALTER TABLE beverage."OrderEmail"
  DROP COLUMN IF EXISTS "locationId", DROP COLUMN IF EXISTS "markedSentById",
  DROP COLUMN IF EXISTS "markedSentByName", DROP COLUMN IF EXISTS "markedSentAt";

ALTER TABLE beverage."OrderListItem"
  DROP COLUMN IF EXISTS "countedById", DROP COLUMN IF EXISTS "countedByName",
  DROP COLUMN IF EXISTS "countedAt", DROP COLUMN IF EXISTS "source",
  DROP COLUMN IF EXISTS "unitIsStaffPick", DROP COLUMN IF EXISTS "movedById",
  DROP COLUMN IF EXISTS "movedByName", DROP COLUMN IF EXISTS "movedAt",
  DROP COLUMN IF EXISTS "transferStatus", DROP COLUMN IF EXISTS "transferredAt",
  DROP COLUMN IF EXISTS "transferredById", DROP COLUMN IF EXISTS "transferredByName",
  DROP COLUMN IF EXISTS "unitCostCentsSnapshot", DROP COLUMN IF EXISTS "casePackSizeSnapshot";

ALTER TABLE beverage."OrderList"
  DROP COLUMN IF EXISTS "submittedById", DROP COLUMN IF EXISTS "submittedByName", DROP COLUMN IF EXISTS "source";

DROP INDEX IF EXISTS beverage."Location_scheduleLocationId_key";
ALTER TABLE beverage."Location" DROP COLUMN IF EXISTS "scheduleLocationId";
