// Client-safe types for the shared Order Cart (2026-11-03).

export type CartSourceDTO = {
  kind: string; // kiosk | desktop | migrated | moved_in | add
  qty: number;
  actorId: string | null;
  actorName: string | null;
  countedStock: number | null;
  parSnapshot: number | null;
  fromLocationId: string | null;
  at: string;
};

export type CartLineDTO = {
  id: string;
  locationId: string;
  ingredientId: string;
  name: string;
  unit: "case" | "bottle";
  qty: number;
  vendor: string | null;
  updatedAt: string;
  sources: CartSourceDTO[];
};

export type CartRequestDTO = { id: string; locationId: string; text: string; byName: string | null; at: string };

export type CartViewer = { name: string; locationId: string };

const STORE_TZ = "America/Los_Angeles";

export function shortStore(name: string) {
  return name.replace("Meyhouse ", "");
}

// "3:12pm" in store time
export function storeTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: STORE_TZ }).replace(" ", "").toLowerCase();
}

// One-line tag for a source ("Kiosk · Palo Alto · 3:12pm · Sam"). `meId` turns
// the viewer's own desktop part into "Added by you".
export function sourceTag(
  s: { kind: string; actorId: string | null; actorName: string | null; fromLocationId: string | null; at: Date | string; qty?: number },
  storeName: (id: string | null) => string,
  meId: string | null,
): string {
  const at = typeof s.at === "string" ? new Date(s.at) : s.at;
  switch (s.kind) {
    case "kiosk":
      return ["Kiosk", storeName(s.fromLocationId), storeTime(at), s.actorName].filter(Boolean).join(" · ");
    case "desktop":
    case "add":
      return meId && s.actorId === meId ? "Added by you" : `Added by ${s.actorName || "a manager"}`;
    case "moved_in":
      return `Moved from ${storeName(s.fromLocationId)}${s.actorName ? ` by ${s.actorName}` : ""}`;
    case "migrated":
      return `From Review & approve${s.actorName ? ` · ${s.actorName}` : ""}`;
    default:
      return s.kind;
  }
}
