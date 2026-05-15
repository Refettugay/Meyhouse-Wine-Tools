import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Setting test stock levels for Palo Alto...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const paLocation = await prisma.location.findFirst({
    where: { organizationId: org.id, name: { contains: "Palo Alto" } },
  });
  if (!paLocation) {
    console.log("Palo Alto location not found");
    return;
  }

  // Get all inventory items at PA
  const items = await prisma.inventoryItem.findMany({
    where: { locationId: paLocation.id },
    include: { ingredient: true },
    take: 50,
  });

  console.log(`Setting stock levels for ${items.length} items...\n`);

  // Set realistic stock levels (simulating a previous count)
  let updated = 0;
  for (const item of items) {
    // Give each item a random stock level between 0 and par+2
    const maxStock = Math.max(item.parLevel + 2, 5);
    const stock = Math.round(Math.random() * maxStock * 2) / 2; // random, rounded to 0.5

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        currentStock: stock,
        lastCountedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
      },
    });

    // Also create a stock count record (simulating last week's count)
    await prisma.stockCount.create({
      data: {
        inventoryItemId: item.id,
        count: stock,
        countedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    });

    console.log(`  ${item.ingredient.name.padEnd(40)} → stock: ${stock}, par: ${item.parLevel}`);
    updated++;
  }

  console.log(`\nDone! Updated ${updated} items with test stock levels.`);
  console.log("Now go to Products → Inventory → Meyhouse Palo Alto and try counting!");
  console.log("Enter numbers different from 'Previous' to see variance in units, $, and %.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
