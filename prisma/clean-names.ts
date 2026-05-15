import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

function cleanName(name: string): string {
  return name
    .replace(/\$\s*\d+(\.\d+)?/g, "") // remove "$62"
    .replace(/\(.*?\)/g, "") // remove parenthetical notes
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

async function main() {
  console.log("Cleaning up product names...\n");

  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const all = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
  });

  let renamed = 0;
  let skipped = 0;

  for (const ing of all) {
    const cleaned = cleanName(ing.name);
    if (!cleaned) continue;
    if (cleaned === ing.name) continue;

    // Check if another product already has this clean name
    const conflict = await prisma.ingredient.findUnique({
      where: { organizationId_name: { organizationId: org.id, name: cleaned } },
    });

    if (conflict) {
      // Would conflict - skip for now (will be caught by merge pass)
      console.log(`  SKIP: "${ing.name}" → "${cleaned}" (conflict exists)`);
      skipped++;
      continue;
    }

    await prisma.ingredient.update({
      where: { id: ing.id },
      data: { name: cleaned },
    });
    console.log(`  "${ing.name}" → "${cleaned}"`);
    renamed++;
  }

  console.log(`\nRenamed ${renamed}, skipped ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
