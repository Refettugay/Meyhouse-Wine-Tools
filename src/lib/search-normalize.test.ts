// Run: npm run test:search
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeForSearch, searchMatcher } from "./search-normalize";

test("normalizeForSearch: quotes, accents, dashes, spaces", () => {
  assert.equal(normalizeForSearch("O’Shaunghnessy"), "oshaunghnessy");
  assert.equal(normalizeForSearch("O'Shaunghnessy"), "oshaunghnessy");
  assert.equal(normalizeForSearch("“Reserve” ‘Cuvée’"), "reserve cuvee");
  assert.equal(normalizeForSearch("Saint-Émilion – Grand Cru"), "saint emilion grand cru");
  assert.equal(normalizeForSearch("Smith & Wesson / Co."), "smith wesson co");
  assert.equal(normalizeForSearch("  Añejo   Tequila "), "anejo tequila");
  assert.equal(normalizeForSearch("Grüner Veltliner"), "gruner veltliner");
  assert.equal(normalizeForSearch(null), "");
});

test("searchMatcher: O'Shaunghnessy found every way", () => {
  const name = "O'Shaunghnessy Cabernet";
  for (const q of ["O’Shaunghnessy", "O'Shaunghnessy", "OShaunghnessy", "o shaunghnessy", "shaung", "o shaung", "cab shaung"]) {
    assert.ok(searchMatcher(q)(name), `"${q}" should match`);
  }
  assert.ok(!searchMatcher("merlot")(name));
});

test("searchMatcher: accents, hyphens, ampersands", () => {
  assert.ok(searchMatcher("anejo")("Don Julio Añejo"));
  assert.ok(searchMatcher("gruner")("Grüner Veltliner"));
  assert.ok(searchMatcher("saint-emilion")("Château X Saint-Émilion"));
  assert.ok(searchMatcher("saint emilion")("Château X Saint-Émilion"));
  assert.ok(searchMatcher("saintemilion")("Château X Saint-Émilion"));
  assert.ok(searchMatcher("smith & wesson")("Smith & Wesson"));
  assert.ok(searchMatcher("smith wesson")("Smith & Wesson"));
  assert.ok(searchMatcher("smithwesson")("Smith & Wesson"));
});

test("searchMatcher: empty search matches everything; extra fields searched", () => {
  assert.ok(searchMatcher("")("anything"));
  assert.ok(searchMatcher("   ")("anything"));
  assert.ok(searchMatcher("southern")("Tito's", "Southern Glazer's"));
});
