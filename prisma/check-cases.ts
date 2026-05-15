import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const results = await prisma.ingredient.findMany({
    where: {
      OR: [
        { name: { contains: "Aubert" } },
        { name: { contains: "Chapallet" } },
        { name: { contains: "Chapell" } },
      ],
    },
    select: {
      id: true,
      name: true,
      orderUnit: true,
      casePackSize: true,
    },
  });
  console.log(JSON.stringify(results, null, 2));
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
