import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

// Mapping from Order Guide product names to our ingredient names + pricing data
// Extracted from MASTER ORDER GUIDE - Palo Alto tab
const INGREDIENT_UPDATES: {
  orderGuideName: string;
  matchNames: string[];
  vendor: string;
  bottleSizeMl: number;
  costDollars: number;
  category: string;
  type?: string;
}[] = [
  // === SPIRITS USED IN CRAFT COCKTAILS ===
  { orderGuideName: "Haku Vodka", matchNames: ["Haku Vodka"], vendor: "SWS", bottleSizeMl: 1000, costDollars: 0, category: "Vodka" },
  { orderGuideName: "Hanson Meyerlemon", matchNames: ["Hanson Meyerlemon Vodka"], vendor: "Regal", bottleSizeMl: 750, costDollars: 0, category: "Vodka" },
  { orderGuideName: "St. George Spiced Pear Liquer", matchNames: ["St George Spiced Pear Liq"], vendor: "Skurnik", bottleSizeMl: 750, costDollars: 24.50, category: "Cordial" },
  { orderGuideName: "Sazerac 100 Proof", matchNames: ["Sazerac 100 Proof RYE"], vendor: "Golden Brands", bottleSizeMl: 1000, costDollars: 21.17, category: "RYE" },
  { orderGuideName: "Chambord", matchNames: ["Chambord"], vendor: "Golden Brands", bottleSizeMl: 700, costDollars: 29.72, category: "Cordial" },
  { orderGuideName: "Efe Green Raki", matchNames: ["Efe Green Raki"], vendor: "Kalara", bottleSizeMl: 700, costDollars: 0, category: "Raki" },
  { orderGuideName: "Hangar Vodka (well)", matchNames: ["Well Vodka"], vendor: "Breakthrough", bottleSizeMl: 1000, costDollars: 16.00, category: "Vodka" },
  { orderGuideName: "El Tosoro Blanco", matchNames: ["El Tosoro Blanco Tequila"], vendor: "SWS", bottleSizeMl: 750, costDollars: 36.38, category: "Tequila" },
  { orderGuideName: "Pama Pomegranate Liquer", matchNames: ["Pama Pomegranate Liq"], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Cordial" },
  { orderGuideName: "Amaro Nonino", matchNames: ["Amaro Nonino"], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Cordial" },
  { orderGuideName: "Sipsmith GIN", matchNames: ["Sipsmith Gin"], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Gin" },
  { orderGuideName: "Carpano Antica Sweet Vermouth", matchNames: ["Carpano Antica Sweet Vermouth", "Carpano Antica Sweet Vermouth"], vendor: "Golden Brands", bottleSizeMl: 1000, costDollars: 32.00, category: "Cordial" },
  { orderGuideName: "Fugit Gran Classico Bitter", matchNames: ["Fugit Gran Classico"], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 28.33, category: "Cordial" },
  { orderGuideName: "Madre Espadin", matchNames: ["Madre Mezcal"], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 33.50, category: "Mezcal" },
  { orderGuideName: "Aperol", matchNames: ["Aperol"], vendor: "SWS", bottleSizeMl: 1000, costDollars: 28.50, category: "Cordial" },
  { orderGuideName: "Mozart Dark Chocolate Liq.", matchNames: ["Mozart Dark Chocolate Liq"], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Cordial" },
  { orderGuideName: "Cointreau", matchNames: ["Cointreau"], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Cordial" },
  { orderGuideName: "Monkey 47", matchNames: ["Monkey 47 Gin"], vendor: "SWS", bottleSizeMl: 1000, costDollars: 54.00, category: "Gin" },
  { orderGuideName: "Lillet Blanc", matchNames: ["Lillet Blanc"], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Cordial" },
  { orderGuideName: "Bar Hill Gin", matchNames: ["Well Gin"], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 28.75, category: "Gin" },
  { orderGuideName: "Lapostelle Pisco XO", matchNames: ["Lapostelle XO Pisco"], vendor: "Winebow", bottleSizeMl: 750, costDollars: 0, category: "Pisco" },
  { orderGuideName: "Whistlepig Piggy Back 6yr RYE", matchNames: ["Whistle Pig Piggy Back 6yr RYE"], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "RYE" },
  { orderGuideName: "Seedlip Spice", matchNames: ["Seedlip Spice"], vendor: "SWS", bottleSizeMl: 700, costDollars: 22.50, category: "NA" },
  { orderGuideName: "Disaronno Amaretto", matchNames: ["Amaretto"], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 37.49, category: "Cordial" },
  { orderGuideName: "Campari", matchNames: ["Campari"], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Cordial" },

  // === MIXERS & GROCERY ===
  { orderGuideName: "Fever Tree Mediterranean Tonic", matchNames: ["Fever Tree Mediterranean Tonic"], vendor: "Golden Brands", bottleSizeMl: 200, costDollars: 0.90, category: "Grocery" },
  { orderGuideName: "Fever Tree Ginger Beer", matchNames: ["Ginger Beer"], vendor: "Golden Brands", bottleSizeMl: 200, costDollars: 0.90, category: "Grocery" },

  // === BITTERS ===
  { orderGuideName: "Scrappys Lavender Bitter", matchNames: ["Lavender Bitters"], vendor: "Willow Market", bottleSizeMl: 200, costDollars: 0, category: "Bitter" },
  { orderGuideName: "Scrappys Chocolate Bitter", matchNames: ["Scrappy's Chocolate Bitter"], vendor: "Willow Market", bottleSizeMl: 200, costDollars: 0, category: "Bitter" },
  { orderGuideName: "Angostura Bitter", matchNames: ["Angostura Bitter", "Angusturo Bitter"], vendor: "SWS", bottleSizeMl: 500, costDollars: 0, category: "Bitter" },

  // === CLASSIC COCKTAIL SPIRITS ===
  { orderGuideName: "Ketel One", matchNames: ["Desired Vodka"], vendor: "SWS", bottleSizeMl: 1000, costDollars: 31.25, category: "Vodka" },
  { orderGuideName: "Sweet Vermouth", matchNames: ["Sweet Vermouth"], vendor: "Golden Brands", bottleSizeMl: 1000, costDollars: 32.00, category: "Cordial" },
  { orderGuideName: "Accompani Flora Green", matchNames: ["Accompani Flora Green"], vendor: "SPBD", bottleSizeMl: 750, costDollars: 0, category: "Cordial" },

  // === ADDITIONAL SPIRITS FROM ORDER GUIDE (not in recipes yet) ===
  { orderGuideName: "Blanton", matchNames: [], vendor: "Golden Brands", bottleSizeMl: 750, costDollars: 62.00, category: "Bourbon", type: "LIQUID" },
  { orderGuideName: "Fernet Branca", matchNames: [], vendor: "Golden Brands", bottleSizeMl: 750, costDollars: 31.26, category: "Cordial", type: "LIQUID" },
  { orderGuideName: "Glenfiddich 21yr", matchNames: [], vendor: "Golden Brands", bottleSizeMl: 750, costDollars: 186.33, category: "Scotch", type: "LIQUID" },
  { orderGuideName: "The Balvenie 12yr", matchNames: [], vendor: "Golden Brands", bottleSizeMl: 750, costDollars: 60.85, category: "Scotch", type: "LIQUID" },
  { orderGuideName: "St. Germain Elderflower Liqueur", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 33.29, category: "Cordial", type: "LIQUID" },
  { orderGuideName: "Macallan 12yr Sherry Oak", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 82.02, category: "Scotch", type: "LIQUID" },
  { orderGuideName: "Yamazaki 12yr", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 142.49, category: "Whiskey", type: "LIQUID" },
  { orderGuideName: "Don Fulano Anejo", matchNames: [], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 68.13, category: "Tequila", type: "LIQUID" },
  { orderGuideName: "Don Fulano Blanco", matchNames: [], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 42.80, category: "Tequila", type: "LIQUID" },
  { orderGuideName: "Don Fulano Repo", matchNames: [], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 49.47, category: "Tequila", type: "LIQUID" },
  { orderGuideName: "Fortaleza Blanco", matchNames: [], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 46.80, category: "Tequila", type: "LIQUID" },
  { orderGuideName: "Fortaleza Reposado", matchNames: [], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 54.80, category: "Tequila", type: "LIQUID" },
  { orderGuideName: "Fortaleza Anejo", matchNames: [], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 79.80, category: "Tequila", type: "LIQUID" },
  { orderGuideName: "Arette Blanco", matchNames: [], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 24.00, category: "Tequila", type: "LIQUID" },
  { orderGuideName: "Woodford Reserve", matchNames: [], vendor: "Golden Brands", bottleSizeMl: 1000, costDollars: 35.28, category: "Bourbon", type: "LIQUID" },
  { orderGuideName: "Buffalo Trace", matchNames: [], vendor: "Golden Brands", bottleSizeMl: 1000, costDollars: 23.31, category: "Bourbon", type: "LIQUID" },
  { orderGuideName: "Bulleit Bourbon", matchNames: [], vendor: "SWS", bottleSizeMl: 1000, costDollars: 32.67, category: "Bourbon", type: "LIQUID" },
  { orderGuideName: "Makers Mark", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Bourbon", type: "LIQUID" },
  { orderGuideName: "Basil Hayden", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Bourbon", type: "LIQUID" },
  { orderGuideName: "Angels Envy", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Bourbon", type: "LIQUID" },
  { orderGuideName: "Elijah Craig Bourbon", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Bourbon", type: "LIQUID" },
  { orderGuideName: "Hendricks Gin", matchNames: [], vendor: "Golden Brands", bottleSizeMl: 1000, costDollars: 45.50, category: "Gin", type: "LIQUID" },
  { orderGuideName: "Botanist Dry Gin", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Gin", type: "LIQUID" },
  { orderGuideName: "Tanqueray Gin", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Gin", type: "LIQUID" },
  { orderGuideName: "Bombay Sapphire", matchNames: [], vendor: "SWS", bottleSizeMl: 1000, costDollars: 33.17, category: "Gin", type: "LIQUID" },
  { orderGuideName: "Hennessy VSOP", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Cognac", type: "LIQUID" },
  { orderGuideName: "Hennessy XO", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "Cognac", type: "LIQUID" },
  { orderGuideName: "Chopin Potato Vodka", matchNames: [], vendor: "Breakthrough", bottleSizeMl: 1000, costDollars: 27.69, category: "Vodka", type: "LIQUID" },
  { orderGuideName: "Ketel One Vodka", matchNames: [], vendor: "SWS", bottleSizeMl: 1000, costDollars: 31.25, category: "Vodka", type: "LIQUID" },
  { orderGuideName: "Knob Creek RYE 7yr", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "RYE", type: "LIQUID" },
  { orderGuideName: "Whistlepig Small Batch 10yr RYE", matchNames: [], vendor: "SWS", bottleSizeMl: 750, costDollars: 0, category: "RYE", type: "LIQUID" },
  { orderGuideName: "Bulleit RYE", matchNames: [], vendor: "SWS", bottleSizeMl: 1000, costDollars: 32.67, category: "RYE", type: "LIQUID" },
  { orderGuideName: "Redemption High RYE", matchNames: [], vendor: "SWS", bottleSizeMl: 1000, costDollars: 25.26, category: "RYE", type: "LIQUID" },
  { orderGuideName: "Drambuie", matchNames: [], vendor: "Golden Brands", bottleSizeMl: 1000, costDollars: 41.67, category: "Cordial", type: "LIQUID" },
  { orderGuideName: "Glenfiddich 12yr", matchNames: [], vendor: "Golden Brands", bottleSizeMl: 1000, costDollars: 49.25, category: "Scotch", type: "LIQUID" },
  { orderGuideName: "Graham's 20yr Tawny", matchNames: [], vendor: "Breakthrough", bottleSizeMl: 750, costDollars: 53.30, category: "Dessert", type: "LIQUID" },
];

async function main() {
  console.log("Updating ingredient prices from Order Guide...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) { console.error("Organization not found!"); return; }

  let updated = 0;
  let created = 0;

  for (const item of INGREDIENT_UPDATES) {
    // Try to match existing ingredients
    if (item.matchNames.length > 0) {
      for (const matchName of item.matchNames) {
        const existing = await prisma.ingredient.findUnique({
          where: { organizationId_name: { organizationId: org.id, name: matchName } },
        });
        if (existing) {
          const updateData: any = {
            vendor: item.vendor,
            bottleSizeMl: item.bottleSizeMl,
            ingredientCategory: item.category,
          };
          if (item.costDollars > 0) {
            updateData.bottleCostCents = Math.round(item.costDollars * 100);
          }
          await prisma.ingredient.update({
            where: { id: existing.id },
            data: updateData,
          });
          console.log(`  Updated: ${matchName} (${item.vendor}, ${item.bottleSizeMl}ml, $${item.costDollars || 'no price'})`);
          updated++;
        }
      }
    }

    // Create new ingredient if it has no match names (additional spirits)
    if (item.matchNames.length === 0) {
      const existing = await prisma.ingredient.findUnique({
        where: { organizationId_name: { organizationId: org.id, name: item.orderGuideName } },
      });
      if (!existing) {
        await prisma.ingredient.create({
          data: {
            organizationId: org.id,
            name: item.orderGuideName,
            type: item.type || "LIQUID",
            vendor: item.vendor,
            bottleSizeMl: item.bottleSizeMl,
            bottleCostCents: item.costDollars > 0 ? Math.round(item.costDollars * 100) : null,
            ingredientCategory: item.category,
          },
        });
        console.log(`  Created: ${item.orderGuideName} (${item.vendor}, ${item.bottleSizeMl}ml, $${item.costDollars || 'no price'})`);
        created++;
      } else {
        // Update if exists but from a previous run
        const updateData: any = {
          vendor: item.vendor,
          bottleSizeMl: item.bottleSizeMl,
          ingredientCategory: item.category,
        };
        if (item.costDollars > 0) {
          updateData.bottleCostCents = Math.round(item.costDollars * 100);
        }
        await prisma.ingredient.update({ where: { id: existing.id }, data: updateData });
        console.log(`  Updated: ${item.orderGuideName} (already existed)`);
        updated++;
      }
    }
  }

  console.log(`\nDone! Updated: ${updated}, Created: ${created}`);

  // Print summary of ingredients with costs
  const allIngredients = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
    orderBy: { name: "asc" },
  });
  const withCost = allIngredients.filter(i => i.bottleCostCents && i.bottleCostCents > 0);
  console.log(`\nTotal ingredients: ${allIngredients.length}`);
  console.log(`With pricing: ${withCost.length}`);
  console.log(`Without pricing: ${allIngredients.length - withCost.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
