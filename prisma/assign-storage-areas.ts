import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

interface InventoryImportItem {
  vendor: string | null;
  product: string;
  type: string;
  loc1: string | null;
  count1: number | string | null;
  loc2: string | null;
  count2: number | string | null;
  par: number | null;
}

function normalizeAreaName(name: string): string {
  const lower = name.toLowerCase().trim();
  const map: Record<string, string> = {
    bar: "Bar",
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
    kitchen: "Kitchen",
    coridor: "Corridor",
    "10 or 11": "Bar",
  };
  return map[lower] || name.trim();
}

async function main() {
  console.log("Assigning storage areas to inventory items...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const dataPath = path.resolve("prisma/inventory-data.json");
  const allData: Record<string, { items: InventoryImportItem[] }> = JSON.parse(
    fs.readFileSync(dataPath, "utf-8")
  );

  const locationMap: Record<string, string> = {
    "Palo Alto": "Meyhouse Palo Alto",
    Sunnyvale: "Meyhouse Sunnyvale",
    "Meze Kebab": "Meze Kebab",
  };

  let assigned = 0;
  let skipped = 0;

  for (const [sheetName, data] of Object.entries(allData)) {
    const displayName = locationMap[sheetName];
    if (!displayName) continue;

    const location = await prisma.location.findUnique({
      where: { organizationId_name: { organizationId: org.id, name: displayName } },
    });
    if (!location) continue;

    // Get all storage areas at this location
    const storageAreas = await prisma.storageArea.findMany({
      where: { locationId: location.id },
    });
    const areaMap = new Map(storageAreas.map((a) => [a.name, a.id]));

    console.log(`=== ${displayName} (${data.items.length} items) ===`);

    for (const item of data.items) {
      if (!item.product) continue;

      // Find the inventory item by ingredient name
      const ingredient = await prisma.ingredient.findFirst({
        where: {
          organizationId: org.id,
          OR: [
            { name: item.product },
            // Loose match for items that got renamed
            { name: { contains: item.product.split(" ").slice(0, 2).join(" ") } },
          ],
        },
      });

      if (!ingredient) {
        skipped++;
        continue;
      }

      const inventoryItem = await prisma.inventoryItem.findUnique({
        where: {
          locationId_ingredientId: {
            locationId: location.id,
            ingredientId: ingredient.id,
          },
        },
      });

      if (!inventoryItem) {
        skipped++;
        continue;
      }

      // Pick the primary location — prefer loc1, fallback to loc2
      const primaryArea = item.loc1 || item.loc2;
      if (!primaryArea) continue;

      const normalized = normalizeAreaName(primaryArea);
      const areaId = areaMap.get(normalized);
      if (!areaId) continue;

      await prisma.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: { storageAreaId: areaId },
      });
      assigned++;
    }
  }

  console.log(`\nAssigned ${assigned} items to storage areas`);
  console.log(`Skipped ${skipped} items (no match or no area info)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
