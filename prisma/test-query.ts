import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function test() {
  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  console.log("Org:", org?.id);

  try {
    const locations = await prisma.location.findMany({
      where: { organizationId: org!.id },
      orderBy: { sortOrder: "asc" },
      include: {
        inventoryItems: {
          include: { ingredient: true },
        },
      },
    });
    console.log("Locations found:", locations.length);
    console.log("First location items:", locations[0]?.inventoryItems.length);
  } catch (e: any) {
    console.error("ERROR:", e.message);
  }

  await prisma.$disconnect();
}

test();
