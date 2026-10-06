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

function resolveAuthoritativeZip(prompt = "", fieldZip = "") {
  const promptZip = String(prompt).match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || "";
  const field = String(fieldZip || "").trim();
  return { zip: promptZip || field, promptZip, overridden: Boolean(promptZip && promptZip !== field) };
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
  // Keep provider discovery geographic/category-first. Supply intent is used
  // later for enrichment and ranking; putting it into the Maps query causes
  // Google to return nearby suppliers outside the authoritative ZIP.
  const base = `${genericCategory ? "businesses" : category} in ${location}`.trim();
  // Quadrants are an internal territory partition, not a provider-recognized
  // geographic term. Search the authoritative ZIP and assign the active
  // quadrant after results are normalized instead of filtering provider data
  // with an opaque token such as "A1".
  return base.replace(/\s+/g, " ").trim();
}

function buildSearchMeta({ location = "", category = "", intent = "", context = {}, leads = [], warnings = {}, source = {} } = {}) {
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
    source: {
      discovery: source.discovery || "serper-google-maps",
      extraction: source.extraction || "openrouter",
      enrichment: source.enrichment || (enriched === discovered ? "openrouter" : "partial"),
    },
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

function normalizeCoordinates(value = {}) {
  const latitude = Number(value.latitude ?? value.lat ?? value.coordinates?.lat);
  const longitude = Number(value.longitude ?? value.lng ?? value.coordinates?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function getMapCoordinates(lead = {}, index = 0) {
  const coordinates = normalizeCoordinates(lead.coordinates || lead);
  if (coordinates) return [coordinates.longitude, coordinates.latitude];
  return null;
}

function filterLeadsToContext(leads = [], context = {}) {
  const zip = String(context.zip || "").trim();
  if (!zip || !Array.isArray(leads)) return Array.isArray(leads) ? leads : [];
  const zipPattern = new RegExp(`\\b${zip.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`);
  return leads.filter((lead) => {
    const explicitZip = String(lead?.zip || "").trim();
    const address = String(lead?.address || "");
    return (!explicitZip && !address) || explicitZip === zip || zipPattern.test(address);
  });
}

function buildWarningState(input = {}) {
  const warnings = {
    extractionFallback: Boolean(input.extractionFallback),
    malformedOpenRouter: Boolean(input.malformedOpenRouter),
    openRouterUnavailable: Boolean(input.openRouterUnavailable),
    serperFailure: Boolean(input.serperFailure),
    websiteFailures: Number(input.websiteFailures) || 0,
    enrichmentFailures: Number(input.enrichmentFailures) || 0,
    zeroResults: Boolean(input.zeroResults),
    contextOverride: Boolean(input.contextOverride),
    messages: [],
  };
  if (warnings.extractionFallback) warnings.messages.push("Deterministic prompt extraction fallback was used.");
  if (warnings.malformedOpenRouter) warnings.messages.push("OpenRouter returned malformed structured output; fallback extraction was used.");
  if (warnings.openRouterUnavailable) warnings.messages.push("OpenRouter was unavailable; available leads may have partial intelligence.");
  if (warnings.serperFailure) warnings.messages.push("Serper business discovery failed; no live businesses were returned.");
  if (warnings.websiteFailures) warnings.messages.push(`${warnings.websiteFailures} website inspections were unavailable or returned HTTP errors.`);
  if (warnings.enrichmentFailures) warnings.messages.push(`${warnings.enrichmentFailures} leads kept partial intelligence because enrichment output was invalid or unavailable.`);
  if (warnings.zeroResults) warnings.messages.push("No businesses were returned for the active search scope.");
  if (warnings.contextOverride) warnings.messages.push("The selected ZIP, quadrant, and representative took precedence over conflicting model extraction.");
  return warnings;
}

function buildWarningDetails(input = {}) {
  const details = [];
  if (input.extractionFallback) details.push({ code: "extraction-fallback", summary: "Natural-language parsing used a deterministic fallback.", details: input.extractionDetail || "OpenRouter structured output was unavailable or malformed." });
  if (input.websiteFailures) details.push({ code: "website-inspection", summary: `${input.websiteFailures} website inspections were unavailable.`, details: "Businesses remain in the results; website-dependent enrichment may be partial." });
  if (input.enrichmentFailures) details.push({ code: "enrichment-partial", summary: `${input.enrichmentFailures} leads have partial intelligence.`, details: "Observed business data is retained and unsupported inferences are marked unknown." });
  if (input.serperFailure) details.push({ code: "discovery-failure", summary: "Live business discovery failed.", details: input.serperDetail || "The live discovery provider did not return usable results." });
  return details;
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
  buildWarningDetails,
  resolveAuthoritativeZip,
  normalizeCoordinates,
  getMapCoordinates,
  filterLeadsToContext,
  buildWarningState,
  normalizeLeadRecord,
};
