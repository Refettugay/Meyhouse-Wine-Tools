/**
 * One-shot SQLite -> Postgres data migration for Beverage.
 *
 * Reads from prisma/dev.db (untouched) and writes to the `beverage` schema
 * of the Supabase Postgres pointed at by DATABASE_URL.
 *
 * - Skips User/Membership/Invitation (NextAuth-era test users, discarded).
 * - Preserves primary keys exactly so foreign keys resolve naturally.
 * - Coerces SQLite's loose types (0/1 ints, ISO date strings) to Postgres
 *   strict types (boolean, timestamptz).
 * - Does NOT delete dev.db — keep it as backup until Stage D verification.
 *
 * Run with:  npx tsx prisma/migrate-sqlite-to-postgres.ts
 *
 * Pre-req: the beverage schema and tables must already exist in Postgres.
 * Create them with:  npx prisma db push   (run this first)
 */

import "dotenv/config";
import Database from "better-sqlite3";
import { Client } from "pg";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// dev.db actually lives at beverage-management/dev.db (NOT prisma/dev.db —
// that's a zero-byte OneDrive placeholder leftover). __dirname is prisma/,
// so we go up one level.
const SQLITE_PATH = resolve(__dirname, "..", "dev.db");
const SCHEMA = "beverage";

// Per-table column type metadata. SQLite stores booleans as INTEGER (0/1)
// and DateTimes as ISO TEXT; Postgres needs proper boolean / timestamptz.
// Anything not listed here is passed through as-is.
type ColumnTypeMap = Record<string, "boolean" | "datetime">;

const COLUMN_TYPES: Record<string, ColumnTypeMap> = {
  Organization: {
    useMergedOrderCart: "boolean",
    createdAt: "datetime",
    updatedAt: "datetime",
  },
  Unit: {
    canPurchase: "boolean",
    canRecipe: "boolean",
    isActive: "boolean",
    isSystem: "boolean",
  },
  Vendor: {
    createdAt: "datetime",
    updatedAt: "datetime",
  },
  VendorRep: {
    createdAt: "datetime",
  },
  VendorRepLocation: {},
  Category: {},
  Location: {
    createdAt: "datetime",
  },
  StorageArea: {
    createdAt: "datetime",
  },
  Recipe: {
    noBatching: "boolean",
    isArchived: "boolean",
    isSubRecipe: "boolean",
    createdAt: "datetime",
    updatedAt: "datetime",
  },
  Ingredient: {
    isKeyItem: "boolean",
    isHouseMade: "boolean",
    onMenu: "boolean",
    isBTG: "boolean",
    isCraftCocktailIngredient: "boolean",
    isWellSpirit: "boolean",
    isActive: "boolean",
    createdAt: "datetime",
    updatedAt: "datetime",
  },
  RecipeIngredient: {
    isTopOff: "boolean",
  },
  IngredientPrice: {
    isActive: "boolean",
    createdAt: "datetime",
    updatedAt: "datetime",
  },
  ProductSKU: {
    isDefault: "boolean",
    createdAt: "datetime",
    updatedAt: "datetime",
  },
  InventoryItem: {
    isBTG: "boolean",
    isCraftCocktailIngredient: "boolean",
    isWellSpirit: "boolean",
    isHalfBottle: "boolean",
    isDessertWine: "boolean",
    lastCountedAt: "datetime",
    createdAt: "datetime",
    updatedAt: "datetime",
  },
  StockCount: {
    countedAt: "datetime",
  },
  OrderList: {
    countedAt: "datetime",
    createdAt: "datetime",
    updatedAt: "datetime",
  },
  OrderListItem: {},
  OrderEmail: {
    sentAt: "datetime",
    createdAt: "datetime",
  },
  SalesSnapshot: {
    periodStart: "datetime",
    periodEnd: "datetime",
    createdAt: "datetime",
  },
  SalesItemSale: {
    matchUserConfirmed: "boolean",
  },
  SalesMenuGroupSale: {},
};

// Topological order: parents before children. FK constraints in Postgres
// will reject inserts that reference a missing row.
const TABLE_ORDER: string[] = [
  "Organization",
  "Unit",
  "Category",
  "Vendor",
  "Location",
  "StorageArea",
  "VendorRep",
  "VendorRepLocation",
  "Recipe",
  "Ingredient",
  "RecipeIngredient",
  "IngredientPrice",
  "ProductSKU",
  "InventoryItem",
  "StockCount",
  "OrderList",
  "OrderListItem",
  "OrderEmail",
  "SalesSnapshot",
  "SalesItemSale",
  "SalesMenuGroupSale",
];

// Tables explicitly skipped (NextAuth artifacts).
const SKIP_TABLES = new Set(["User", "Membership", "Invitation"]);

