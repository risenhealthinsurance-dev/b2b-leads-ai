import OpenAI from "openai";
import searchContract from "./search-contract.cjs";

const { fallbackExtractFromPrompt } = searchContract;

function buildOpenRouterError(detail, status = 500, originalError) {
  const error = new Error(`Error: Failed OpenRouter API call - ${detail}`);
  error.status = status;
  if (originalError) {
    error.cause = originalError;
  }
  error.details = detail;
  return error;
}

function extractOpenRouterErrorDetail(error) {
  if (error?.response?.data?.error?.message) {
    return error.response.data.error.message;
  }
  if (error?.response?.data?.error) {
    if (typeof error.response.data.error === "string") {
      return error.response.data.error;
    }
    try {
      return JSON.stringify(error.response.data.error);
    } catch {
      return "Unknown OpenRouter error.";
    }
  }
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return "Unknown OpenRouter error.";
}

const EMPTY_LEAD_INTELLIGENCE = {
  payment_and_ordering_intelligence: {
    detected_payment_setup: "Unknown",
    payment_processor_evidence: [],
    payment_processing_opportunity: "Unable to determine from the available business data.",
    website_ordering_status: "Not detected",
    ordering_platform: "Unknown",
    ordering_evidence: [],
    delivery_capability: "Not detected",
    ordering_sales_opportunity: "Unable to determine whether the business supports first-party delivery ordering."
  }
};

function parseJsonResponse(content) {
  if (typeof content !== "string" || !content.trim()) throw new SyntaxError("OpenRouter returned an empty response.");
  let cleanedContent = content.replace(/\x60{3}json\s*/gi, "").replace(/\x60{3}/g, "").trim();
  const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleanedContent = jsonMatch[0];
  return JSON.parse(cleanedContent);
}

function normalizeLeadIntelligence(data = {}) {
  const intelligence = data.payment_and_ordering_intelligence || data.priority_1_marketing_and_processing || {};
  return {
    payment_and_ordering_intelligence: {
      detected_payment_setup: intelligence.detected_payment_setup || EMPTY_LEAD_INTELLIGENCE.payment_and_ordering_intelligence.detected_payment_setup,
      payment_processor_evidence: Array.isArray(intelligence.payment_processor_evidence) ? intelligence.payment_processor_evidence.filter(Boolean).slice(0, 5) : [],
      payment_processing_opportunity: intelligence.payment_processing_opportunity || EMPTY_LEAD_INTELLIGENCE.payment_and_ordering_intelligence.payment_processing_opportunity,
      website_ordering_status: intelligence.website_ordering_status || EMPTY_LEAD_INTELLIGENCE.payment_and_ordering_intelligence.website_ordering_status,
      ordering_platform: intelligence.ordering_platform || EMPTY_LEAD_INTELLIGENCE.payment_and_ordering_intelligence.ordering_platform,
      ordering_evidence: Array.isArray(intelligence.ordering_evidence) ? intelligence.ordering_evidence.filter(Boolean).slice(0, 5) : [],
      delivery_capability: intelligence.delivery_capability || EMPTY_LEAD_INTELLIGENCE.payment_and_ordering_intelligence.delivery_capability,
      ordering_sales_opportunity: intelligence.ordering_sales_opportunity || EMPTY_LEAD_INTELLIGENCE.payment_and_ordering_intelligence.ordering_sales_opportunity
    }
  };
}

async function requestOpenRouter(openrouter, messages) {
  const stream = await openrouter.chat.completions.create({
    model: process.env.OPENROUTER_MODEL || "openrouter/free",
    messages,
    temperature: 0.3,
    stream: true,
  }, { signal: AbortSignal.timeout(20000) });
  let fullContent = "";
  for await (const chunk of stream) {
    const content = chunk?.choices?.[0]?.delta?.content;
    if (content !== undefined && typeof content !== "string") throw new SyntaxError("OpenRouter returned an invalid stream chunk.");
    fullContent += content || "";
  }
  return parseJsonResponse(fullContent);
}

/**
 * Extracts location, category, and intent from a natural language prompt.
 * @param {string} prompt - The user's input prompt.
 * @returns {Promise<{location: string, category: string, intent: string}>}
 */
