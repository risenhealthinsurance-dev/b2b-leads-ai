const QUADRANTS = new Set(["A1", "A2", "B1", "B2"]);
const SUPPLY_TERMS = ["cleaning", "paper", "restaurant", "maintenance", "office", "medical", "salon", "packaging", "safety", "hospitality", "janitorial", "breakroom", "food service", "computer", "it", "mro"];

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

function extractSupplyCategories(prompt = "") {
  return SUPPLY_TERMS.filter((term) => new RegExp(`\\b${term.replace(/ /g, "\\s+")}\\b`, "i").test(prompt));
}

function fallbackExtractFromPrompt(prompt = "") {
  const context = normalizeSearchContext({ prompt });
  const supply_categories = extractSupplyCategories(prompt);
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

function resolveSearchExtraction({ prompt = "", extracted = {}, context = {} } = {}) {
  const fallback = fallbackExtractFromPrompt(prompt);
  const explicit = normalizeSearchContext({ prompt, ...context });
  const modelContext = normalizeSearchContext({ prompt, zip: extracted.zip, quadrant: extracted.quadrant, rep: extracted.rep });
  const resolvedContext = {
    prompt,
    zip: explicit.zip || modelContext.zip || fallback.zip,
    quadrant: explicit.quadrant || modelContext.quadrant || fallback.quadrant,
    rep: explicit.rep || modelContext.rep || fallback.rep || "All Reps",
    coverageIntent: Boolean(explicit.coverageIntent || extracted.coverage_intent || fallback.coverage_intent),
  };
  const supply_categories = [...new Set([
    ...(Array.isArray(extracted.supply_categories) ? extracted.supply_categories : []),
    ...extractSupplyCategories(prompt),
  ].map((value) => String(value).trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  const location = resolvedContext.zip
    ? `ZIP ${resolvedContext.zip}`
    : String(extracted.location || fallback.location || "").trim();
  const category = String(extracted.category || fallback.category || "businesses").trim() || "businesses";
  const intent = String(extracted.intent || fallback.intent || (supply_categories.length ? "recurring supplies" : "")).trim();
  return {
    ...resolvedContext,
    location,
    category,
    intent,
    supply_categories,
    requires_missing_website: Boolean(extracted.requires_missing_website),
  };
}

function buildSearchQuery({ category = "businesses", location = "", context = {}, supplyCategories = [] } = {}) {
  const genericCategory = /^(business|businesses|companies|company|local businesses?)$/i.test(category.trim());
  const supplyClause = Array.isArray(supplyCategories) && supplyCategories.length
    ? ` that use ${supplyCategories.join(", ")} supplies`
    : "";
  const base = `${genericCategory ? "businesses" : category}${supplyClause} in ${location}`.trim();
  const quadrant = context.quadrant ? ` ${context.quadrant}` : "";
  return `${base}${quadrant}`.replace(/\s+/g, " ").trim();
}

function buildSearchMeta({ location = "", category = "", intent = "", context = {}, leads = [], warnings = {} } = {}) {
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
    warnings,
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
  resolveSearchExtraction,
  buildSearchQuery,
  buildSearchMeta,
  normalizeLeadRecord,
};
