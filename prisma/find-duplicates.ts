import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\$\s*\d+(\.\d+)?/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[""'']/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(the|a|an|de|di|la|le|el|des|du|von|van)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 1);
}

function signature(name: string): string {
  return tokenize(name).sort().join(" ");
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "meyhouse" } });
  if (!org) return;

  const all = await prisma.ingredient.findMany({
    where: { organizationId: org.id, isActive: true },
    include: {
      _count: {
        select: {
          recipeIngredients: true,
          inventoryItems: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Group by tokenized signature
  const groups = new Map<string, typeof all>();
  for (const ing of all) {
    const sig = signature(ing.name);
    if (!sig) continue;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(ing);
  }

  const duplicates = [...groups.values()].filter((g) => g.length > 1);

  console.log(`Total products: ${all.length}`);
  console.log(`Duplicate groups: ${duplicates.length}`);
  console.log(`Total duplicates: ${duplicates.reduce((sum, g) => sum + g.length, 0)}\n`);

  console.log("=== DUPLICATE GROUPS ===\n");
  for (const group of duplicates) {
    console.log(`Group (${group.length} items):`);
    for (const ing of group) {
      const priceStr = ing.bottleCostCents
        ? `$${(ing.bottleCostCents / 100).toFixed(2)}`
        : "—";
      const sizeStr = ing.bottleSizeMl ? `${ing.bottleSizeMl}ml` : "—";
      console.log(
        `  • ${ing.name.padEnd(50)} | ${priceStr.padStart(8)} | ${sizeStr.padStart(7)} | recipes:${ing._count.recipeIngredients} inv:${ing._count.inventoryItems}`
      );
    }
    console.log();
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
