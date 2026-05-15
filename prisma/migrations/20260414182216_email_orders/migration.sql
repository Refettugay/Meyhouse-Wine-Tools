-- CreateTable
CREATE TABLE "OrderEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "orderListId" TEXT,
    "vendorName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    "useMergedOrderCart" BOOLEAN NOT NULL DEFAULT false,
    "orderEmailFrom" TEXT,
    "orderEmailFromName" TEXT,
    "emailProvider" TEXT NOT NULL DEFAULT 'RESEND',
    "emailApiKey" TEXT,
    "emailSmtpHost" TEXT,
    "emailSmtpPort" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organization" ("createdAt", "id", "name", "settingsBottleSizes", "settingsCaseSizes", "settingsCategories", "settingsShelfLabels", "settingsStandardPours", "slug", "updatedAt", "useMergedOrderCart") SELECT "createdAt", "id", "name", "settingsBottleSizes", "settingsCaseSizes", "settingsCategories", "settingsShelfLabels", "settingsStandardPours", "slug", "updatedAt", "useMergedOrderCart" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
