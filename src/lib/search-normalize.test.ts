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

test("searchMatcher: small typos on longer words are forgiven", () => {
  const m = (q: string, name: string) => searchMatcher(q, { typos: "always" })(name);
  assert.ok(m("Peyrasol", "Peyrassol Rose"), "missing letter");
  assert.ok(m("peyrasol rose", "Peyrassol Rose"));
  assert.ok(m("Peyrrassol", "Peyrassol Rose"), "extra letter");
  assert.ok(m("Talisekr", "Talisker 10yr"), "swapped letters");
  assert.ok(m("Glenmorngie", "Glenmorangie 14yr"));
  assert.ok(m("Glenmrngie", "Glenmorangie 14yr"), "9+ letters: 2 mistakes ok");
  assert.ok(m("Shaughnesy", "O'Shaughnessy"));
  assert.ok(m("Peyras", "Peyrassol Rose"), "partial still works");
  assert.ok(m("Peyrsa", "Peyrassol Rose"), "partial with a typo");
});

test("searchMatcher: typos only when nothing matches as typed (pool)", () => {
  const names = ["Fortaleza Blanco", "Acumen Sauvignon Blanc", "Amaro Nonino", "Disaronno Amaretto", "Peyrassol Rose"];
  const pool = names.map((n) => [n]);
  const find = (q: string) => names.filter((n) => searchMatcher(q, { pool })(n));
  assert.deepEqual(find("blanco"), ["Fortaleza Blanco"], "exact hits win, no Sauvignon Blanc");
  assert.deepEqual(find("amaro"), ["Amaro Nonino"], "no Amaretto");
  assert.deepEqual(find("peyrasol"), ["Peyrassol Rose"], "no exact hit → typo found");
  assert.deepEqual(find("zzzzzz"), []);
  assert.ok(searchMatcher("peyrasol")("Peyrassol Rose") === false, "no pool → exact only");
});

test("searchMatcher: typos don't over-match", () => {
  const m = (q: string, name: string) => searchMatcher(q, { typos: "always" })(name);
  assert.ok(!m("gin", "Kin Vodka"), "≤4 letters must be exact");
  assert.ok(!m("rose", "Ross Gin"), "4 letters exact");
  assert.ok(!m("merlot", "Pinot Noir"));
  assert.ok(!m("peyrasol", "Pernod Absinthe"));
  assert.ok(!m("talisker", "Tanqueray"));
  assert.ok(!m("Glenmrnge", "Glenmorangie 14yr"), "3 mistakes is too many");
});

test("searchMatcher: empty search matches everything; extra fields searched", () => {
  assert.ok(searchMatcher("")("anything"));
  assert.ok(searchMatcher("   ")("anything"));
  assert.ok(searchMatcher("southern")("Tito's", "Southern Glazer's"));
});
