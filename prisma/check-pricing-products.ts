import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const all = await prisma.ingredient.findMany({
    select: {
      name: true,
      productType: true,
      isBTG: true,
      isActive: true,
      menuStatus: true,
      bottleCostCents: true,
      bottleSizeMl: true,
    },
  });

  console.log("=================================================");
  console.log("TOTAL INGREDIENTS:", all.length);
  console.log("=================================================\n");

  // Count by productType
  const byType: Record<string, number> = {};
  for (const i of all) {
    const key = i.productType || "(null)";
    byType[key] = (byType[key] || 0) + 1;
  }
  console.log("BY PRODUCT TYPE:");
  for (const [k, v] of Object.entries(byType)) console.log(`  ${k}: ${v}`);

  console.log("\n=================================================");
  console.log("WINE INGREDIENTS (should appear in Wine BTG/BTB):");
  console.log("=================================================");
  const wines = all.filter((i) => i.productType === "WINE");
  console.log(`Found ${wines.length} wines:\n`);
  for (const w of wines) {
    console.log(`  ${w.isBTG ? "🍷 BTG" : "🍾 BTB"} | active=${w.isActive} | status=${w.menuStatus} | ${w.name}`);
  }

  console.log("\n=================================================");
  console.log("SPIRIT INGREDIENTS:");
  console.log("=================================================");
  const spirits = all.filter((i) => i.productType === "SPIRIT");
  console.log(`Found ${spirits.length} spirits\n`);

  console.log("\n=================================================");
  console.log("BEER INGREDIENTS:");
  console.log("=================================================");
  const beers = all.filter((i) => i.productType === "BEER");
  console.log(`Found ${beers.length} beers\n`);

  console.log("\n=================================================");
  console.log("NA BEVERAGE INGREDIENTS:");
  console.log("=================================================");
  const nas = all.filter((i) => i.productType === "NA_BEVERAGE");
  console.log(`Found ${nas.length} NA beverages\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
