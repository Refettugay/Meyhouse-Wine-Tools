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
  status: string;             // SUBMITTED | APPROVED | ORDERED
  sentByName: string | null;
  sentAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  // other people who counted for this order (name + latest time)
  alsoCounted: { name: string; at: string }[];
  requests: { id: string; text: string; byName: string | null; at: string }[];
  lines: ReviewLine[];
  emails: ReviewEmail[];
};
