/**
 * One-shot backfill: set Ingredient.productType for products that are missing
 * it (null or empty). The Pricing Hub filters tabs by productType, so products
 * created before the create/update form set this field were invisible there.
 *
 * productType is derived from each product's ingredientCategory, preferring the
 * org's structured category config and falling back to keyword inference — the
 * exact same logic createProduct/updateProduct now use.
 *
 * Dry run (prints what WOULD change, writes nothing):
 *   npx tsx scripts/backfill-product-type.ts
 * Apply:
 *   npx tsx scripts/backfill-product-type.ts --apply
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  resolveProductType,
  parseCategoriesConfig,
  type CategoriesConfig,
} from "../src/lib/category-types";

const APPLY = process.argv.includes("--apply");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Products missing a productType (null or blank string).
  const missing = await prisma.ingredient.findMany({
    where: {
      OR: [{ productType: null }, { productType: "" }],
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      ingredientCategory: true,
    },
    orderBy: [{ name: "asc" }],
  });

  if (missing.length === 0) {
    console.log("No products are missing productType. Nothing to do.");
    return;
  }

  // Cache each org's category config so we resolve the same way the app does.
  const configCache = new Map<string, CategoriesConfig | null>();
  async function configFor(orgId: string): Promise<CategoriesConfig | null> {
    if (configCache.has(orgId)) return configCache.get(orgId)!;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settingsCategories: true },
    });
    const config = parseCategoriesConfig(org?.settingsCategories);
    configCache.set(orgId, config);
    return config;
  }

  console.log(
    `${missing.length} product(s) missing productType${APPLY ? " — applying:" : " (dry run):"}\n`
  );

  let updated = 0;
  for (const ing of missing) {
    const config = await configFor(ing.organizationId);
    const productType = resolveProductType(ing.ingredientCategory, config);
    console.log(
      `  ${ing.name}  [category: ${ing.ingredientCategory ?? "—"}]  ->  ${productType}`
    );
    if (APPLY) {
      await prisma.ingredient.update({
        where: { id: ing.id },
        data: { productType },
      });
      updated++;
    }
  }

  console.log(
    APPLY
      ? `\nDone. Updated ${updated} product(s).`
      : `\nDry run complete. Re-run with --apply to write these changes.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
