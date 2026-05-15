-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "shelfLocation" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settingsBottleSizes" TEXT NOT NULL DEFAULT '[200,355,375,500,700,750,1000,1500]',
    "settingsCaseSizes" TEXT NOT NULL DEFAULT '[1,6,12,24]',
    "settingsCategories" TEXT NOT NULL DEFAULT '[]',
    "settingsStandardPours" TEXT NOT NULL DEFAULT '{"SPIRIT":1.5,"WINE":5,"BEER":12,"NA_BEVERAGE":8,"CORDIAL":1,"BITTER":0.04,"SYRUP":0.5,"GROCERY":1,"PRODUCE":1,"MEAT":1,"DAIRY":1,"DRY_GOODS":1,"OTHER":1}',
    "settingsShelfLabels" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organization" ("createdAt", "id", "name", "settingsBottleSizes", "settingsCaseSizes", "settingsCategories", "settingsStandardPours", "slug", "updatedAt") SELECT "createdAt", "id", "name", "settingsBottleSizes", "settingsCaseSizes", "settingsCategories", "settingsStandardPours", "slug", "updatedAt" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