function coerceValue(
  raw: unknown,
  type: "boolean" | "datetime" | undefined,
): unknown {
  if (raw === null || raw === undefined) return null;
  if (type === "boolean") {
    // SQLite returns 0 or 1; some columns may already be true/false.
    if (typeof raw === "number") return raw === 1;
    if (typeof raw === "boolean") return raw;
    return Boolean(raw);
  }
  if (type === "datetime") {
    // SQLite stores DateTimes as TEXT in ISO format, or sometimes as a
    // Unix epoch integer. Both feed into new Date() cleanly.
    if (raw instanceof Date) return raw;
    if (typeof raw === "number") return new Date(raw);
    return new Date(String(raw));
  }
  return raw;
}

async function migrateTable(
  sqlite: Database.Database,
  pg: Client,
  table: string,
): Promise<{ table: string; copied: number; sourceCount: number }> {
  const types = COLUMN_TYPES[table] ?? {};
  const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<
    string,
    unknown
  >[];
  if (rows.length === 0) {
    return { table, copied: 0, sourceCount: 0 };
  }

  // Column list comes from the first row; SQLite guarantees uniform shape.
  const columns = Object.keys(rows[0]);
  const quotedCols = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map((_c, i) => `$${i + 1}`).join(", ");
  const insertSql = `INSERT INTO "${SCHEMA}"."${table}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;

  let copied = 0;
  for (const row of rows) {
    const values = columns.map((c) => coerceValue(row[c], types[c]));
    const result = await pg.query(insertSql, values);
    copied += result.rowCount ?? 0;
  }
  return { table, copied, sourceCount: rows.length };
}

async function main() {
  if (!existsSync(SQLITE_PATH)) {
    console.error(`SQLite file not found at ${SQLITE_PATH}`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to run.");
    process.exit(1);
  }

  console.log(`Reading from: ${SQLITE_PATH}`);
  console.log(`Writing to:   ${SCHEMA} schema in DATABASE_URL`);

  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  const results: { table: string; copied: number; sourceCount: number }[] = [];
  const skipped: { table: string; sourceCount: number }[] = [];

  try {
    // Single transaction: all-or-nothing. If any insert fails, nothing
    // persists; rerun after fixing.
    await pg.query("BEGIN");

    // Clear destination first. We expect the schema to be empty except for
    // the temp Meyhouse Organization row seeded for Stage A.9 testing.
    // Truncate in reverse FK order with CASCADE to be safe against any
    // stray rows from a previous failed migration attempt.
    const truncateList = [...TABLE_ORDER]
      .reverse()
      .map((t) => `"${SCHEMA}"."${t}"`)
      .join(", ");
    await pg.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);
    console.log("Cleared destination tables (incl. Stage A.9 seed row).\n");

    for (const table of TABLE_ORDER) {
      const r = await migrateTable(sqlite, pg, table);
      results.push(r);
      console.log(
        `  ${table.padEnd(20)} ${r.copied.toString().padStart(5)} / ${r.sourceCount}`,
      );
    }

    // Record skipped tables (for the summary).
    for (const t of SKIP_TABLES) {
      try {
        const c = sqlite
          .prepare(`SELECT COUNT(*) AS n FROM "${t}"`)
          .get() as { n: number };
        skipped.push({ table: t, sourceCount: c.n });
      } catch {
        // table may not exist in dev.db
      }
    }

    // Verify row counts match for every migrated table.
    const mismatches = results.filter((r) => r.copied !== r.sourceCount);
    if (mismatches.length > 0) {
      console.error("\nRow count mismatches detected:");
      for (const m of mismatches) {
        console.error(
          `  ${m.table}: SQLite had ${m.sourceCount}, copied ${m.copied}`,
        );
      }
      throw new Error(
        "Migration aborted — some rows did not copy. Inspect ON CONFLICT clauses; check the destination tables are empty before re-running.",
      );
    }

    await pg.query("COMMIT");
    console.log("\nMigration complete.");
    const total = results.reduce((s, r) => s + r.copied, 0);
    console.log(`  ${total} rows copied across ${results.length} tables.`);
    if (skipped.length > 0) {
      console.log("  Skipped (NextAuth tables, intentionally discarded):");
      for (const s of skipped) {
        console.log(`    ${s.table}: ${s.sourceCount} rows in SQLite`);
      }
    }
    console.log(
      "\ndev.db has NOT been deleted. Keep it as a backup until Stage D verification passes.",
    );
  } catch (err) {
    await pg.query("ROLLBACK");
    console.error("\nMigration FAILED, rolled back:", err);
    process.exit(1);
  } finally {
    await pg.end();
    sqlite.close();
  }
}

main();