export async function extractDataFromPrompt(prompt) {
  console.log("[AI] extractDataFromPrompt invoked");

  if (!process.env.OPENROUTER_API_KEY) {
    const detail = "Missing OPENROUTER_API_KEY environment variable.";
    const fallback = fallbackExtractFromPrompt(prompt);
    console.error("[AI]", detail, "Using deterministic extraction fallback.");
    return { ...fallback, _warning: "OpenRouter was unavailable; deterministic prompt extraction was used." };
  }

  const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 20000,
  });

  try {
    console.log("[AI] Sending prompt to OpenRouter.");
    const data = await requestOpenRouter(openrouter, [
        {
          role: "system",
          content: `You are a helpful assistant that extracts structured data from a search prompt.
          Extract the following fields:
          - location (e.g., "Nagaon Assam")
          - category (e.g., "cafe")
          - intent (optional, e.g., "website development")
          - zip (optional five-digit ZIP code)
          - quadrant (optional one of A1, A2, B1, B2)
          - rep (optional representative name or "All Reps")
          - coverage_intent (boolean): true when the user asks for every business, complete coverage, a business universe, or quadrant-by-quadrant discovery.
          - requires_missing_website (boolean): Set to true ONLY if the user explicitly wants leads for "website development", "web design", or specifically mentions finding businesses "without websites". For "digital marketing", "SEO", "ads", or general searches, set this to false.

          Return the result as a valid JSON object with keys: "location", "category", "intent", "zip", "quadrant", "rep", "coverage_intent", "requires_missing_website".
          If a field is not found, use an empty string (or false for boolean).`
        },
        {
          role: "user",
          content: prompt
        }
      ]);
    console.log("[AI] Successfully parsed OpenRouter response.");

    const fallback = fallbackExtractFromPrompt(prompt);

    return {
      location: data.location || fallback.location,
      category: data.category || fallback.category,
      intent: data.intent || fallback.intent,
      zip: data.zip || fallback.zip,
      quadrant: data.quadrant || fallback.quadrant,
      rep: data.rep || fallback.rep,
      coverage_intent: Boolean(data.coverage_intent || fallback.coverage_intent),
      requires_missing_website: !!data.requires_missing_website
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      const fallback = fallbackExtractFromPrompt(prompt);
      if (fallback.location && fallback.category) {
        console.warn("[AI] Model returned malformed content; using safe prompt extraction fallback.");
        return { ...fallback, _warning: "OpenRouter returned malformed structured output; deterministic prompt extraction was used." };
      }
    }
    const fallback = fallbackExtractFromPrompt(prompt);
    if (fallback.location && fallback.category && (!error?.response || error?.name === "AbortError" || error?.name === "TimeoutError")) {
      console.warn("[AI] OpenRouter unavailable; using safe prompt extraction fallback.");
      return { ...fallback, _warning: "OpenRouter was unavailable; deterministic prompt extraction was used." };
    }
    const status = error?.response?.status || error?.status || 500;
    const detail = extractOpenRouterErrorDetail(error);
    console.error("[AI] OpenRouter API call failed:", detail, error?.response?.data || error);
    throw buildOpenRouterError(detail, status, error);
  }
}

export async function analyzeLead(lead, websiteInspection = {}) {
  console.log(`[AI] Analyzing lead intelligence for ${lead?.title || "Unknown"}.`);
  if (!process.env.OPENROUTER_API_KEY) {
    return { ...EMPTY_LEAD_INTELLIGENCE, _warning: "OpenRouter enrichment is unavailable; the lead was kept with partial intelligence." };
  }

  const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 20000,
  });

  try {
    const data = await requestOpenRouter(openrouter, [
      {
        role: "system",
        content: `You are a website intelligence analyst specializing in restaurant POS, payment processing, and first-party online ordering qualification.

Analyze the provided business data (Google Maps profile, website inspection evidence, page text markers, and review volume) and generate a JSON response following this exact structure:
{
  "payment_and_ordering_intelligence": {
    "detected_payment_setup": "Inferred or detected gateway (e.g., Square, Toast, Stripe, or Legacy Cash/Terminal)",
    "payment_processor_evidence": ["Specific observed payment or POS evidence"],
    "payment_processing_opportunity": "Specific evidence-based payment/POS sales angle.",
    "website_ordering_status": "First-party | Direct platform | Third-party redirect | Not detected",
    "ordering_platform": "Detected ordering provider or Unknown",
    "ordering_evidence": ["Specific ordering button, link, domain, script, or checkout evidence"],
    "delivery_capability": "Delivery | Pickup only | Both | Not detected",
    "ordering_sales_opportunity": "Specific pitch for bringing delivery ordering onto the restaurant's own website."
  }
}

Do not include Amazon supplies, procurement, or generic marketing analysis. A button linking to ChowNow, DoorDash, Uber Eats, Grubhub, or another third-party domain is a Third-party redirect, not first-party ordering. Use only evidence or clearly labeled inference from the supplied data. Do not include markdown code blocks or commentary outside the JSON object.`
      },
      { role: "user", content: JSON.stringify({
        business: lead,
        website_inspection: websiteInspection,
        instructions: "Use detected signals as evidence. If a signal is absent, say it was not detected; do not claim compliance, fees, ad activity, or purchasing behavior as fact."
      }) }
    ]);
    return normalizeLeadIntelligence(data);
  } catch (error) {
    console.error("[AI] Lead intelligence analysis failed:", extractOpenRouterErrorDetail(error));
    return { ...EMPTY_LEAD_INTELLIGENCE, _warning: "OpenRouter enrichment returned invalid data; the lead was kept with partial intelligence." };
  }
}
