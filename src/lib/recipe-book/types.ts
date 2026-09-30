// Shapes shared by the staff Recipe Book page (/bar/<token>), the admin copy
// (/dashboard/bar-recipes) and their server actions. No prices or costs here.

export type Lang = "en" | "tr" | "es";
export const LANGS: Lang[] = ["en", "tr", "es"];

// Translatable text as stored in the DB: {"en": ..., "tr": ..., "es": ...}.
// A missing language falls back to English.
export type Tri = Partial<Record<Lang, string>>;

export type Category = "craft" | "classic" | "na" | "syrup";
export type ScaleMode = "portions" | "liters" | "multiplier" | "none";
export type Store = "meyhouse" | "meze-kebab";
export type Unit = "oz" | "dash" | "kg" | "g" | "L" | "ea" | "cup" | "ml";
export const UNITS: Unit[] = ["oz", "dash", "ml", "g", "kg", "L", "ea", "cup"];
export const CATEGORIES: Category[] = ["craft", "na", "classic", "syrup"];
export const MODES: ScaleMode[] = ["portions", "liters", "multiplier", "none"];

export type RecipeIngredient = {
  name: Tri;
  batchName: string | null;
  qty: number | null;
  unit: Unit | null;
  text: Tri | null;
  inBatch: boolean;
  note: Tri | null;
};

// Everything that can be edited, and exactly what the change log stores as the
// before / after snapshot (revert writes a snapshot back as-is).
export type RecipeData = {
  name: string;
  category: Category;
  stores: Store[];
  mode: ScaleMode;
  batchable: boolean;
  defaultPortions: number | null;
  dilutionPct: number; // 0.2 = 20%
  pourOz: number | null;
  glass: Tri | null;
  ice: Tri | null;
  garnish: Tri | null;
  howTo: Tri | null;
  storage: "freezer" | "fridge" | null;
  notes: Tri | null;
  method: Partial<Record<Lang, string[]>> | null;
  baseYieldL: number | null;
  glassL: number | null;
  needsReview: boolean;
  needsSpec: boolean;
  active: boolean;
  photoPath: string | null;
  ingredients: RecipeIngredient[];
};

export type Snapshot = RecipeData & { id: string };

export type Recipe = Snapshot & {
  photoUrl: string | null; // short-lived signed URL (private bucket)
  thumbUrl: string | null;
  updatedAt: string;
  last: { by: string; at: string } | null; // last edit (null = untouched since import)
};

export type StaffRole = "owner" | "manager" | "supervisor" | "staff";
export type Me = { name: string; role: StaffRole };
export const canSeeHistory = (role: StaffRole) => role === "owner" || role === "manager";

export type RecipeFeed = { me: Me; recipes: Recipe[] };

export type SignInResult =
  | { ok: true }
  | { ok: false; denied: { name: string; positions: string[] } }
  | { ok: false; error: "wrong_pin" | "bad_format" | "bad_link" | "not_configured" | "server" };

export type FeedResult =
  | { ok: true; feed: RecipeFeed }
  | { ok: false; error: "signed_out" | "bad_link" | "not_configured" | "server" };

// ---- editing ----
export type PhotoChange =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "new"; full: string; thumb: string }; // base64 JPEG (no data: prefix)

export type SaveInput = {
  id: string | null; // null = new recipe
  baseUpdatedAt: string | null; // what the editor started from (conflict check)
  lang: Lang; // language being edited (goes in the log)
  data: RecipeData;
  photo: PhotoChange;
};

export type SaveError = "wrong_pin" | "no_access" | "forbidden" | "conflict" | "invalid" | "nothing" | "signed_out" | "server";
export type SaveResult = { ok: true; id: string; summary: string; by: string } | { ok: false; error: SaveError; message?: string };

// ---- history ----
export type LogAction = "create" | "update" | "archive" | "restore" | "revert";
export type HistoryFilters = { person?: string; recipeId?: string; from?: string; to?: string };
export type HistoryRow = {
  id: string;
  recipeId: string;
  recipeName: string;
  by: string;
  at: string;
  action: LogAction;
  language: Lang | null;
  source: "staff_page" | "admin";
  summary: string;
};
export type HistoryEntry = HistoryRow & {
  before: Snapshot | null;
  after: Snapshot;
  beforePhotoUrl: string | null;
  afterPhotoUrl: string | null;
};
export type HistoryResult =
  | { ok: true; rows: HistoryRow[]; people: string[]; recipes: { id: string; name: string }[] }
  | { ok: false; error: "forbidden" | "signed_out" | "server" };
export type EntryResult = { ok: true; entry: HistoryEntry } | { ok: false; error: "forbidden" | "signed_out" | "not_found" | "server" };

// ---- "Who can see this" (read-only; changed on the launcher Team page) ----
export type AccessOverview =
  | { ok: true; positions: { name: string; enabled: boolean; people: string[] }[] }
  | { ok: false; error: "forbidden" | "signed_out" | "server" };
