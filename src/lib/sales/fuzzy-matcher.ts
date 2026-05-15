// =============================================================================
// FUZZY MATCHER — Toast PMIX item names → DB Ingredient / Recipe
// =============================================================================
// Toast lists items differently than our DB. Examples:
//   "1/2 BTL RED Frog's Leap Cabernet"  →  Ingredient "Frog's Leap Cabernet"
//   "Cht. Musar"                         →  Ingredient "Chateau Musar"
//   "Meyhouse Vesper Martini"            →  Recipe     "Meyhouse Vesper Martini"
//
// Strategy:
//   1. Clean the raw name (strip size/color prefixes, expand abbreviations)
//   2. Try exact match first
//   3. Fall back to token-based scoring (Jaccard + prefix bonus)
// =============================================================================

// Raw name cleaners
const PREFIX_STRIP = [
  /^1\/2\s*BTL\s*(WHITE|RED|SPARKLING|ROSE)\s*/i,
  /^375\s*(ML)?\s*/i,
  /^HALF\s*BOTTLE\s*/i,
];

const ABBREV = [
  [/\bCht\.?\s/gi, "Chateau "],
  [/\bCh\.?\s/gi, "Chateau "],
  [/\bDom\.?\s/gi, "Domaine "],
  [/\bDT\.?\s/gi, "Dom. "],
  [/\bSt\.?\s/gi, "Saint "],
  // Common typo fixes observed in Meyhouse PMIX
  [/Tiganello/gi, "Tignanello"],
  [/La Scola\b/gi, "La Scolca"],
  [/Sancere/gi, "Sancerre"],
  [/Barberesco/gi, "Barbaresco"],
  [/\bDi Gr[ae]y\b/gi, "Di Gresy"],
  [/\bChard\b/gi, "Chardonnay"],
] as const;

export function cleanName(raw: string): string {
  let s = raw.trim();
  for (const p of PREFIX_STRIP) s = s.replace(p, "");
  for (const [re, rep] of ABBREV) s = s.replace(re, rep as string);
  // remove punctuation, collapse spaces
  s = s.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2 && !/^(the|and|for|with|de|di|du|la|le|les|of)$/.test(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

// Extract size hint: "1/2 BTL" → "375", "5oz" → "5oz"
export function extractSizeHint(raw: string): "375" | "750" | "5oz" | "8oz" | null {
  if (/1\/2\s*btl|half\s*btl|half\s*bottle|375\s*ml/i.test(raw)) return "375";
  if (/5\s*oz/i.test(raw)) return "5oz";
  if (/8\s*oz/i.test(raw)) return "8oz";
  if (/btl|750\s*ml|bottle/i.test(raw)) return "750";
  return null;
}

export interface MatchCandidate {
  id: string;
  type: "ingredient" | "recipe";
  name: string;
  bottleSizeMl: number | null;
  productType: string | null;
  score: number;          // 0-1
}

export function scoreCandidate(
  cleanedQuery: string,
  candidate: { name: string },
  sizeHint: "375" | "750" | "5oz" | "8oz" | null,
  candidateSize: number | null
): number {
  const qTokens = tokenize(cleanedQuery);
  const cTokens = tokenize(candidate.name);
  let score = jaccard(qTokens, cTokens);

  // First-word prefix bonus: "Chateau Musar" vs "Chateau Musar Red" — boost
  const qFirst = cleanedQuery.toLowerCase().split(/\s+/)[0] ?? "";
  const cFirst = candidate.name.toLowerCase().split(/\s+/)[0] ?? "";
  if (qFirst && qFirst === cFirst) score += 0.1;

  // Substring bonus
  const qLow = cleanedQuery.toLowerCase();
  const cLow = candidate.name.toLowerCase();
  if (cLow.includes(qLow) || qLow.includes(cLow)) score += 0.15;

  // Size alignment: if query says "1/2 BTL" and candidate is 375ml → boost
  if (sizeHint === "375" && candidateSize === 375) score += 0.15;
  if (sizeHint === "750" && candidateSize === 750) score += 0.1;
  if (sizeHint === "375" && candidateSize === 750) score -= 0.15;
  if (sizeHint === "750" && candidateSize === 375) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

// ---------- Resolver (uses a pre-loaded candidate list to avoid N queries per row) ----------

export interface SearchableItem {
  id: string;
  type: "ingredient" | "recipe";
  name: string;
  bottleSizeMl: number | null;
  productType: string | null;
}

export function bestMatch(
  rawName: string,
  pool: SearchableItem[]
): { item: SearchableItem; confidence: number } | null {
  const cleaned = cleanName(rawName);
  const sizeHint = extractSizeHint(rawName);

  // Rank all candidates
  let best: SearchableItem | null = null;
  let bestScore = 0;
  for (const c of pool) {
    const s = scoreCandidate(cleaned, { name: c.name }, sizeHint, c.bottleSizeMl);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }

  // Require minimum confidence to accept
  if (!best || bestScore < 0.35) return null;
  return { item: best, confidence: bestScore };
}
