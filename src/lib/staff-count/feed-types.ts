// Shapes sent to the staff count page. Deliberately NO prices, costs or money —
// only what staff need to count. Shared by server actions and the client.
import type { TypeChip } from "./types";

export type StaffPerson = { id: string; name: string; hasPin: boolean };

export type CountItem = {
  id: string;              // InventoryItem id
  name: string;
  size: string | null;     // bottle / container size, e.g. "750ml", "1L"
  type: TypeChip;
  areaId: string | null;   // StorageArea id (null = Unassigned)
  areaName: string | null;
  vendor: string | null;
  casePack: number | null; // bottles per case (only when > 1)
  par: number;
  unit: "CASE" | "BOTTLE" | null; // admin-set CS/BTL; null = Not set (staff may pick)
  keg: boolean;
  offMenu: boolean;         // active but not On Menu → collapsed "Off menu" section
};

export type AreaCounted = { byName: string; at: string; byMe: boolean };

export type CountFeed = {
  storeName: string;
  me: { name: string };
  items: CountItem[];
  areas: { id: string; name: string }[];
  // storage area id ("none" = Unassigned) → who counted it today (store time)
  countedToday: Record<string, AreaCounted>;
};

export type SendCount = { id: string; count: number; unitPick?: "CASE" | "BOTTLE" | null };

export type SendResult =
  | { ok: true; linesOrdered: number; itemsCounted: number }
  | { ok: false; error: string; signedOut?: boolean };
