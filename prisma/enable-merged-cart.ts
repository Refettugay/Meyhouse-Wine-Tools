import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;
  await prisma.organization.update({
    where: { id: org.id },
    data: { useMergedOrderCart: true },
  });
  console.log("Merged Order Cart enabled for Meyhouse");
}
main().catch(console.error).finally(() => prisma.$disconnect());
