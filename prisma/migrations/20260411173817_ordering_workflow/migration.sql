-- AlterTable
ALTER TABLE "OrderList" ADD COLUMN "countedAt" DATETIME;
ALTER TABLE "OrderList" ADD COLUMN "notes" TEXT;

-- AlterTable
ALTER TABLE "OrderListItem" ADD COLUMN "countedStock" REAL;
ALTER TABLE "OrderListItem" ADD COLUMN "parSnapshot" REAL;
ALTER TABLE "OrderListItem" ADD COLUMN "storageArea" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "storageAreaId" TEXT,
    "parLevel" REAL NOT NULL DEFAULT 0,
    "currentStock" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'bottle',
    "lastCountedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_storageAreaId_fkey" FOREIGN KEY ("storageAreaId") REFERENCES "StorageArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventoryItem" ("createdAt", "currentStock", "id", "ingredientId", "lastCountedAt", "locationId", "organizationId", "parLevel", "unit", "updatedAt") SELECT "createdAt", "currentStock", "id", "ingredientId", "lastCountedAt", "locationId", "organizationId", "parLevel", "unit", "updatedAt" FROM "InventoryItem";
DROP TABLE "InventoryItem";
ALTER TABLE "new_InventoryItem" RENAME TO "InventoryItem";
CREATE UNIQUE INDEX "InventoryItem_locationId_ingredientId_key" ON "InventoryItem"("locationId", "ingredientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
