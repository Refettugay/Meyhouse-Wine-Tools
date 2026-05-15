import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const byBottle = await prisma.ingredient.count({
    where: { organizationId: org.id, isActive: true, orderUnit: "BOTTLE" },
  });
  const byCase = await prisma.ingredient.count({
    where: { organizationId: org.id, isActive: true, orderUnit: "CASE" },
  });
  const caseWithSize = await prisma.ingredient.count({
    where: {
      organizationId: org.id,
      isActive: true,
      orderUnit: "CASE",
      casePackSize: { not: null, gt: 1 },
    },
  });
  const caseNoSize = await prisma.ingredient.count({
    where: {
      organizationId: org.id,
      isActive: true,
      orderUnit: "CASE",
      OR: [{ casePackSize: null }, { casePackSize: { lte: 1 } }],
    },
  });

  console.log("Summary:");
  console.log(`  Order by bottle: ${byBottle}`);
  console.log(`  Order by case:   ${byCase}`);
  console.log(`    With explicit case size: ${caseWithSize}`);
  console.log(`    Without (default to 12): ${caseNoSize}`);

  // Show first 10 case-ordered products with their sizes
  const samples = await prisma.ingredient.findMany({
    where: {
      organizationId: org.id,
      isActive: true,
      orderUnit: "CASE",
    },
    select: { name: true, casePackSize: true },
    take: 15,
    orderBy: { name: "asc" },
  });
  console.log("\nFirst 15 case-ordered products:");
  for (const s of samples) {
    console.log(`  ${s.name.padEnd(45)} | case: ${s.casePackSize || "12 (default)"}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
