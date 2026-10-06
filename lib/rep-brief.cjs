const CONTRACT_VERSION = "1";

function confidenceFor(lead) {
  const value = String(lead?.confidence || lead?.confidence_level || "").toLowerCase();
  if (["high", "medium", "low"].includes(value)) return value;
  return lead?.enrichment_status === "enriched" ? "medium" : "unknown";
}

function toRepAccount(lead, index, context) {
  const coordinates = lead?.coordinates && Number.isFinite(Number(lead.coordinates.latitude)) && Number.isFinite(Number(lead.coordinates.longitude))
    ? { latitude: Number(lead.coordinates.latitude), longitude: Number(lead.coordinates.longitude) }
    : undefined;
  const signals = [
    lead.rating && { label: "Rating", value: `${lead.rating}${lead.reviews ? ` · ${lead.reviews} reviews` : ""}`, source: "Google Maps" },
    lead.detected_payment_setup && { label: "Payment signal", value: String(lead.detected_payment_setup), source: "Website inspection" },
  ].filter(Boolean);
  return {
    businessId: String(lead.business_id || `${String(lead.name || "business").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${context.zip || "unknown"}`),
    name: lead.name || "Unknown business",
    category: lead.category || "Business",
    address: lead.address,
    zip: lead.zip || context.zip,
    quadrant: lead.quadrant || context.quadrant,
    coordinates,
    phone: lead.phone,
    website: lead.website,
    routeOrder: index + 1,
    distanceMiles: lead.distance_miles ? Number(lead.distance_miles) : undefined,
    priorityScore: lead.opportunity_score ? Number(lead.opportunity_score) : undefined,
    whyThisAccount: Array.isArray(lead.fit_reasons) ? lead.fit_reasons : ["Public business signals available"],
    fitReasons: Array.isArray(lead.fit_reasons) ? lead.fit_reasons : [],
    supplyCategories: Array.isArray(lead.supply_categories) ? lead.supply_categories : [],
    publicSignals: signals,
    confidence: confidenceFor(lead),
    freshness: lead.freshness,
    enrichmentStatus: lead.enrichment_status === "enriched" ? "enriched" : lead.enrichment_status === "partial" ? "partial" : "unavailable",
    suggestedOpener: lead.supply_pitch_angle || lead.marketing_pitch_angle || "Ask about the business's current operational priorities.",
    recommendedAction: "Start the visit",
    evidence: signals.map((signal) => ({ ...signal, confidence: confidenceFor(lead) })),
  };
}

function toRepBrief(leads, context, warnings = []) {
  const accounts = Array.isArray(leads) ? leads.map((lead, index) => toRepAccount(lead, index, context)) : [];
  return {
    contractVersion: CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    territory: { zip: context.zip || "", quadrant: context.quadrant || undefined },
    accounts,
    coverage: { discovered: accounts.length, enriched: accounts.filter((account) => account.enrichmentStatus === "enriched").length, remaining: undefined },
    warnings,
  };
}

module.exports = { CONTRACT_VERSION, toRepBrief };
