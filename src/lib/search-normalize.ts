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

/**
 * Build a matcher for what the user typed. An item matches when every typed
 * word appears somewhere in its normalized fields, in any order. The fields
 * are also checked with spaces removed, so "saintemilion" finds
 * "Saint-Émilion" and "o shaung" finds "O'Shaunghnessy".
 * An empty search matches everything.
 */
export function searchMatcher(query: string | null | undefined): (...fields: (string | null | undefined)[]) => boolean {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return () => true;
  return (...fields) => {
    const text = normalizeForSearch(fields.filter(Boolean).join(" "));
    const hay = `${text} ${text.replace(/ /g, "")}`;
    return words.every((w) => hay.includes(w));
  };
}
