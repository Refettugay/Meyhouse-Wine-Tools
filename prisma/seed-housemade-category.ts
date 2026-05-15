import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const existing = await prisma.category.findUnique({
    where: { organizationId_name: { organizationId: org.id, name: "House-Made Bar Ingredients" } },
  });

  if (existing) {
    console.log("Category already exists");
    return;
  }

  const maxOrder = await prisma.category.findFirst({
    where: { organizationId: org.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.category.create({
    data: {
      organizationId: org.id,
      name: "House-Made Bar Ingredients",
      sortOrder: (maxOrder?.sortOrder || 0) + 1,
      defaultCostTargetPct: null, // cost comes from sub-recipe, no target needed
    },
  });

  console.log("Created 'House-Made Bar Ingredients' category");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
