const QUADRANTS = new Set(["A1", "A2", "B1", "B2"]);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "business";
}

function normalizeSearchContext(input = {}) {
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const zipInput = typeof input.zip === "string" ? input.zip.trim() : "";
  const zip = zipInput || prompt.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || "";
  const quadrantInput = typeof input.quadrant === "string" ? input.quadrant.trim().toUpperCase() : "";
  const rawQuadrant = quadrantInput || prompt.match(/\b(A1|A2|B1|B2)\b/i)?.[0]?.toUpperCase() || "";
  const quadrant = QUADRANTS.has(rawQuadrant) ? rawQuadrant : "";
  const rep = typeof input.rep === "string" ? input.rep.trim() : "";
  const coverageIntent = /\b(every|all|complete|universe|quadrant|coverage|businesses)\b/i.test(prompt);

  return { prompt, zip, quadrant, rep, coverageIntent };
}

function fallbackExtractFromPrompt(prompt = "") {
  const context = normalizeSearchContext({ prompt });
  const supplyTerms = ["cleaning", "paper", "restaurant", "maintenance", "office", "medical", "salon", "packaging", "safety", "hospitality"];
  const supply_categories = supplyTerms.filter((term) => new RegExp(`\\b${term}\\b`, "i").test(prompt));
  const category = /\b(all|every|businesses|business universe|universe)\b/i.test(prompt) ? "businesses" : "businesses";
  return {
    location: context.zip ? `ZIP ${context.zip}` : "",
    category,
    intent: supply_categories.length ? "recurring supplies" : "",
    zip: context.zip,
    quadrant: context.quadrant,
    rep: context.rep,
    coverage_intent: context.coverageIntent,
    supply_categories,
    requires_missing_website: false,
  };
}

function buildSearchMeta({ location = "", category = "", intent = "", context = {}, leads = [] } = {}) {
  const discovered = Array.isArray(leads) ? leads.length : 0;
  const enriched = Array.isArray(leads)
    ? leads.filter((lead) => lead?.enrichment_status === "enriched").length
    : 0;

  return {
    location,
    category,
    intent,
    zip: context.zip || "",
    quadrant: context.quadrant || "",
    rep: context.rep || "All Reps",
    coverageIntent: Boolean(context.coverageIntent),
    coverage: {
      discovered,
      enriched,
      totalKnown: null,
      remaining: null,
      status: "measured-session-progress",
      quadrantsComplete: [],
      quadrantsRemaining: ["A1", "A2", "B1", "B2"],
    },
  };
}

function normalizeLeadRecord(lead = {}, index = 0, context = {}) {
  const name = lead.name || lead.title || "Unknown business";
  const zip = context.zip || "unknown-zip";
  const hasEvidence = Boolean(lead.website && lead.website !== "No website found") || Boolean(lead.address);
  const sources = Array.isArray(lead.sources) ? lead.sources.filter(Boolean) : [];

  return {
    ...lead,
    business_id: lead.business_id || `${slugify(name)}-${slugify(zip)}`,
    source_index: index,
    zip: context.zip || lead.zip || "",
    quadrant: context.quadrant || lead.quadrant || "",
    rep: context.rep || lead.rep || "All Reps",
    enrichment_status: lead.enrichment_status || (hasEvidence ? "partial" : "source-error"),
    sources,
    freshness: lead.freshness || "Freshness not available",
    amazon_business_status: "Unknown — verify conversationally.",
  };
}

module.exports = {
  normalizeSearchContext,
  fallbackExtractFromPrompt,
  buildSearchMeta,
  normalizeLeadRecord,
};
