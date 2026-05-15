import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Get all InventoryItems with isBTG=true and their ingredient details
  const btgItems = await prisma.inventoryItem.findMany({
    where: { isBTG: true },
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          productType: true,
          isActive: true,
          menuStatus: true,
          bottleCostCents: true,
          bottleSizeMl: true,
          isBTG: true,
        },
      },
      location: { select: { name: true } },
    },
  });

  console.log("======================================================");
  console.log("ALL InventoryItems marked BTG across all stores:");
  console.log("======================================================");

  const seen = new Set<string>();
  for (const item of btgItems) {
    const i = item.ingredient;
    const key = i.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const eligible =
      i.isActive &&
      (i.menuStatus === "ON_MENU" || i.menuStatus === "DATABASE") &&
      i.productType === "WINE";
    console.log(
      `${eligible ? "✅" : "❌"} [${item.location.name}] ${i.name}`
    );
    console.log(
      `   productType=${i.productType} | active=${i.isActive} | menuStatus=${i.menuStatus} | bottleCost=${
        i.bottleCostCents ? `$${(i.bottleCostCents / 100).toFixed(2)}` : "null"
      } | bottleSize=${i.bottleSizeMl}ml`
    );
    if (!eligible) {
      const reasons: string[] = [];
      if (!i.isActive) reasons.push("NOT active");
      if (i.menuStatus !== "ON_MENU" && i.menuStatus !== "DATABASE")
        reasons.push(`menuStatus=${i.menuStatus} (not ON_MENU/DATABASE)`);
      if (i.productType !== "WINE") reasons.push(`productType=${i.productType} (not WINE)`);
      console.log(`   ⚠ Excluded from Wine BTG because: ${reasons.join(", ")}`);
    }
    console.log("");
  }

  console.log(`Total unique BTG-marked ingredients: ${seen.size}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
