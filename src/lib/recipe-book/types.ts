// Shapes shared by the staff Recipe Book page (/bar/<token>) and its server
// actions. No prices or costs ever go in here.

export type Lang = "en" | "tr" | "es";
export const LANGS: Lang[] = ["en", "tr", "es"];

// Translatable text as stored in the DB: {"en": ..., "tr": ..., "es": ...}.
// A missing language falls back to English.
export type Tri = Partial<Record<Lang, string>>;

export type Category = "craft" | "classic" | "na" | "syrup";
export type ScaleMode = "portions" | "liters" | "multiplier" | "none";
export type Store = "meyhouse" | "meze-kebab";
export type Unit = "oz" | "dash" | "kg" | "g" | "L" | "ea" | "cup" | "ml";

export type RecipeIngredient = {
  name: Tri;
  batchName: string | null;
  qty: number | null;
  unit: Unit | null;
  text: Tri | null;
  inBatch: boolean;
  note: Tri | null;
};

export type Recipe = {
  id: string;
  name: string;
  category: Category;
  stores: Store[];
  mode: ScaleMode;
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
  needsReview: boolean; // needs_review OR needs_spec
  last: { by: string; at: string } | null; // last edit (null = untouched since import)
  ingredients: RecipeIngredient[];
};

export type StaffRole = "owner" | "manager" | "supervisor" | "staff";

export type Me = { name: string; role: StaffRole };

export type RecipeFeed = { me: Me; recipes: Recipe[] };

export type SignInResult =
  | { ok: true }
  | { ok: false; denied: { name: string; positions: string[] } }
  | { ok: false; error: "wrong_pin" | "bad_format" | "bad_link" | "not_configured" | "server" };

export type FeedResult =
  | { ok: true; feed: RecipeFeed }
  | { ok: false; error: "signed_out" | "bad_link" | "not_configured" | "server" };
