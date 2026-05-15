// =============================================================================
// TOAST PMIX CSV PARSER
// =============================================================================
// Parses a Toast "Product Mix" CSV export folder. The folder contains several
// files; we primarily need "All levels.csv" which has the full hierarchy.
//
// Columns in "All levels.csv":
//   Type, Menu, Menu group, Subgroup, Item+open item, Size modifier,
//   Modifiers/special requests, Item tags, Qty sold, Avg. price, Item COGS,
//   Gross sales, Discount amount, Refund amount, Void amount, Net sales,
//   COGS, Gross profit, Gross margin (%), Tax, Waste count, Waste amount
// =============================================================================

export interface ParsedPmixRow {
  type: string;            // "menuItem" or ""  (group rows have type="")
  menu: string;
  menuGroup: string;
  subgroup: string;
  itemName: string;
  sizeModifier: string;
  tags: string;
  qtySold: number;
  avgPrice: number;
  grossCents: number;
  discountCents: number;
  refundCents: number;
  voidCents: number;
  netCents: number;
  taxCents: number;
  // Raw line for debug
  sourceLine: number;
}

// CSV parser that tolerates quoted fields with commas inside
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ""));
}

function toCents(dollars: string | number): number {
  const n = typeof dollars === "string" ? parseFloat(dollars) : dollars;
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

export function parseAllLevelsCsv(content: string): ParsedPmixRow[] {
  const lines = content.split(/\r?\n/);
  const rows: ParsedPmixRow[] = [];
  // Skip empty lines and header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = splitCsvLine(line);
    if (cols.length < 16) continue;
    const row: ParsedPmixRow = {
      type: cols[0],
      menu: cols[1],
      menuGroup: cols[2],
      subgroup: cols[3],
      itemName: cols[4],
      sizeModifier: cols[5],
      tags: cols[7],
      qtySold: parseFloat(cols[8] || "0") || 0,
      avgPrice: parseFloat(cols[9] || "0") || 0,
      grossCents: toCents(cols[11] || "0"),
      discountCents: toCents(cols[12] || "0"),
      refundCents: toCents(cols[13] || "0"),
      voidCents: toCents(cols[14] || "0"),
      netCents: toCents(cols[15] || "0"),
      taxCents: toCents(cols[19] || "0"),
      sourceLine: i + 1,
    };
    rows.push(row);
  }
  return rows;
}

// Only the "menuItem" rows are actual sales of a specific product.
// The group/aggregate rows (type="") are summary rows we use for group totals.
export function getItemSales(rows: ParsedPmixRow[]): ParsedPmixRow[] {
  return rows.filter((r) => r.type === "menuItem" && r.qtySold > 0);
}

export function getMenuGroupSummary(rows: ParsedPmixRow[]): ParsedPmixRow[] {
  return rows.filter((r) => r.type === "" && r.menuGroup && !r.subgroup && r.qtySold > 0);
}
