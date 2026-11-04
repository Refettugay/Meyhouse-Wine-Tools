// Client-safe shapes + formatting for kiosk item changes shown in Admin.
export type KioskChange = {
  id: string;
  at: string; // ISO
  store: string;
  who: string;
  item: string;
  ingredientId: string | null;
  what: string; // "Par", "Area 1", "Note", "Remove mark", …
  from: string | null;
  to: string | null;
};

// Pacific time, e.g. "Nov 3, 4:12pm".
export function pacificTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" });
  const t = d.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  return `${day}, ${t}`;
}
