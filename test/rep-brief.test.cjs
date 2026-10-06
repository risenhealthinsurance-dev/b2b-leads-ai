const test = require("node:test");
const assert = require("node:assert/strict");
const { toRepBrief } = require("../lib/rep-brief.cjs");

test("maps a complete lead into the versioned rep brief contract", () => {
  const result = toRepBrief([{ business_id: "acme", name: "Acme", address: "1 Main", enrichment_status: "enriched", rating: 4.8, reviews: 21, fit_reasons: ["Local operator"] }], { zip: "34950", quadrant: "A1" });
  assert.equal(result.contractVersion, "1");
  assert.equal(result.accounts[0].businessId, "acme");
  assert.equal(result.accounts[0].enrichmentStatus, "enriched");
  assert.equal(result.accounts[0].publicSignals[0].label, "Rating");
});

test("preserves a partial lead without coordinates or enrichment", () => {
  const result = toRepBrief([{ name: "Partial", enrichment_status: "partial" }], { zip: "34950" });
  assert.equal(result.accounts[0].enrichmentStatus, "partial");
  assert.equal(result.accounts[0].coordinates, undefined);
  assert.ok(result.accounts[0].whyThisAccount.length > 0);
});

test("returns an empty but valid contract for provider failure", () => {
  const result = toRepBrief([], { zip: "34950", quadrant: "A1" }, [{ code: "provider-unavailable", message: "down" }]);
  assert.equal(result.accounts.length, 0);
  assert.equal(result.warnings[0].code, "provider-unavailable");
});
