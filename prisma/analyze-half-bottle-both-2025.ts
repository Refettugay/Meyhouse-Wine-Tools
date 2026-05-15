import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as fs from "fs";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const PA_CSV = "C:\\Users\\refet\\OneDrive\\Desktop\\Ordering Guide V2\\Meyhouse Data Files\\PALO ALTO - ProductMix_2025-01-01_2025-12-31 (1)\\All levels.csv";
const SV_CSV = "C:\\Users\\refet\\OneDrive\\Desktop\\Ordering Guide V2\\Meyhouse Data Files\\Sunnyvale ProductMix_2025-01-01_2025-12-31 (1)\\All levels.csv";

type PmixRow = { item: string; qty: number; netSales: number; avgPrice: number };

// Normalize item names so "Cht. Musar" == "Chateau Musar", etc.
function normalizeName(raw: string): string {
  return raw
    // Strip half-bottle prefixes
    .replace(/^1\/2 BTL (WHITE|RED|SPARKLING)\s*/i, "")
    .replace(/^375\s*/i, "")
    // Expand common abbreviations
    .replace(/\bCht\.?/gi, "Chateau")
    .replace(/\bCH\.?/gi, "Chateau")
    // Standard typo fixes
    .replace(/Tiganello/gi, "Tignanello")
    .replace(/La Scola/gi, "La Scolca")
    .replace(/Sancere/gi, "Sancerre")
    .replace(/Barberesco/gi, "Barbaresco")
    .replace(/Di Grey|Di Gresy/gi, "Di Gresy")
    // Short form
    .replace(/Chardonnay/gi, "Chardonnay")
    .replace(/Chard\b/gi, "Chardonnay")
    .replace(/Brut Rose|Brut ROSE/gi, "Brut Rose")
    // Strip punctuation/extra spaces
    .replace(/[,.]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (const c of line) {
    if (c === '"') inQ = !inQ;
    else if (c === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ""));
}

function loadHalfBottles(csvPath: string): Map<string, { qty: number; netSales: number; avgMenuPrice: number }> {
  const lines = fs.readFileSync(csvPath, "utf8").split(/\r?\n/);
  const raw: PmixRow[] = [];
  for (const line of lines) {
    if (!line) continue;
    // PA uses "HALF BOTTLES", SV uses "1/2 BOTTLE WINES" under BOTTLE WINE menu.
    // Exclude Raki half bottles and "(Copy)" entries.
    const looksLikeHalf =
      (line.startsWith("menuItem,BOTTLE WINE,HALF BOTTLES,") ||
        line.startsWith("menuItem,BOTTLE WINE,1/2 BOTTLE WINES,")) &&
      !line.includes("(Copy)");
    if (!looksLikeHalf) continue;
    const cols = parseCsv(line);
    if (cols[0] !== "menuItem") continue;
    const item = cols[4];
    const qty = parseFloat(cols[8] || "0");
    const avgPrice = parseFloat(cols[9] || "0");
    const net = parseFloat(cols[15] || "0");
    raw.push({ item, qty, netSales: net, avgPrice });
  }
  // aggregate by cleaned + normalized name
  const byName = new Map<string, { qty: number; netSales: number; avgMenuPrice: number }>();
  for (const r of raw) {
    const key = normalizeName(r.item);
    if (!byName.has(key)) byName.set(key, { qty: 0, netSales: 0, avgMenuPrice: 0 });
    const agg = byName.get(key)!;
    agg.qty += r.qty;
    agg.netSales += r.netSales;
  }
  for (const [, agg] of byName) {
    agg.avgMenuPrice = agg.qty > 0 ? agg.netSales / agg.qty : 0;
  }
  return byName;
}

async function findCost(name: string): Promise<{ costCents: number | null; dbName: string | null }> {
  // Strict: match on first significant word AND bottleSizeMl=375
  const tokens = name.split(/\s+/).filter((w) => w.length > 3);
  for (const t of [...tokens, name.split(" ")[0]]) {
    const match = await prisma.ingredient.findFirst({
      where: {
        productType: "WINE",
        bottleSizeMl: 375,
        name: { contains: t },
      },
      select: { name: true, bottleCostCents: true },
    });
    if (match && match.bottleCostCents) return { costCents: match.bottleCostCents, dbName: match.name };
  }
  return { costCents: null, dbName: null };
}

function velocityFor(qty: number): "Fast" | "Medium" | "Slow" | "Dormant" {
  if (qty >= 24) return "Fast";
  if (qty >= 8) return "Medium";
  if (qty >= 2) return "Slow";
  return "Dormant";
}

async function buildReport(label: string, map: Map<string, { qty: number; netSales: number; avgMenuPrice: number }>) {
  const sorted = Array.from(map.entries()).sort((a, b) => b[1].qty - a[1].qty);
  type Row = {
    item: string;
    qty: number;
    avgMenuPrice: number;
    netSales: number;
    costCents: number | null;
    annualProfit: number | null;
    actualCostPct: number | null;
    velocity: ReturnType<typeof velocityFor>;
  };
  const report: Row[] = [];
  for (const [name, agg] of sorted) {
    const { costCents } = await findCost(name);
    const annualProfit = costCents !== null ? agg.netSales - (costCents * agg.qty) / 100 : null;
    const actualCostPct = costCents !== null && agg.avgMenuPrice > 0 ? (costCents / (agg.avgMenuPrice * 100)) * 100 : null;
    report.push({
      item: name,
      qty: agg.qty,
      avgMenuPrice: agg.avgMenuPrice,
      netSales: agg.netSales,
      costCents,
      annualProfit,
      actualCostPct,
      velocity: velocityFor(agg.qty),
    });
  }
  return report;
}

function printReport(label: string, report: Awaited<ReturnType<typeof buildReport>>) {
  const pad = (s: string, w: number) => s.padEnd(w);
  const padR = (s: string, w: number) => s.padStart(w);

  console.log(`\n${"=".repeat(100)}`);
  console.log(` ${label} — HALF BOTTLES 2025`);
  console.log("=".repeat(100));
  console.log(
    pad("Wine", 36) +
      padR("Sold", 6) +
      padR("Avg $", 8) +
      padR("Net $", 9) +
      padR("Cost $", 9) +
      padR("Profit", 9) +
      padR("Cost%", 8) +
      padR("Velocity", 10)
  );
  console.log("-".repeat(100));

  let totalQty = 0, totalRev = 0, totalProfit = 0, costMatched = 0;
  for (const r of report) {
    totalQty += r.qty;
    totalRev += r.netSales;
    if (r.costCents !== null) {
      totalProfit += r.annualProfit || 0;
      costMatched++;
    }
    console.log(
      pad(r.item.substring(0, 35), 36) +
        padR(r.qty.toFixed(0), 6) +
        padR("$" + r.avgMenuPrice.toFixed(0), 8) +
        padR("$" + r.netSales.toFixed(0), 9) +
        padR(r.costCents ? "$" + (r.costCents / 100).toFixed(2) : "?", 9) +
        padR(r.annualProfit !== null ? "$" + r.annualProfit.toFixed(0) : "?", 9) +
        padR(r.actualCostPct !== null ? r.actualCostPct.toFixed(0) + "%" : "?", 8) +
        padR(r.velocity, 10)
    );
  }

  console.log("-".repeat(100));
  console.log(
    pad(`TOTAL (${report.length} items, matched ${costMatched})`, 36) +
      padR(totalQty.toFixed(0), 6) +
      padR("", 17) +
      padR("$" + totalRev.toFixed(0), 9) +
      padR("", 0) +
      padR("$" + totalProfit.toFixed(0), 9)
  );

  // Velocity distribution
  const fast = report.filter((r) => r.velocity === "Fast");
  const med = report.filter((r) => r.velocity === "Medium");
  const slow = report.filter((r) => r.velocity === "Slow");
  const dormant = report.filter((r) => r.velocity === "Dormant");

  const sumQty = (arr: typeof report) => arr.reduce((s, r) => s + r.qty, 0);
  const sumProfit = (arr: typeof report) => arr.reduce((s, r) => s + (r.annualProfit || 0), 0);
  const avgCostPct = (arr: typeof report) => {
    const withCost = arr.filter((r) => r.actualCostPct !== null);
    if (withCost.length === 0) return 0;
    return withCost.reduce((s, r) => s + r.actualCostPct!, 0) / withCost.length;
  };

  console.log(`\n  Fast (24+):    ${fast.length.toString().padStart(2)} items | ${sumQty(fast).toString().padStart(3)} sold | $${sumProfit(fast).toFixed(0).padStart(5)} profit | avg cost ${avgCostPct(fast).toFixed(0)}%`);
  console.log(`  Medium (8-23): ${med.length.toString().padStart(2)} items | ${sumQty(med).toString().padStart(3)} sold | $${sumProfit(med).toFixed(0).padStart(5)} profit | avg cost ${avgCostPct(med).toFixed(0)}%`);
  console.log(`  Slow (2-7):    ${slow.length.toString().padStart(2)} items | ${sumQty(slow).toString().padStart(3)} sold | $${sumProfit(slow).toFixed(0).padStart(5)} profit | avg cost ${avgCostPct(slow).toFixed(0)}%`);
  console.log(`  Dormant (<2):  ${dormant.length.toString().padStart(2)} items | ${sumQty(dormant).toString().padStart(3)} sold | $${sumProfit(dormant).toFixed(0).padStart(5)} profit | avg cost ${avgCostPct(dormant).toFixed(0)}%`);
}

async function main() {
  const paMap = loadHalfBottles(PA_CSV);
  const svMap = loadHalfBottles(SV_CSV);

  const paReport = await buildReport("PA", paMap);
  const svReport = await buildReport("SV", svMap);

  printReport("PALO ALTO", paReport);
  printReport("SUNNYVALE", svReport);

  // --- Side by side comparison ---
  console.log(`\n${"=".repeat(100)}`);
  console.log(" SIDE-BY-SIDE — WINES ON BOTH LOCATIONS");
  console.log("=".repeat(100));
  const paNames = new Set(paReport.map((r) => r.item));
  const svNames = new Set(svReport.map((r) => r.item));
  const common: string[] = [];
  for (const n of paNames) if (svNames.has(n)) common.push(n);

  const pad = (s: string, w: number) => s.padEnd(w);
  const padR = (s: string, w: number) => s.padStart(w);

  if (common.length === 0) {
    console.log("  (No exact item-name overlap between PA and SV half bottles)");
  } else {
    console.log(pad("Wine", 36) + padR("PA qty", 8) + padR("PA $/btl", 10) + padR("SV qty", 8) + padR("SV $/btl", 10));
    console.log("-".repeat(100));
    for (const name of common) {
      const pa = paReport.find((r) => r.item === name);
      const sv = svReport.find((r) => r.item === name);
      console.log(
        pad(name.substring(0, 35), 36) +
          padR(pa!.qty.toFixed(0), 8) +
          padR("$" + pa!.avgMenuPrice.toFixed(0), 10) +
          padR(sv!.qty.toFixed(0), 8) +
          padR("$" + sv!.avgMenuPrice.toFixed(0), 10)
      );
    }
  }

  // PA-only and SV-only
  const paOnly = paReport.filter((r) => !svNames.has(r.item));
  const svOnly = svReport.filter((r) => !paNames.has(r.item));
  console.log(`\nPA-only half bottles: ${paOnly.length}`);
  for (const r of paOnly.slice(0, 10))
    console.log(`  - ${r.item} (${r.qty}× at $${r.avgMenuPrice.toFixed(0)})`);
  console.log(`\nSV-only half bottles: ${svOnly.length}`);
  for (const r of svOnly.slice(0, 10))
    console.log(`  - ${r.item} (${r.qty}× at $${r.avgMenuPrice.toFixed(0)})`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
