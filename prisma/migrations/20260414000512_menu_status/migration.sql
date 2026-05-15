-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LIQUID',
    "productType" TEXT,
    "baseUnitCode" TEXT,
    "countUnitCode" TEXT,
    "isKeyItem" BOOLEAN NOT NULL DEFAULT false,
    "costUpdateMethod" TEXT NOT NULL DEFAULT 'MANUAL',
    "isHouseMade" BOOLEAN NOT NULL DEFAULT false,
    "subRecipeId" TEXT,
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
    "menuStatus" TEXT NOT NULL DEFAULT 'ON_MENU',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ingredient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ingredient_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ingredient_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ingredient" ("baseUnitCode", "bottleCostCents", "bottleSizeMl", "casePackSize", "costUpdateMethod", "countUnitCode", "createdAt", "id", "ingredientCategory", "isActive", "isHouseMade", "isKeyItem", "name", "notes", "onMenu", "orderUnit", "organizationId", "productType", "purchaseCostCents", "purchaseQty", "purchaseUnit", "subRecipeId", "type", "updatedAt", "vendor", "vendorId") SELECT "baseUnitCode", "bottleCostCents", "bottleSizeMl", "casePackSize", "costUpdateMethod", "countUnitCode", "createdAt", "id", "ingredientCategory", "isActive", "isHouseMade", "isKeyItem", "name", "notes", "onMenu", "orderUnit", "organizationId", "productType", "purchaseCostCents", "purchaseQty", "purchaseUnit", "subRecipeId", "type", "updatedAt", "vendor", "vendorId" FROM "Ingredient";
DROP TABLE "Ingredient";
ALTER TABLE "new_Ingredient" RENAME TO "Ingredient";
CREATE UNIQUE INDEX "Ingredient_subRecipeId_key" ON "Ingredient"("subRecipeId");
CREATE UNIQUE INDEX "Ingredient_organizationId_name_key" ON "Ingredient"("organizationId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
