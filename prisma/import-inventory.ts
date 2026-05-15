import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

interface InventoryItem {
  vendor: string;
  product: string;
  type: string;
  loc1: string | null;
  count1: number | string | null;
  loc2: string | null;
  count2: number | string | null;
  par: number | null;
}

interface LocationData {
  items: InventoryItem[];
  sub_locations: string[];
}

// Normalize storage area names (merge duplicates like "BAR", "bar", "Bar Only")
function normalizeStorageArea(name: string): string {
  const lower = name.toLowerCase().trim();
  const map: Record<string, string> = {
    "bar": "Bar",
    "bar only": "Bar",
    "bar fridge": "Bar Fridge",
    "btg fridge": "BTG Fridge",
    "rsv fridge": "RSV Fridge",
    "red cabin": "Red Cabin",
    "red cellar": "Red Cellar",
    "lqr room": "Liquor Room",
    "liq room": "Liquor Room",
    "liq. room": "Liquor Room",
    "dry storage": "Dry Storage",
    "kitchen": "Kitchen",
    "coridor": "Corridor",
    "10 or 11": "Bar",
  };
  return map[lower] || name.trim();
}

// Parse count value - some are numbers, others are text like "bar only"
function parseNumericCount(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  const parsed = parseFloat(String(val));
  return isNaN(parsed) ? 0 : parsed;
}

async function main() {
  console.log("Importing inventory data from Order Guide...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) {
    console.error("Organization not found. Run seed.ts first.");
    return;
  }

  // Load exported JSON
  const dataPath = path.resolve("prisma/inventory-data.json");
  const allData: Record<string, LocationData> = JSON.parse(
    fs.readFileSync(dataPath, "utf-8")
  );

  const LOCATIONS = [
    { sheetName: "Palo Alto", displayName: "Meyhouse Palo Alto", sortOrder: 0 },
    { sheetName: "Sunnyvale", displayName: "Meyhouse Sunnyvale", sortOrder: 1 },
    { sheetName: "Meze Kebab", displayName: "Meze Kebab", sortOrder: 2 },
  ];

  // Delete any existing phase-1 placeholder locations that don't match the new structure
  // (keeping only clean data)
  await prisma.inventoryItem.deleteMany({ where: { organizationId: org.id } });
  await prisma.storageArea.deleteMany({ where: { organizationId: org.id } });
  await prisma.location.deleteMany({ where: { organizationId: org.id } });
  console.log("Cleared existing inventory data\n");

  let totalIngredientsCreated = 0;
  let totalInventoryCreated = 0;

  for (const loc of LOCATIONS) {
    console.log(`=== Processing ${loc.displayName} ===`);
    const sheetData = allData[loc.sheetName];
    if (!sheetData) continue;

    // Create location
    const location = await prisma.location.create({
      data: {
        organizationId: org.id,
        name: loc.displayName,
        sortOrder: loc.sortOrder,
      },
    });

    // Create storage areas (normalized)
    const areaNames = new Set<string>();
    for (const area of sheetData.sub_locations) {
      areaNames.add(normalizeStorageArea(area));
    }
    const storageAreaMap = new Map<string, string>();
    let areaOrder = 0;
    for (const areaName of [...areaNames].sort()) {
      const area = await prisma.storageArea.create({
        data: {
          organizationId: org.id,
          locationId: location.id,
          name: areaName,
          sortOrder: areaOrder++,
        },
      });
      storageAreaMap.set(areaName, area.id);
    }
    console.log(`  Created ${storageAreaMap.size} storage areas`);

    // Process inventory items
    let itemCount = 0;
    for (const item of sheetData.items) {
      if (!item.product.trim()) continue;

      // Find or create the ingredient
      let ingredient = await prisma.ingredient.findUnique({
        where: {
          organizationId_name: {
            organizationId: org.id,
            name: item.product,
          },
        },
      });

      if (!ingredient) {
        // Determine ingredient type from category
        const type = item.type.toLowerCase().includes("grocery")
          ? "SOLID"
          : "LIQUID";

        ingredient = await prisma.ingredient.create({
          data: {
            organizationId: org.id,
            name: item.product,
            type,
            vendor: item.vendor || null,
            ingredientCategory: item.type || null,
          },
        });
        totalIngredientsCreated++;
      } else {
        // Update vendor/category if not set
        if (!ingredient.vendor && item.vendor) {
          await prisma.ingredient.update({
            where: { id: ingredient.id },
            data: {
              vendor: item.vendor,
              ingredientCategory: ingredient.ingredientCategory || item.type,
            },
          });
        }
      }

      // Compute current stock by summing loc1 + loc2 counts
      const stock1 = parseNumericCount(item.count1);
      const stock2 = parseNumericCount(item.count2);
      const currentStock = stock1 + stock2;

      // Create inventory item
      await prisma.inventoryItem.create({
        data: {
          organizationId: org.id,
          locationId: location.id,
          ingredientId: ingredient.id,
          parLevel: item.par || 0,
          currentStock,
          unit: "bottle",
        },
      });
      itemCount++;
      totalInventoryCreated++;
    }
    console.log(`  Created ${itemCount} inventory items\n`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`New ingredients created: ${totalIngredientsCreated}`);
  console.log(`Inventory items created: ${totalInventoryCreated}`);

  const totalIngredients = await prisma.ingredient.count({
    where: { organizationId: org.id, isActive: true },
  });
  console.log(`Total ingredients in database: ${totalIngredients}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
