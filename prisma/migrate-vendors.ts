import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Migrating vendor strings to Vendor records...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) {
    console.error("Organization not found");
    return;
  }

  // Find all distinct vendor strings from ingredients
  const ingredients = await prisma.ingredient.findMany({
    where: { organizationId: org.id, vendor: { not: null } },
    select: { id: true, vendor: true },
  });

  const uniqueVendors = [...new Set(ingredients.map((i) => i.vendor!.trim()).filter(Boolean))];
  console.log(`Found ${uniqueVendors.length} unique vendor names\n`);

  // Create Vendor records
  const vendorMap = new Map<string, string>();
  for (const vendorName of uniqueVendors) {
    const existing = await prisma.vendor.findUnique({
      where: { organizationId_name: { organizationId: org.id, name: vendorName } },
    });
    if (existing) {
      vendorMap.set(vendorName, existing.id);
      continue;
    }
    const vendor = await prisma.vendor.create({
      data: {
        organizationId: org.id,
        name: vendorName,
      },
    });
    vendorMap.set(vendorName, vendor.id);
    console.log(`  Created vendor: ${vendorName}`);
  }

  // Link ingredients to vendor records
  console.log("\nLinking ingredients to vendors...");
  let linked = 0;
  for (const ing of ingredients) {
    const vendorId = vendorMap.get(ing.vendor!.trim());
    if (vendorId) {
      await prisma.ingredient.update({
        where: { id: ing.id },
        data: { vendorId },
      });
      linked++;
    }
  }

  console.log(`\nDone! Linked ${linked} ingredients to ${uniqueVendors.length} vendors.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
