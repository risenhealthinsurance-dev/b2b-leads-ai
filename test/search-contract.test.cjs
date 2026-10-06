const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeSearchContext,
  buildSearchMeta,
  normalizeLeadRecord,
  fallbackExtractFromPrompt,
  resolveSearchExtraction,
  buildSearchQuery,
} = require("../lib/search-contract.cjs");

test("normalizes ZIP, quadrant, rep, and coverage intent without losing the natural-language prompt", () => {
  const result = normalizeSearchContext({
    prompt: "Find every business in ZIP 77096, quadrant A1",
    zip: " 77096 ",
    quadrant: "a1",
    rep: "All Reps",
  });

  assert.deepEqual(result, {
    prompt: "Find every business in ZIP 77096, quadrant A1",
    zip: "77096",
    quadrant: "A1",
    rep: "All Reps",
    coverageIntent: true,
  });
});

test("reports measured coverage and leaves unmeasured totals explicitly unknown", () => {
  const meta = buildSearchMeta({
    location: "ZIP 77096",
    category: "businesses",
    intent: "recurring supplies",
    context: { zip: "77096", quadrant: "A1", rep: "All Reps", coverageIntent: true },
    leads: [
      { enrichment_status: "enriched" },
      { enrichment_status: "partial" },
    ],
  });

  assert.equal(meta.zip, "77096");
  assert.equal(meta.quadrant, "A1");
  assert.equal(meta.coverage.discovered, 2);
  assert.equal(meta.coverage.enriched, 1);
  assert.equal(meta.coverage.totalKnown, null);
  assert.equal(meta.coverage.remaining, null);
  assert.equal(meta.coverage.status, "measured-session-progress");
  assert.deepEqual(meta.coverage.quadrantsRemaining, ["A1", "A2", "B1", "B2"]);
});

test("normalizes a lead with stable identity and safe public-intelligence defaults", () => {
  const result = normalizeLeadRecord({
    name: "Precision Auto & Tire",
    address: "77096",
    website: "No website found",
  }, 0, { zip: "77096", quadrant: "A1" });

  assert.equal(result.business_id, "precision-auto-tire-77096");
  assert.equal(result.quadrant, "A1");
  assert.equal(result.enrichment_status, "partial");
  assert.deepEqual(result.sources, []);
  assert.equal(result.amazon_business_status, "Unknown — verify conversationally.");
});

test("falls back to safe ZIP and supply intent extraction when the model returns no JSON", () => {
  const result = fallbackExtractFromPrompt("Find every business in ZIP 77096 that likely buys recurring cleaning, paper, restaurant, or maintenance supplies");

  assert.equal(result.location, "ZIP 77096");
  assert.equal(result.category, "businesses");
  assert.equal(result.zip, "77096");
  assert.equal(result.coverage_intent, true);
  assert.deepEqual(result.supply_categories, ["cleaning", "paper", "restaurant", "maintenance"]);
});

test("explicit request context overrides contradictory model extraction", () => {
  const result = resolveSearchExtraction({
    prompt: "Find every business in ZIP 77096 that buys cleaning supplies",
    extracted: {
      location: "34950",
      category: "businesses",
      zip: "34950",
      quadrant: "B2",
      rep: "James R.",
      supply_categories: [],
    },
    context: { zip: "77096", quadrant: "A1", rep: "All Reps" },
  });

  assert.equal(result.location, "ZIP 77096");
  assert.equal(result.zip, "77096");
  assert.equal(result.quadrant, "A1");
  assert.equal(result.rep, "All Reps");
  assert.deepEqual(result.supply_categories, ["cleaning"]);
});

test("builds a scoped maps query from supply intent instead of generic businesses", () => {
  const query = buildSearchQuery({
    category: "businesses",
    location: "ZIP 77096",
    context: { zip: "77096", quadrant: "A1" },
    supplyCategories: ["cleaning", "paper", "maintenance"],
  });

  assert.equal(query, "businesses that use cleaning, paper, maintenance supplies in ZIP 77096 A1");
});
