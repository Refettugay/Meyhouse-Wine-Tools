-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbrev" TEXT NOT NULL,
    "measureType" TEXT NOT NULL,
    "baseFactor" REAL NOT NULL,
    "canPurchase" BOOLEAN NOT NULL DEFAULT true,
    "canRecipe" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ProductSKU" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "vendorId" TEXT,
    "name" TEXT NOT NULL,
    "containerType" TEXT NOT NULL,
    "unitsPerPack" INTEGER NOT NULL DEFAULT 1,
    "innerSize" REAL NOT NULL,
    "innerUnitId" TEXT NOT NULL,
    "costCents" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "vendorItemNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductSKU_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSKU_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSKU_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductSKU_innerUnitId_fkey" FOREIGN KEY ("innerUnitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
INSERT INTO "new_Ingredient" ("bottleCostCents", "bottleSizeMl", "casePackSize", "createdAt", "id", "ingredientCategory", "isActive", "name", "notes", "onMenu", "orderUnit", "organizationId", "purchaseCostCents", "purchaseQty", "purchaseUnit", "type", "updatedAt", "vendor", "vendorId") SELECT "bottleCostCents", "bottleSizeMl", "casePackSize", "createdAt", "id", "ingredientCategory", "isActive", "name", "notes", "onMenu", "orderUnit", "organizationId", "purchaseCostCents", "purchaseQty", "purchaseUnit", "type", "updatedAt", "vendor", "vendorId" FROM "Ingredient";
DROP TABLE "Ingredient";
ALTER TABLE "new_Ingredient" RENAME TO "Ingredient";
CREATE UNIQUE INDEX "Ingredient_organizationId_name_key" ON "Ingredient"("organizationId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");
