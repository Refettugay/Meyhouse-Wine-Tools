// Plain module (non-"use server") for sharing constants and types
// between server actions and client code.

export type BeverageTabKey =
  | "wine-btg"
  | "wine-btb"
  | "wine-half"
  | "spirits"
  | "beer"
  | "na";

const OZ_TO_ML = 29.5735;

export const DEFAULT_POURS: Record<
  BeverageTabKey,
  { label: string; pourMl: number }[]
> = {
  "wine-btg": [
    { label: "5oz", pourMl: Math.round(5 * OZ_TO_ML * 10) / 10 },
    { label: "8oz", pourMl: Math.round(8 * OZ_TO_ML * 10) / 10 },
    { label: "btl (750ml)", pourMl: 750 },
  ],
  "wine-btb": [{ label: "btl (750ml)", pourMl: 750 }],
  "wine-half": [{ label: "half (375ml)", pourMl: 375 }],
  spirits: [{ label: "1.5oz", pourMl: Math.round(1.5 * OZ_TO_ML * 10) / 10 }],
  beer: [{ label: "bottle/can", pourMl: 355 }],
  na: [{ label: "glass", pourMl: 237 }],
};

export const FALLBACK_TAB_DEFAULTS: Record<BeverageTabKey, number> = {
  "wine-btg": 25,
  "wine-btb": 32,
  "wine-half": 35,
  spirits: 22,
  beer: 25,
  na: 18,
};

export interface BeverageRow {
  priceId: string;
  ingredientId: string;
  ingredientName: string;
  vendorName: string | null;
  label: string;
  pourMl: number;
  bottleCostCents: number | null;
  bottleSizeMl: number | null;
  costPerPourCents: number | null;
  menuPriceCents: number | null;
  costTargetPct: number | null;
  costTargetSource: "row" | "tab";
  actualCostPct: number | null;
  suggestedPriceCents: number | null;
  status:
    | "over"
    | "near"
    | "on-target"
    | "under"
    | "no-price"
    | "no-cost"
    | "no-target";
  sortOrder: number;
}

export interface BeverageIngredientWithoutPours {
  ingredientId: string;
  ingredientName: string;
  vendorName: string | null;
  bottleCostCents: number | null;
  bottleSizeMl: number | null;
}

// ---------- Matrix shapes (shared by matrix view) ----------

export type MatrixPourCell = {
  priceId: string;
  label: string;
  pourMl: number;
  menuPriceCents: number | null;
  rowTargetPct: number | null;
  costPerPourCents: number | null;
  actualCostPct: number | null;
  effectiveTargetPct: number;
  suggestedPriceCents: number | null;
  status: "over" | "near" | "on-target" | "under" | "no-price" | "no-cost";
};

export type MatrixProductRow = {
  ingredientId: string;
  name: string;
  vendorName: string | null;
  category: string | null;
  bottleCostCents: number | null;
  bottleSizeMl: number | null;
  bottleSizeUnit: string;
  cellsByLabel: Record<string, MatrixPourCell>;
};

export type MatrixPourColumn = {
  label: string;
  pourMl: number;
  columnTargetPct: number;
  isFromTabConfig: boolean;
};

export type MatrixOrphan = {
  ingredientId: string;
  name: string;
  vendorName: string | null;
  category: string | null;
  bottleCostCents: number | null;
  bottleSizeMl: number | null;
  bottleSizeUnit: string;
};

export type BeverageMatrixData = {
  tab: BeverageTabKey;
  tabDefaultPct: number;
  pourColumns: MatrixPourColumn[];
  products: MatrixProductRow[];
  orphans: MatrixOrphan[];
};
