import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const CSV_PATH = "C:\\Users\\refet\\OneDrive\\Desktop\\Ordering Guide V2\\Meyhouse Data Files\\PALO ALTO - ProductMix_2025-01-01_2025-12-31 (1)\\All levels.csv";

type PmixRow = { item: string; qty: number; netSales: number; avgPrice: number };

function parseCsvValue(line: string): string[] {
  // very small CSV parser — fields don't contain commas, quotes are used for empties
  const out: string[] = [];
  let i = 0, cur = "", inQ = false;
  while (i < line.length) {
    const c = line[i];
    if (c === '"' ) inQ = !inQ;
    else if (c === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
    i++;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ""));
}

// ---- Load PMIX items for HALF BOTTLES group only ----
const lines = fs.readFileSync(CSV_PATH, "utf8").split(/\r?\n/);
const half: PmixRow[] = [];
for (const line of lines) {
  if (!line || !line.startsWith("menuItem,BOTTLE WINE,HALF BOTTLES,")) continue;
  const cols = parseCsvValue(line);
  // Columns: Type, Menu, MenuGroup, Subgroup, Item, SizeMod, Modifiers, Tags, QtySold, AvgPrice, ItemCOGS, Gross, Discount, Refund, Void, Net, COGS, Profit, Margin, Tax, WasteCount, WasteAmt
  const item = cols[4];
  const qty = parseFloat(cols[8] || "0");
  const avgPrice = parseFloat(cols[9] || "0");
  const net = parseFloat(cols[15] || "0");
  half.push({ item, qty, netSales: net, avgPrice });
}

// ---- Aggregate by cleaned name (some items have duplicate rows per price) ----
const byName = new Map<string, { qty: number; netSales: number; prices: Map<number, number> }>();
for (const r of half) {
  const key = r.item
    .replace(/^1\/2 BTL (WHITE|RED|SPARKLING)\s*/i, "")
    .trim();
  if (!byName.has(key)) byName.set(key, { qty: 0, netSales: 0, prices: new Map() });
  const agg = byName.get(key)!;
  agg.qty += r.qty;
  agg.netSales += r.netSales;
  if (r.avgPrice > 0) {
    agg.prices.set(r.avgPrice, (agg.prices.get(r.avgPrice) || 0) + r.qty);
  }
}

// ---- Match to DB for cost lookup ----
async function findCost(cleanedName: string): Promise<{ costCents: number | null; dbName: string | null }> {
  // Strip common cruft
  const candidates = [
    cleanedName,
    cleanedName.replace(/\s+/g, " "),
    cleanedName.split(" ").slice(0, 3).join(" "),
    cleanedName.split(" ").slice(0, 2).join(" "),
  ];

  for (const c of candidates) {
    const match = await prisma.ingredient.findFirst({
      where: {
        productType: "WINE",
        bottleSizeMl: 375,
        name: { contains: c.split(" ")[0] ?? "" },
      },
      select: { name: true, bottleCostCents: true },
    });
    if (match && match.bottleCostCents) return { costCents: match.bottleCostCents, dbName: match.name };
  }

  // fuzzier: try first significant word
  const words = cleanedName.split(/\s+/).filter((w) => w.length > 3);
  for (const w of words) {
    const match = await prisma.ingredient.findFirst({
      where: {
        productType: "WINE",
        bottleSizeMl: 375,
        name: { contains: w },
      },
      select: { name: true, bottleCostCents: true },
    });
    if (match && match.bottleCostCents) return { costCents: match.bottleCostCents, dbName: match.name };
  }
  return { costCents: null, dbName: null };
}

