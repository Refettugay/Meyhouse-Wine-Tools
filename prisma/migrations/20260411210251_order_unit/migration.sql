-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LIQUID',
    "bottleCostCents" INTEGER,
    "bottleSizeMl" INTEGER,
    "casePackSize" INTEGER,
    "orderUnit" TEXT NOT NULL DEFAULT 'BOTTLE',
    "purchaseCostCents" INTEGER,
    "purchaseQty" REAL,
    "purchaseUnit" TEXT,
    "vendor" TEXT,
    "vendorId" TEXT,
    "ingredientCategory" TEXT,
    "notes" TEXT,
    "onMenu" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ingredient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ingredient_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ingredient" ("bottleCostCents", "bottleSizeMl", "casePackSize", "createdAt", "id", "ingredientCategory", "isActive", "name", "notes", "onMenu", "organizationId", "purchaseCostCents", "purchaseQty", "purchaseUnit", "type", "updatedAt", "vendor", "vendorId") SELECT "bottleCostCents", "bottleSizeMl", "casePackSize", "createdAt", "id", "ingredientCategory", "isActive", "name", "notes", "onMenu", "organizationId", "purchaseCostCents", "purchaseQty", "purchaseUnit", "type", "updatedAt", "vendor", "vendorId" FROM "Ingredient";
DROP TABLE "Ingredient";
ALTER TABLE "new_Ingredient" RENAME TO "Ingredient";
CREATE UNIQUE INDEX "Ingredient_organizationId_name_key" ON "Ingredient"("organizationId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
