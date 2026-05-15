import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;
  const cats = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true, ingredientCategory: { not: null } },
    select: { ingredientCategory: true },
  });
  const counts: Record<string, number> = {};
  for (const c of cats) {
    const cat = c.ingredientCategory!;
    counts[cat] = (counts[cat] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [cat, count] of sorted) {
    console.log(`${cat.padEnd(30)} ${count} products`);
  }
  console.log(`\nTotal: ${sorted.length} categories`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
