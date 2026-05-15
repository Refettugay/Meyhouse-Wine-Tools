import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, kpiExcludedEmployees: true },
  });

  for (const o of orgs) {
    let list: string[] = [];
    try {
      list = JSON.parse(o.kpiExcludedEmployees || "[]");
    } catch {
      list = [];
    }
    if (!list.includes("Refet Tugay")) {
      list.push("Refet Tugay");
      await prisma.organization.update({
        where: { id: o.id },
        data: { kpiExcludedEmployees: JSON.stringify(list) },
      });
      console.log("Updated org:", o.name, "->", list);
    } else {
      console.log("Already set for:", o.name, "->", list);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
