import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Clearing test data...\n");

  // Delete all stock count records (test counts)
  const deletedCounts = await prisma.stockCount.deleteMany({});
  console.log(`Deleted ${deletedCounts.count} stock count records`);

  // Delete all order list items and order lists (test orders)
  const deletedOrderItems = await prisma.orderListItem.deleteMany({});
  console.log(`Deleted ${deletedOrderItems.count} order list items`);

  const deletedOrders = await prisma.orderList.deleteMany({});
  console.log(`Deleted ${deletedOrders.count} order lists`);

  // Reset all inventory items to stock 0, no last counted date
  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (org) {
    const resetItems = await prisma.inventoryItem.updateMany({
      where: { organizationId: org.id },
      data: {
        currentStock: 0,
        lastCountedAt: null,
      },
    });
    console.log(`Reset ${resetItems.count} inventory items to stock: 0`);
  }

  console.log("\nDone! All test data cleared. System is clean.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
