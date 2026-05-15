// Minimal seed for Stage A.9: creates a single Meyhouse Organization row so
// requireAuth() can resolve an org id and Beverage's pages render with empty
// data. Tomorrow's full migration (migrate-sqlite-to-postgres.ts) will detect
// this row and upsert the real data on top.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const pg = new PrismaClient({ adapter });

async function main() {
  const existing = await pg.organization.findFirst({ where: { slug: "meyhouse" } });
  if (existing) {
    console.log(`Organization already exists: '${existing.name}' (id=${existing.id}). No-op.`);
    return;
  }
  const org = await pg.organization.create({
    data: {
      name: "Meyhouse",
      slug: "meyhouse",
    },
  });
  console.log(`Seeded Organization: ${org.name} (id=${org.id})`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => {
    pg.$disconnect();
  });
