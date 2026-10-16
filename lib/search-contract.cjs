const QUADRANTS = new Set(["A1", "A2", "B1", "B2"]);
const CATEGORY_ALIASES = {
  restaurant: ["restaurant", "restaurants", "food", "dining", "eatery", "grill", "cafe", "café", "bistro", "tapas", "bar & grill", "steakhouse"],
  cafe: ["cafe", "café", "coffee", "coffee shop", "bakery"],
  dentist: ["dentist", "dental"],
  plumber: ["plumber", "plumbing"],
};

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "business";
}

function normalizeZip(value = "") {
  const match = String(value || "").trim().match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : String(value || "").trim();
}

function requiresMissingWebsiteIntent(prompt = "") {
  return /\b(?:website development|web design|needs? a website|without (?:a )?website(?:s)?|no website(?:s)?)\b/i.test(String(prompt || ""));
}

function normalizeSearchContext(input = {}) {
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const zipInput = typeof input.zip === "string" ? input.zip.trim() : "";
  const zip = normalizeZip(zipInput || prompt.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || "");
  const quadrantInput = typeof input.quadrant === "string" ? input.quadrant.trim().toUpperCase() : "";
  const rawQuadrant = quadrantInput || prompt.match(/\b(A1|A2|B1|B2)\b/i)?.[0]?.toUpperCase() || "";
  const quadrant = QUADRANTS.has(rawQuadrant) ? rawQuadrant : "";
  const rep = typeof input.rep === "string" ? input.rep.trim() : "";
  const coverageIntent = /\b(every|all|complete|universe|quadrant|coverage|businesses)\b/i.test(prompt);

  return { prompt, zip, quadrant, rep, coverageIntent };
}

function resolveAuthoritativeZip(prompt = "", fieldZip = "") {
  const promptZip = normalizeZip(String(prompt).match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || "");
  const field = normalizeZip(fieldZip);
  return { zip: promptZip || field, promptZip, overridden: Boolean(promptZip && promptZip !== field) };
}

function requestedCategoryFromPrompt(prompt = "") {
  const value = String(prompt || "").toLowerCase();
  for (const category of Object.keys(CATEGORY_ALIASES)) {
    if (new RegExp(`\\b${category}s?\\b`, "i").test(value)) return category;
  }
  return "";
}

function classifyCategoryMatch(lead = {}, requestedCategory = "") {
  const requested = String(requestedCategory || "").trim().toLowerCase();
  if (!requested || !CATEGORY_ALIASES[requested]) return { categoryMatch: "verified", categoryEvidence: "Broad business search", categorySource: "search-intent" };
  const providerCategory = String(lead.category || lead.type || lead.categoryName || "").toLowerCase();
  const text = [lead.title, lead.name, lead.snippet, providerCategory].filter(Boolean).join(" ").toLowerCase();
  const aliases = CATEGORY_ALIASES[requested];
  if (providerCategory && aliases.some((alias) => providerCategory.includes(alias))) return { categoryMatch: "verified", categoryEvidence: providerCategory, categorySource: "provider-category" };
  if (aliases.some((alias) => text.includes(alias))) return { categoryMatch: "probable", categoryEvidence: text, categorySource: "provider-text" };
  return { categoryMatch: "unverified", categoryEvidence: "No matching provider category evidence", categorySource: "none" };
}

function fallbackExtractFromPrompt(prompt = "") {
  const context = normalizeSearchContext({ prompt });
  const category = /\b(all|every|businesses|business universe|universe)\b/i.test(prompt) ? "businesses" : "businesses";
  return {
    location: context.zip ? `ZIP ${context.zip}` : "",
    category,
    intent: "",
    zip: context.zip,
    quadrant: context.quadrant,
    rep: context.rep,
    coverage_intent: context.coverageIntent,
    requires_missing_website: requiresMissingWebsiteIntent(prompt),
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
  const location = resolvedContext.zip
    ? `ZIP ${resolvedContext.zip}`
    : String(extracted.location || fallback.location || "").trim();
  const category = String(extracted.category || fallback.category || "businesses").trim() || "businesses";
  const intent = String(extracted.intent || fallback.intent || "").trim();
  return {
    ...resolvedContext,
    location,
    category,
    intent,
    requires_missing_website: Boolean(extracted.requires_missing_website || fallback.requires_missing_website || requiresMissingWebsiteIntent(prompt)),
  };
}

function buildSearchQuery({ category = "businesses", location = "", context = {} } = {}) {
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

function buildSearchMeta({ location = "", category = "", intent = "", context = {}, leads = [], warnings = {}, source = {}, categoryAudit = {}, requestMeta = {} } = {}) {
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
    categoryAudit,
    request: requestMeta,
    source: {
      discovery: source.discovery || "serper-google-maps",
      extraction: source.extraction || "openrouter",
      enrichment: source.enrichment || (enriched === discovered ? "openrouter" : "partial"),
      intentMode: source.intentMode || "broad",
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
    return explicitZip === zip || zipPattern.test(address);
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
    categoryFiltered: Number(input.categoryFiltered) || 0,
    categoryUnverified: Number(input.categoryUnverified) || 0,
    coordinatesMissing: Number(input.coordinatesMissing) || 0,
    outOfScopeResults: Number(input.outOfScopeResults) || 0,
    liveProviderVariability: Boolean(input.liveProviderVariability),
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
  if (warnings.categoryFiltered) warnings.messages.push(`${warnings.categoryFiltered} live records were excluded because category evidence was insufficient.`);
  if (warnings.categoryUnverified) warnings.messages.push(`${warnings.categoryUnverified} returned records require category verification.`);
  if (warnings.coordinatesMissing) warnings.messages.push(`${warnings.coordinatesMissing} businesses do not have verified map coordinates.`);
  return warnings;
}

function buildWarningDetails(input = {}) {
  const details = [];
  if (input.extractionFallback) details.push({ code: "extraction-fallback", summary: "Natural-language parsing used a deterministic fallback.", details: input.extractionDetail || "OpenRouter structured output was unavailable or malformed." });
  if (input.websiteFailures) details.push({ code: "website-inspection", summary: `${input.websiteFailures} website inspections were unavailable.`, details: "Businesses remain in the results; website-dependent enrichment may be partial." });
  if (input.enrichmentFailures) details.push({ code: "enrichment-partial", summary: `${input.enrichmentFailures} leads have partial intelligence.`, details: "Observed business data is retained and unsupported inferences are marked unknown." });
  if (input.serperFailure) details.push({ code: "discovery-failure", summary: "Live business discovery failed.", details: input.serperDetail || "The live discovery provider did not return usable results." });
  if (input.categoryFiltered) details.push({ code: "category-filtered", summary: "Some records were excluded by category relevance.", details: `${input.categoryFiltered} ZIP-valid records did not contain sufficient evidence for the requested category.` });
  if (input.coordinatesMissing) details.push({ code: "coordinates-missing", summary: "Some businesses have no verified map location.", details: `${input.coordinatesMissing} returned businesses remain in the list but are omitted from the map.` });
  if (input.liveProviderVariability) details.push({ code: "live-provider-variability", summary: "Results come from a live provider.", details: "Repeated searches may return different counts as provider listings change." });
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
  };
}

module.exports = {
  normalizeZip,
  requiresMissingWebsiteIntent,
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
  requestedCategoryFromPrompt,
  classifyCategoryMatch,
};
