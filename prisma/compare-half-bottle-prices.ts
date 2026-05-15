import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

// The 16 Half Bottles on the Palo Alto menu with their actual menu prices.
const MENU = [
  { name: "Billecart Salmon Brut La Rose", keywords: ["Billecart", "Rose"], menu: 80, type: "Sparkling" },
  { name: "Billecart Salmon Brut La Reserve", keywords: ["Billecart", "Reserve"], menu: 90, type: "Sparkling" },
  { name: "La Scolca Gavi dei Gavi", keywords: ["Scolca"], menu: 40, type: "White" },
  { name: "Patz & Hall Dutton Ranch Chardonnay", keywords: ["Patz", "Dutton"], menu: 49, type: "White" },
  { name: "Comte La Fond Sancerre", keywords: ["Comte", "Sancerre"], menu: 53, type: "White" },
  { name: "Grand Regnard Chablis", keywords: ["Regnard"], menu: 55, type: "White" },
  { name: "Louis Latour Puligny-Montrachet", keywords: ["Latour", "Puligny"], menu: 120, type: "White" },
  { name: "Emeritus Hallberg Ranch Pinot Noir", keywords: ["Emeritus"], menu: 49, type: "Red" },
  { name: "Marchesi Di Gresy Barbaresco Martinenga", keywords: ["Gresy", "Martinenga"], menu: 71, type: "Red" },
  { name: "Chateau Musar Rouge", keywords: ["Musar"], menu: 82, type: "Red" },
  { name: "Pio Cesare Barolo", keywords: ["Pio Cesare", "Barolo"], menu: 82, type: "Red" },
  { name: "Shafer One Point Five Cabernet", keywords: ["Shafer"], menu: 108, type: "Red" },
  { name: "Antinori Tignanello", keywords: ["Tignanello"], menu: 142, type: "Red" },
  { name: "Dom. Louis Latour Chateau Corton Grancey", keywords: ["Grancey"], menu: 186, type: "Red" },
  { name: "Frog's Leap Cabernet", keywords: ["Frog"], menu: 81, type: "Red" },
  { name: "Accendo Cabernet", keywords: ["Accendo"], menu: 278, type: "Red" },
];

// Wine Half Bottle tier table (as seeded in the system)
const TIERS = [
  { minCents: 0, maxCents: 1500, targetPct: 28, label: "Entry" },
  { minCents: 1500, maxCents: 2500, targetPct: 30, label: "Sweet spot" },
  { minCents: 2500, maxCents: 4000, targetPct: 33, label: "Core" },
  { minCents: 4000, maxCents: 6000, targetPct: 38, label: "Premium" },
  { minCents: 6000, maxCents: 10000, targetPct: 45, label: "Upper" },
  { minCents: 10000, maxCents: null as number | null, targetPct: 50, label: "Prestige" },
];

function resolveTier(costCents: number) {
  for (const t of TIERS) {
    if (costCents >= t.minCents && (t.maxCents === null || costCents < t.maxCents)) return t;
  }
  return TIERS[TIERS.length - 1];
}

function roundNearest5(cents: number): number {
  return Math.round(cents / 500) * 500;
}

async function findWine(keywords: string[]) {
  // Must match ALL keywords
  const ands = keywords.map((kw) => ({ name: { contains: kw } }));
  const matches = await prisma.ingredient.findMany({
    where: { AND: ands, productType: "WINE" },
    select: { id: true, name: true, bottleCostCents: true, bottleSizeMl: true, ingredientCategory: true, menuStatus: true },
    take: 5,
  });
  return matches;
}

async function main() {
  console.log("\n================================================================================");
  console.log("HALF BOTTLE PRICE COMPARISON — Palo Alto Dinner Menu (2026-03-26) vs Meyhouse Tier System");
  console.log("================================================================================\n");

  // header
  const pad = (s: string, w: number) => s.padEnd(w);
  const padR = (s: string, w: number) => s.padStart(w);

  console.log(
    pad("Wine", 42) +
      padR("Cost", 9) +
      padR("Tier", 14) +
      padR("Target%", 9) +
      padR("Sys Sug", 10) +
      padR("Actual", 9) +
      padR("Diff", 8) +
      " Reality %"
  );
  console.log("-".repeat(110));

  let totalActual = 0;
  let totalSystem = 0;
  let matchedCount = 0;
  let notFound: string[] = [];

  for (const item of MENU) {
    const candidates = await findWine(item.keywords);
    const halfBottle = candidates.find(
      (c) => c.bottleSizeMl === 375 && (c.ingredientCategory ?? "").toUpperCase().includes("HALF BOTTLE")
    );

    const chosen = halfBottle ?? candidates[0];

    if (!chosen || !chosen.bottleCostCents) {
      notFound.push(item.name);
      console.log(
        pad(item.name, 42) +
          padR("—", 9) +
          padR("—", 14) +
          padR("—", 9) +
          padR("—", 10) +
          padR("$" + item.menu, 9) +
          padR("—", 8) +
          "  (not in DB)"
      );
      continue;
    }

    const costCents = chosen.bottleCostCents;
    const costDollars = costCents / 100;
    const tier = resolveTier(costCents);
    const rawSug = Math.round(costCents / (tier.targetPct / 100));
    const roundedSug = roundNearest5(rawSug);
    const sysDollars = roundedSug / 100;

    const actualMenuCents = item.menu * 100;
    const diff = roundedSug - actualMenuCents;
    const diffPct = ((diff / actualMenuCents) * 100).toFixed(0);
    const realityCostPct = ((costCents / actualMenuCents) * 100).toFixed(1);

    totalActual += item.menu;
    totalSystem += sysDollars;
    matchedCount++;

    const sign = diff >= 0 ? "+" : "";
    console.log(
      pad(item.name.substring(0, 41), 42) +
        padR("$" + costDollars.toFixed(2), 9) +
        padR(tier.label, 14) +
        padR(tier.targetPct + "%", 9) +
        padR("$" + sysDollars.toFixed(0), 10) +
        padR("$" + item.menu, 9) +
        padR(sign + "$" + (diff / 100).toFixed(0) + " (" + sign + diffPct + "%)", 16) +
        "  " +
        realityCostPct +
        "%"
    );
  }

  console.log("-".repeat(110));
  console.log(
    pad("TOTAL (matched " + matchedCount + " of " + MENU.length + ")", 42) +
      padR("", 46) +
      padR("$" + totalSystem.toFixed(0), 10) +
      padR("$" + totalActual, 9)
  );

  if (notFound.length) {
    console.log("\n⚠ Not found in DB (cost missing or wine not in system):");
    for (const n of notFound) console.log("   - " + n);
  }

  console.log("\nTier reference:");
  for (const t of TIERS) {
    const range =
      "$" + (t.minCents / 100).toFixed(0) + "–" + (t.maxCents ? "$" + (t.maxCents / 100).toFixed(0) : "∞");
    const markup = (100 / t.targetPct).toFixed(2);
    console.log(`  ${t.label.padEnd(12)} cost ${range.padEnd(14)} → ${t.targetPct}% target  (${markup}× markup)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