async function main() {
  // Sort by qty sold desc
  const sorted = Array.from(byName.entries()).sort((a, b) => b[1].qty - a[1].qty);

  type Report = {
    item: string;
    qty: number;
    avgMenuPrice: number;
    netSales: number;
    costCents: number | null;
    dbName: string | null;
    annualCogs: number | null;
    annualProfit: number | null;
    actualCostPct: number | null;
    velocity: "Fast" | "Medium" | "Slow" | "Dormant";
  };

  const report: Report[] = [];
  for (const [name, agg] of sorted) {
    const avgMenu = agg.qty > 0 ? agg.netSales / agg.qty : 0;
    const { costCents, dbName } = await findCost(name);
    const annualCogs = costCents !== null ? (costCents * agg.qty) / 100 : null;
    const annualProfit = annualCogs !== null ? agg.netSales - annualCogs : null;
    const actualCostPct =
      costCents !== null && avgMenu > 0 ? (costCents / (avgMenu * 100)) * 100 : null;
    let velocity: Report["velocity"];
    if (agg.qty >= 24) velocity = "Fast";
    else if (agg.qty >= 8) velocity = "Medium";
    else if (agg.qty >= 2) velocity = "Slow";
    else velocity = "Dormant";
    report.push({
      item: name,
      qty: agg.qty,
      avgMenuPrice: avgMenu,
      netSales: agg.netSales,
      costCents,
      dbName,
      annualCogs,
      annualProfit,
      actualCostPct,
      velocity,
    });
  }

  // Summary totals
  let totalQty = 0, totalRev = 0, totalCogs = 0, totalProfit = 0;
  let matchedCount = 0;
  for (const r of report) {
    totalQty += r.qty;
    totalRev += r.netSales;
    if (r.annualCogs !== null) {
      totalCogs += r.annualCogs;
      totalProfit += r.annualProfit!;
      matchedCount++;
    }
  }

  // Output
  console.log("\n================================================================================");
  console.log("PALO ALTO 2025 — HALF BOTTLES ANALYSIS");
  console.log("================================================================================\n");

  const pad = (s: string, w: number) => s.padEnd(w);
  const padR = (s: string, w: number) => s.padStart(w);

  console.log(
    pad("Half Bottle", 38) +
      padR("Sold", 6) +
      padR("Avg $", 8) +
      padR("Net $", 10) +
      padR("Cost $", 9) +
      padR("Profit", 10) +
      padR("Cost %", 9) +
      padR("Velocity", 11)
  );
  console.log("-".repeat(105));

  for (const r of report) {
    console.log(
      pad(r.item.substring(0, 37), 38) +
        padR(r.qty.toFixed(0), 6) +
        padR("$" + r.avgMenuPrice.toFixed(0), 8) +
        padR("$" + r.netSales.toFixed(0), 10) +
        padR(r.costCents !== null ? "$" + (r.costCents / 100).toFixed(2) : "?", 9) +
        padR(r.annualProfit !== null ? "$" + r.annualProfit.toFixed(0) : "?", 10) +
        padR(r.actualCostPct !== null ? r.actualCostPct.toFixed(1) + "%" : "?", 9) +
        padR(r.velocity, 11)
    );
  }

  console.log("-".repeat(105));
  console.log(
    pad(`TOTAL (matched cost for ${matchedCount}/${report.length})`, 38) +
      padR(totalQty.toFixed(0), 6) +
      padR("", 8) +
      padR("$" + totalRev.toFixed(0), 10) +
      padR("$" + totalCogs.toFixed(0), 9) +
      padR("$" + totalProfit.toFixed(0), 10)
  );

  // --- Velocity buckets ---
  console.log("\n================================================================================");
  console.log("VELOCITY BUCKETS");
  console.log("================================================================================");
  const bucket = (v: Report["velocity"]) => report.filter((r) => r.velocity === v);
  const bFast = bucket("Fast");
  const bMed = bucket("Medium");
  const bSlow = bucket("Slow");
  const bDor = bucket("Dormant");

  const sum = (arr: Report[], fn: (r: Report) => number) =>
    arr.reduce((s, r) => s + (fn(r) || 0), 0);

  console.log(`\n⚡ FAST (24+ / year) — ${bFast.length} items`);
  console.log(`   Total qty: ${sum(bFast, (r) => r.qty)}   Net $: ${sum(bFast, (r) => r.netSales).toFixed(0)}   Profit: ${sum(bFast, (r) => r.annualProfit || 0).toFixed(0)}`);
  console.log(`   Avg cost %: ${(sum(bFast, (r) => r.actualCostPct || 0) / Math.max(1, bFast.filter((r) => r.actualCostPct).length)).toFixed(1)}%`);
  for (const r of bFast) console.log(`     - ${r.item} (${r.qty}×, avg $${r.avgMenuPrice.toFixed(0)}, ${r.actualCostPct ? r.actualCostPct.toFixed(0) + "%" : "?"})`);

  console.log(`\n🔶 MEDIUM (8-23 / year) — ${bMed.length} items`);
  console.log(`   Total qty: ${sum(bMed, (r) => r.qty)}   Net $: ${sum(bMed, (r) => r.netSales).toFixed(0)}   Profit: ${sum(bMed, (r) => r.annualProfit || 0).toFixed(0)}`);
  console.log(`   Avg cost %: ${(sum(bMed, (r) => r.actualCostPct || 0) / Math.max(1, bMed.filter((r) => r.actualCostPct).length)).toFixed(1)}%`);
  for (const r of bMed) console.log(`     - ${r.item} (${r.qty}×, avg $${r.avgMenuPrice.toFixed(0)}, ${r.actualCostPct ? r.actualCostPct.toFixed(0) + "%" : "?"})`);

  console.log(`\n🐌 SLOW (2-7 / year) — ${bSlow.length} items`);
  console.log(`   Total qty: ${sum(bSlow, (r) => r.qty)}   Net $: ${sum(bSlow, (r) => r.netSales).toFixed(0)}   Profit: ${sum(bSlow, (r) => r.annualProfit || 0).toFixed(0)}`);
  console.log(`   Avg cost %: ${(sum(bSlow, (r) => r.actualCostPct || 0) / Math.max(1, bSlow.filter((r) => r.actualCostPct).length)).toFixed(1)}%`);
  for (const r of bSlow) console.log(`     - ${r.item} (${r.qty}×, avg $${r.avgMenuPrice.toFixed(0)}, ${r.actualCostPct ? r.actualCostPct.toFixed(0) + "%" : "?"})`);

  console.log(`\n🪦 DORMANT (<2 / year) — ${bDor.length} items`);
  for (const r of bDor) console.log(`     - ${r.item} (${r.qty}×, avg $${r.avgMenuPrice.toFixed(0)}, ${r.actualCostPct ? r.actualCostPct.toFixed(0) + "%" : "?"})`);

  // Missing costs
  const missing = report.filter((r) => r.costCents === null);
  if (missing.length) {
    console.log(`\n⚠ ${missing.length} items have no cost in DB:`);
    for (const m of missing) console.log(`   - ${m.item}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
