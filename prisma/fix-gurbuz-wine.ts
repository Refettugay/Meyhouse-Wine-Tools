import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find Turkish wines wrongly typed as SPIRIT
  const wrong = await prisma.ingredient.findMany({
    where: {
      productType: "SPIRIT",
      OR: [
        { name: { contains: "Gurbuz" } },
        { name: { contains: "Gürbüz" } },
        { ingredientCategory: { contains: "Wine" } },
      ],
    },
    select: { id: true, name: true, productType: true, ingredientCategory: true },
  });

  console.log("Found wrongly typed wines:");
  for (const w of wrong) {
    console.log(`  - ${w.name} | productType=${w.productType} | category=${w.ingredientCategory}`);
  }

  if (wrong.length === 0) {
    console.log("\nNo wines to fix.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nFixing ${wrong.length} ingredient(s) → productType = WINE …`);
  for (const w of wrong) {
    await prisma.ingredient.update({
      where: { id: w.id },
      data: { productType: "WINE", type: "LIQUID" },
    });
    console.log(`  ✓ Fixed: ${w.name}`);
  }

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
