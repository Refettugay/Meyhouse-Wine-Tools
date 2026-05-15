import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Moving GARNISH products to PRODUCE...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const garnishProducts = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true, productType: "GARNISH" },
  });

  console.log(`Found ${garnishProducts.length} GARNISH products to move:`);

  for (const p of garnishProducts) {
    await prisma.ingredient.update({
      where: { id: p.id },
      data: { productType: "PRODUCE" },
    });
    console.log(`  ${p.name}: GARNISH → PRODUCE`);
  }

  console.log("\nDone!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
