import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Seeding full test data for inventory testing...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const paLocation = await prisma.location.findFirst({
    where: { organizationId: org.id, name: { contains: "Palo Alto" } },
  });
  if (!paLocation) {
    console.log("Palo Alto location not found");
    return;
  }

  // Get inventory items with their ingredients
  const items = await prisma.inventoryItem.findMany({
    where: { locationId: paLocation.id, ingredient: { isActive: true, onMenu: true } },
    include: { ingredient: true },
  });

  console.log(`Found ${items.length} inventory items at Palo Alto\n`);

  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let updated = 0;

  for (const item of items) {
    const par = item.parLevel || 2;

    // 1. Previous count (2 weeks ago) — stock was at or near par
    const previousCount = Math.max(0.5, par + Math.round((Math.random() - 0.3) * 2 * 2) / 2);

    // 2. Purchases since last count — some items got restocked
    const wasPurchased = Math.random() > 0.6; // 40% of items got a delivery
    const purchasedQty = wasPurchased ? Math.ceil(Math.random() * par * 1.5) : 0;

    // 3. Simulated POS sales (theoretical usage) — items were sold/used
    const maxUsage = previousCount + purchasedQty;
    const theoreticalUsage = Math.round(Math.random() * maxUsage * 0.7 * 2) / 2; // use ~70% on average

    // 4. Expected stock = previous + purchased - sold
    const expectedStock = Math.max(0, previousCount + purchasedQty - theoreticalUsage);

    // 5. Actual stock = expected + some variance (shrinkage, waste, miscounts)
    // Most items: small variance. Some items: bigger variance (problems)
    let varianceFactor = 0;
    const rand = Math.random();
    if (rand < 0.1) varianceFactor = -Math.ceil(Math.random() * 3); // 10%: big loss
    else if (rand < 0.3) varianceFactor = -Math.round(Math.random() * 1.5 * 2) / 2; // 20%: small loss
    else if (rand < 0.4) varianceFactor = Math.round(Math.random() * 2) / 2; // 10%: small gain (miscount)
    // 60%: zero variance

    const actualStock = Math.max(0, expectedStock + varianceFactor);

    // Set the current stock to the EXPECTED value (what system thinks we have)
    // The user will then "count" and enter the ACTUAL value to see variance
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        currentStock: Math.round(expectedStock * 2) / 2, // system's expected value
        lastCountedAt: twoWeeksAgo,
      },
    });

    // Create the previous count record
    await prisma.stockCount.create({
      data: {
        inventoryItemId: item.id,
        count: previousCount,
        countedAt: twoWeeksAgo,
      },
    });

    // Store the "actual" stock as a hint (we'll show this to the user for testing)
    // We don't store it yet — the user enters it during testing

    if (updated < 30) {
      const varianceStr = varianceFactor !== 0
        ? ` (variance: ${varianceFactor > 0 ? "+" : ""}${varianceFactor})`
        : "";
      console.log(
        `  ${item.ingredient.name.padEnd(35)} prev: ${previousCount.toString().padStart(4)} + purch: ${purchasedQty.toString().padStart(3)} - sold: ${theoreticalUsage.toString().padStart(4)} = expected: ${expectedStock.toFixed(1).padStart(5)} → actual: ${actualStock.toFixed(1).padStart(5)}${varianceStr}`
      );
    }
    updated++;
  }

  if (updated > 30) console.log(`  ... and ${updated - 30} more items`);

  // Create some order records (purchases) to make the data realistic
  const orderList = await prisma.orderList.create({
    data: {
      organizationId: org.id,
      locationId: paLocation.id,
      name: `Palo Alto - Test Order - ${oneWeekAgo.toLocaleDateString()}`,
      status: "RECEIVED",
      countedAt: oneWeekAgo,
      items: {
        create: items
          .filter(() => Math.random() > 0.6) // ~40% of items
          .slice(0, 30)
          .map((item) => ({
            ingredientId: item.ingredientId,
            vendor: item.ingredient.vendor,
            quantityNeeded: Math.ceil(Math.random() * 3),
            unit: "bottle",
            status: "RECEIVED",
          })),
      },
    },
  });

  console.log(`\nCreated test order with items (status: RECEIVED)`);
  console.log(`\n=== TEST INSTRUCTIONS ===`);
  console.log(`1. Go to Products → Inventory tab → select Meyhouse Palo Alto`);
  console.log(`2. "Previous" column shows the system's expected stock`);
  console.log(`3. Enter different numbers in "Count" to simulate counting`);
  console.log(`4. Try entering LESS than Previous to see negative variance (red)`);
  console.log(`5. Try entering MORE than Previous to see positive variance (blue)`);
  console.log(`6. Try entering the SAME as Previous to see zero variance`);
  console.log(`\nDone! ${updated} items updated with test data.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
