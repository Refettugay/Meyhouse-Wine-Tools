// Shared search normalization for every item search box (kiosk Count screen,
// Admin items, Order Review "+ Add item"). Only the text being compared is
// normalized — saved item names are never changed.
//
// Why: iPhone "Smart Punctuation" turns ' into ’ (and " into “ ”, - into – —),
// so a plain .includes() made "O’Shaunghnessy" miss an item saved as
// "O'Shaunghnessy".

// Letters that NFD doesn't split into base letter + accent.
const SPECIAL_LETTERS: Record<string, string> = {
  ß: "ss", æ: "ae", œ: "oe", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i",
};

/** Lowercase, strip accents and quote marks, turn - – — . , / & into spaces, collapse spaces. */
export function normalizeForSearch(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .replace(/['’‘‛ʼ´`"“”„]/g, "")
    .replace(/[-–—.,/&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** How many wrong letters a typed word may have (2026-11-22): ≤4 letters none, 5–8 one, 9+ two. */
export function typoAllowance(word: string): number {
  return word.length >= 9 ? 2 : word.length >= 5 ? 1 : 0;
}

/**
 * Edit distance where a missing, extra, wrong or swapped (ab ↔ ba) letter each
 * count as one. Stops early once it is over `max`.
 */
export function typoDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Typed word ≈ an item word, or the start of one ("peyrasol" ≈ "peyrassol", "talisekr" ≈ "talisker"). */
function fuzzyWordHit(typed: string, itemWords: string[]): boolean {
  const max = typoAllowance(typed);
  if (max === 0) return false;
  for (const w of itemWords) {
    if (w.length < typed.length - max) continue;
    for (let len = typed.length - max; len <= typed.length + max; len++) {
      if (len < 1 || len > w.length) continue;
      if (typoDistance(typed, w.slice(0, len), max) <= max) return true;
    }
  }
  return false;
}

type Fields = (string | null | undefined)[];

function exactHit(words: string[], fields: Fields): boolean {
  const text = normalizeForSearch(fields.filter(Boolean).join(" "));
  const hay = `${text} ${text.replace(/ /g, "")}`;
  return words.every((w) => hay.includes(w));
}

function typoHit(words: string[], fields: Fields): boolean {
  const text = normalizeForSearch(fields.filter(Boolean).join(" "));
  const hay = `${text} ${text.replace(/ /g, "")}`;
  let itemWords: string[] | null = null;
  return words.every((w) => {
    if (hay.includes(w)) return true;
    itemWords ??= [...new Set([...text.split(" "), text.replace(/ /g, "")])];
    return fuzzyWordHit(w, itemWords);
  });
}

/**
 * Build a matcher for what the user typed. An item matches when every typed
 * word appears somewhere in its normalized fields, in any order. The fields
 * are also checked with spaces removed, so "saintemilion" finds
 * "Saint-Émilion" and "o shaung" finds "O'Shaunghnessy". An empty search
 * matches everything.
 *
 * Typos (2026-11-22): pass `pool` (every item's fields) and, when NOTHING in
 * the pool matches as typed, small typos on longer words are forgiven
 * (typoAllowance) — "Peyrasol" finds "Peyrassol", while "blanco" still shows
 * only Blanco (not every "Sauvignon Blanc"). `typos: "always"` forgives them
 * even when there are exact matches (the new-product duplicate check).
 */
export function searchMatcher(
  query: string | null | undefined,
  opts?: { pool?: Fields[]; typos?: "auto" | "always" },
): (...fields: Fields) => boolean {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return () => true;
  if (opts?.typos === "always") return (...fields) => typoHit(words, fields);
  const useTypos = !!opts?.pool && !opts.pool.some((f) => exactHit(words, f));
  return useTypos ? (...fields) => typoHit(words, fields) : (...fields) => exactHit(words, fields);
}
