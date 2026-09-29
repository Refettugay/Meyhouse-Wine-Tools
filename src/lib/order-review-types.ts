// Shapes for the Order tab's Review and Ready-to-email views (admin only).

export type ReviewLine = {
  id: string;
  ingredientId: string;
  name: string;
  bottleSizeMl: number | null;
  casePackSize: number | null;
  vendor: string;
  qty: number;
  unit: string;               // "case" | "bottle" (this order line)
  status: string;             // PENDING | REJECTED (removed with ✕)
  countedStock: number | null;
  par: number | null;
  countedByName: string | null;
  countedAt: string | null;
  source: string | null;      // staff | manager
  unitIsStaffPick: boolean;
  transferFromLocationId: string | null; // set = moved here FOR that store
  transferNote: string | null;
  movedByName: string | null;
};

export type ReviewEmail = {
  id: string;
  vendorName: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  body: string;
  status: string;             // DRAFT | SENT
  markedSentByName: string | null;
  markedSentAt: string | null;
};

export type ReviewOrder = {
  id: string;
  locationId: string;
  status: string;             // SUBMITTED | HELD | APPROVED | ORDERED
  sentByName: string | null;
  sentAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  heldByName: string | null;  // "Hold until next order"
  heldAt: string | null;
  // other people who counted for this order (name + latest time)
  alsoCounted: { name: string; at: string }[];
  requests: { id: string; text: string; byName: string | null; at: string }[];
  lines: ReviewLine[];
  emails: ReviewEmail[];
};

// Transfers tab — one moved order line. "from" = the store that orders it and
// sends it on; "to" = the store that needs it. Cost/case size are the values
// saved on the line when it was moved (current product values if missing).
export type TransferRow = {
  id: string;
  movedAt: string | null;
  name: string;
  bottleSizeMl: number | null;
  vendor: string;
  movedByName: string | null;
  qty: number;
  unit: string;                // "case" | "bottle"
  casePackSize: number | null;
  unitCostCents: number | null; // per bottle
  fromId: string;
  toId: string;
  status: "PENDING" | "TRANSFERRED";
  transferredByName: string | null;
  transferredAt: string | null;
  orderStatus: string;         // SUBMITTED | HELD | APPROVED | ORDERED …
};
