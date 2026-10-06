const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeSearchContext,
  buildSearchMeta,
  normalizeLeadRecord,
  fallbackExtractFromPrompt,
  resolveSearchExtraction,
  buildSearchQuery,
  normalizeCoordinates,
  buildWarningState,
  filterLeadsToContext,
  getMapCoordinates,
  normalizeZip,
  requiresMissingWebsiteIntent,
} = require("../lib/search-contract.cjs");
const { validateSearchPrompt } = require("../lib/search-validation.cjs");
const { resolveAuthoritativeZip, buildWarningDetails } = require("../lib/search-contract.cjs");

test("requires a non-whitespace search prompt", () => {
  assert.deepEqual(validateSearchPrompt(""), { valid: false, error: "Search prompt is required." });
  assert.deepEqual(validateSearchPrompt("   \n"), { valid: false, error: "Search prompt is required." });
  assert.deepEqual(validateSearchPrompt("Find businesses"), { valid: true, error: "" });
});

test("prompt ZIP overrides the dedicated ZIP while preserving field-only ZIP behavior", () => {
  assert.deepEqual(resolveAuthoritativeZip("Find businesses in ZIP 77096", "77099"), { zip: "77096", promptZip: "77096", overridden: true });
  assert.deepEqual(resolveAuthoritativeZip("Find businesses in Houston", "77099"), { zip: "77099", promptZip: "", overridden: false });
  assert.equal(normalizeZip("77096-1234"), "77096");
  assert.deepEqual(resolveAuthoritativeZip("Find businesses in ZIP 77096-1234", "77099-0001"), { zip: "77096", promptZip: "77096", overridden: true });
});

test("detects strict no-website intent without incorrectly enabling it for broad searches", () => {
  assert.equal(requiresMissingWebsiteIntent("Find restaurants that need a website"), true);
  assert.equal(requiresMissingWebsiteIntent("Find businesses without websites"), true);
  assert.equal(requiresMissingWebsiteIntent("Find restaurants for digital marketing"), false);
  const fallback = fallbackExtractFromPrompt("Find restaurants in ZIP 77096 that need a website");
  assert.equal(fallback.requires_missing_website, true);
});

test("warning details are structured for concise UI summaries", () => {
  const details = buildWarningDetails({ extractionFallback: true, websiteFailures: 2, enrichmentFailures: 1 });
  assert.deepEqual(details.map((item) => item.code), ["extraction-fallback", "website-inspection", "enrichment-partial"]);
});

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

  assert.equal(query, "businesses in ZIP 77096");
});

test("normalizes valid Serper coordinates and rejects invalid values", () => {
  assert.deepEqual(normalizeCoordinates({ latitude: "29.6516", longitude: "-95.4278" }), { latitude: 29.6516, longitude: -95.4278 });
  assert.equal(normalizeCoordinates({ latitude: 0, longitude: 181 }), null);
  assert.equal(normalizeCoordinates({ lat: "not-a-number", lng: "-95" }), null);
});

test("builds structured warning state without exposing provider details", () => {
  const warnings = buildWarningState({
    extractionFallback: true,
    openRouterUnavailable: true,
    serperFailure: true,
    websiteFailures: 2,
    enrichmentFailures: 1,
    zeroResults: true,
  });

  assert.equal(warnings.extractionFallback, true);
  assert.equal(warnings.openRouterUnavailable, true);
  assert.equal(warnings.serperFailure, true);
  assert.equal(warnings.websiteFailures, 2);
  assert.equal(warnings.enrichmentFailures, 1);
  assert.equal(warnings.zeroResults, true);
  assert.ok(warnings.messages.some((message) => message.includes("OpenRouter")));
  assert.ok(warnings.messages.some((message) => message.includes("Serper")));
});

test("filters discovery results that contradict the authoritative ZIP", () => {
  const results = filterLeadsToContext([
    { title: "In scope", address: "10 Main St, Houston, TX 77096" },
    { title: "Out of scope", address: "20 Main St, Houston, TX 77099" },
    { title: "Unlocated", address: "" },
  ], { zip: "77096" });

  assert.deepEqual(results.map((lead) => lead.title), ["In scope"]);
});

test("never fabricates map coordinates when a lead has no coordinates", () => {
  assert.deepEqual(getMapCoordinates({ coordinates: { latitude: 29.7, longitude: -95.4 } }, 0), [-95.4, 29.7]);
  assert.equal(getMapCoordinates({}, 5), null);
});
