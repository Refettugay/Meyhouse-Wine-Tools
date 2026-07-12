// =============================================================================
// OPENTABLE COVERS CSV PARSER
// =============================================================================
// Parses an OpenTable "Reservations" report CSV (GuestCenter export) into
// per-day + per-service cover counts. We deliberately IGNORE all guest personal
// columns (name, phone, tags, notes) — only aggregate covers are extracted.
//
// A "cover" = one guest who actually dined. We count the party Size of every
// reservation whose Status indicates the guest was seated / finished, and bucket
// each into lunch or dinner by Visit Time (cutoff 5:00 PM).
// =============================================================================

export type Service = "lunch" | "dinner";

export interface CoverDayRow {
  date: string; // YYYY-MM-DD
  service: Service;
  covers: number;
  reservations: number;
}

export interface ParsedCovers {
  days: CoverDayRow[]; // one row per (date, service) with covers > 0
  totalCovers: number;
  totalReservations: number;
  excludedRows: number; // upcoming / unconfirmed reservations that were not counted
  unparsedTimeRows: number; // rows whose Visit Time could not be read
  minDate: string | null;
  maxDate: string | null;
}

// Statuses that mean the guest actually dined (attended). Everything else
// (Confirmed / Not Confirmed = upcoming, No Show / Cancelled if present) is excluded.
const ATTENDED_STATUSES = new Set([
  "Done",
  "Assumed Finished",
  "Paid",
  "Seated",
  "Bus Table",
  "Entree",
]);

// Reservations before this hour (24h) are lunch; at/after are dinner.
const LUNCH_DINNER_CUTOFF_HOUR = 17; // 5:00 PM

// Robust CSV parser: handles quoted fields containing commas, quotes ("" escape),
// and embedded newlines.
function parseCsv(text: string): string[][] {
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignore; handled by \n
    } else {
      field += ch;
    }
  }
  // last field / row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function serviceForTime(visitTime: string): Service | null {
  // Expected like "08:45 PM" / "12:30 PM". Fall back to null if unreadable.
  const m = visitTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return hour < LUNCH_DINNER_CUTOFF_HOUR ? "lunch" : "dinner";
}

export function parseOpenTableCovers(csv: string): ParsedCovers {
  const table = parseCsv(csv);
  if (table.length < 2) {
    return {
      days: [],
      totalCovers: 0,
      totalReservations: 0,
      excludedRows: 0,
      unparsedTimeRows: 0,
      minDate: null,
      maxDate: null,
    };
  }
  const header = table[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iDate = idx("Visit Date");
  const iTime = idx("Visit Time");
  const iSize = idx("Size");
  const iStatus = idx("Status");

  if (iDate < 0 || iSize < 0 || iStatus < 0) {
    throw new Error(
      "This does not look like an OpenTable Reservations export (missing Visit Date / Size / Status columns)."
    );
  }

  // key = `${date}|${service}` -> { covers, reservations }
  const agg = new Map<string, { covers: number; reservations: number }>();
  let totalCovers = 0;
  let totalReservations = 0;
  let excluded = 0;
  let unparsedTime = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (let r = 1; r < table.length; r++) {
    const cols = table[r];
    if (cols.length <= iStatus) continue; // malformed / short row
    const status = (cols[iStatus] || "").trim();
    if (!ATTENDED_STATUSES.has(status)) {
      excluded++;
      continue;
    }
    const date = (cols[iDate] || "").trim();
    if (!date) continue;
    const size = parseInt((cols[iSize] || "0").trim(), 10) || 0;
    const time = iTime >= 0 ? (cols[iTime] || "").trim() : "";
    let service = serviceForTime(time);
    if (service === null) {
      unparsedTime++;
      service = "dinner"; // sensible default for a restaurant if time is missing
    }
    const key = `${date}|${service}`;
    const cur = agg.get(key) || { covers: 0, reservations: 0 };
    cur.covers += size;
    cur.reservations += 1;
    agg.set(key, cur);

    totalCovers += size;
    totalReservations += 1;
    if (minDate === null || date < minDate) minDate = date;
    if (maxDate === null || date > maxDate) maxDate = date;
  }

  const days: CoverDayRow[] = [];
  for (const [key, v] of agg) {
    const [date, service] = key.split("|");
    days.push({ date, service: service as Service, covers: v.covers, reservations: v.reservations });
  }
  days.sort((a, b) => (a.date === b.date ? a.service.localeCompare(b.service) : a.date.localeCompare(b.date)));

  return {
    days,
    totalCovers,
    totalReservations,
    excludedRows: excluded,
    unparsedTimeRows: unparsedTime,
    minDate,
    maxDate,
  };
}
