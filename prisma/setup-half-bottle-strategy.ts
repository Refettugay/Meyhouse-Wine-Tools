import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

// Default Half Bottle configuration — calibrated from Meyhouse real data:
//   Frog's Leap $24 → $81 (3.38x, 30% cost)
//   Accendo     $139 → $287 (2.06x, 48% cost)

const HALF_TIERS = [
  { minCents: 0, maxCents: 1500, targetPct: 28, label: "Entry" },
  { minCents: 1500, maxCents: 2500, targetPct: 30, label: "Sweet spot" },
  { minCents: 2500, maxCents: 4000, targetPct: 33, label: "Core" },
  { minCents: 4000, maxCents: 6000, targetPct: 38, label: "Premium" },
  { minCents: 6000, maxCents: 10000, targetPct: 45, label: "Upper" },
  { minCents: 10000, maxCents: null, targetPct: 50, label: "Prestige" },
];

async function main() {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      pricingStrategies: true,
      pricingTiers: true,
      pricingRounding: true,
    },
  });

  for (const o of orgs) {
    let strategies: Record<string, { type: string }> = {};
    let tiers: Record<string, unknown> = {};
    let rounding: Record<string, string> = {};
    try {
      strategies = JSON.parse(o.pricingStrategies || "{}");
    } catch {}
    try {
      tiers = JSON.parse(o.pricingTiers || "{}");
    } catch {}
    try {
      rounding = JSON.parse(o.pricingRounding || "{}");
    } catch {}

    // Set Wine Half Bottle defaults
    if (!strategies["wine-half"]) {
      strategies["wine-half"] = { type: "hybrid" };
    }
    if (!tiers["wine-half"]) {
      tiers["wine-half"] = HALF_TIERS;
    }
    if (!rounding["wine-half"]) {
      rounding["wine-half"] = "nearest-5";
    }

    await prisma.organization.update({
      where: { id: o.id },
      data: {
        pricingStrategies: JSON.stringify(strategies),
        pricingTiers: JSON.stringify(tiers),
        pricingRounding: JSON.stringify(rounding),
      },
    });
    console.log(`✓ Wine Half Bottle defaults applied to org: ${o.name}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
