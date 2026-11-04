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

// ===== Approved orders / Order history (2026-11-03) =====

export type ApprovedLineDTO = {
  id: string;
  locationId: string;
  vendor: string;
  name: string;
  qty: number;
  unit: "case" | "bottle";
  orderedEventId: string | null;
  sourceSummary: string | null;
  transferForLocationId: string | null;
};

export type OrderedEventDTO = { id: string; vendorName: string; orderedAt: string; orderedByName: string | null };

export type ApprovedOrderDTO = {
  id: string;
  status: "ACTIVE" | "CLEARED";
  approvedByName: string | null;
  approvedAt: string;
  firstApprovedAt: string;
  clearedAt: string | null;
  clearedByName: string | null;
  lines: ApprovedLineDTO[];
  events: OrderedEventDTO[];
};

// "2cs Isabey Sauvignon Blanc" / "6btl Tito's Vodka"
export function approvedLineText(l: { qty: number; unit: string; name: string }) {
  return `${l.qty}${l.unit === "case" ? "cs" : "btl"} ${l.name}`;
}

// Vendor → store grouping used by Approved orders, View and Copy.
// Vendors A→Z; stores in the fixed store order; items A→Z.
export function groupApproved(lines: ApprovedLineDTO[], storeOrder: string[]) {
  const byVendor = new Map<string, ApprovedLineDTO[]>();
  for (const l of lines) {
    if (!byVendor.has(l.vendor)) byVendor.set(l.vendor, []);
    byVendor.get(l.vendor)!.push(l);
  }
  return [...byVendor.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, vl]) => {
      const byStore = new Map<string, ApprovedLineDTO[]>();
      for (const l of vl) {
        if (!byStore.has(l.locationId)) byStore.set(l.locationId, []);
        byStore.get(l.locationId)!.push(l);
      }
      const stores = [...byStore.entries()]
        .sort(([a], [b]) => storeOrder.indexOf(a) - storeOrder.indexOf(b))
        .map(([locationId, sl]) => ({ locationId, lines: sl.sort((a, b) => a.name.localeCompare(b.name)) }));
      return { vendor, lines: vl, stores };
    });
}

// Plain text for one vendor card's Copy button:
//   KALARA
//   Palo Alto
//   2cs Isabey Sauvignon Blanc
//   Sunnyvale
//   1cs Isabey Sauvignon Blanc
export function vendorCopyText(
  group: { vendor: string; stores: { locationId: string; lines: { qty: number; unit: string; name: string }[] }[] },
  storeName: (id: string) => string,
) {
  const out = [group.vendor.toUpperCase()];
  for (const s of group.stores) {
    out.push(storeName(s.locationId));
    for (const l of s.lines) out.push(approvedLineText(l));
  }
  return out.join("\n");
}
