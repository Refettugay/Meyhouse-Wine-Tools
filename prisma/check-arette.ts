import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // Check specific products for cleanliness
  const names = ["Arette", "Buffalo", "Carpano", "Hendrick", "Sipsmith", "Hangar", "Monkey 47", "Hanson", "Woodford", "Sazerac"];
  for (const name of names) {
    const results = await prisma.ingredient.findMany({
      where: { name: { contains: name }, isActive: true },
      select: {
        name: true,
        bottleCostCents: true,
        bottleSizeMl: true,
        casePackSize: true,
      },
    });
    console.log(`\n"${name}":`);
    for (const r of results) {
      const price = r.bottleCostCents ? `$${(r.bottleCostCents / 100).toFixed(2)}` : "—";
      console.log(`  ${r.name.padEnd(40)} ${price.padStart(8)} | ${r.bottleSizeMl || "—"}ml | case=${r.casePackSize || "—"}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
