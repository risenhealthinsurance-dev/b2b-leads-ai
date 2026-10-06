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
  priority_1_marketing_and_processing: {
    detected_payment_setup: "Unknown",
    payment_processing_opportunity: "Unable to determine from the available business data.",
    digital_marketing_flaws: [],
    marketing_pitch_angle: "Offer a quick audit of the business's website, local visibility, and customer acquisition setup."
  },
  priority_2_amazon_supplies_inference: {
    primary_amazon_category: "Office Products",
    estimated_monthly_order_volume: "Low: <$500/mo",
    high_probability_amazon_skus: [],
    supply_pitch_angle: "Offer consolidated purchasing and volume pricing for the supplies this business uses most often."
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
  const priority1 = data.priority_1_marketing_and_processing || {};
  const priority2 = data.priority_2_amazon_supplies_inference || {};
  return {
    priority_1_marketing_and_processing: {
      detected_payment_setup: priority1.detected_payment_setup || EMPTY_LEAD_INTELLIGENCE.priority_1_marketing_and_processing.detected_payment_setup,
      payment_processing_opportunity: priority1.payment_processing_opportunity || EMPTY_LEAD_INTELLIGENCE.priority_1_marketing_and_processing.payment_processing_opportunity,
      digital_marketing_flaws: Array.isArray(priority1.digital_marketing_flaws) ? priority1.digital_marketing_flaws.filter(Boolean).slice(0, 3) : [],
      marketing_pitch_angle: priority1.marketing_pitch_angle || EMPTY_LEAD_INTELLIGENCE.priority_1_marketing_and_processing.marketing_pitch_angle
    },
    priority_2_amazon_supplies_inference: {
      primary_amazon_category: priority2.primary_amazon_category || EMPTY_LEAD_INTELLIGENCE.priority_2_amazon_supplies_inference.primary_amazon_category,
      estimated_monthly_order_volume: priority2.estimated_monthly_order_volume || EMPTY_LEAD_INTELLIGENCE.priority_2_amazon_supplies_inference.estimated_monthly_order_volume,
      high_probability_amazon_skus: Array.isArray(priority2.high_probability_amazon_skus) ? priority2.high_probability_amazon_skus.filter(Boolean).slice(0, 5) : [],
      supply_pitch_angle: priority2.supply_pitch_angle || EMPTY_LEAD_INTELLIGENCE.priority_2_amazon_supplies_inference.supply_pitch_angle
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
          - supply_categories (array of broad supply categories mentioned or inferred from the prompt)
          - requires_missing_website (boolean): Set to true ONLY if the user explicitly wants leads for "website development", "web design", or specifically mentions finding businesses "without websites". For "digital marketing", "SEO", "ads", or general searches, set this to false.

          Return the result as a valid JSON object with keys: "location", "category", "intent", "zip", "quadrant", "rep", "coverage_intent", "supply_categories", "requires_missing_website".
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
      supply_categories: Array.isArray(data.supply_categories) && data.supply_categories.length ? data.supply_categories.filter(Boolean).slice(0, 8) : fallback.supply_categories,
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
        content: `You are a dual-domain intelligence analyst specializing in B2B service qualification and procurement inference.

Analyze the provided business data (Google Maps profile, website metadata, and review volume) and generate a JSON response following this exact structure:
{
  "priority_1_marketing_and_processing": {
    "detected_payment_setup": "Inferred or detected gateway (e.g., Square, Toast, Stripe, or Legacy Cash/Terminal)",
    "payment_processing_opportunity": "Specific pitch angle highlighting fee reduction, mobile payment integration, or POS upgrading.",
    "digital_marketing_flaws": ["List 2-3 explicit marketing weaknesses"],
    "marketing_pitch_angle": "A 1-sentence customized offer for digital marketing, web redesign, or local SEO."
  },
  "priority_2_amazon_supplies_inference": {
    "primary_amazon_category": "Select one: Office Products | Computer & IT | MRO | Janitorial & Cleaning | Medical Supplies | Food Service | Breakroom",
    "estimated_monthly_order_volume": "Estimated supply volume tier based on review count and category",
    "high_probability_amazon_skus": ["List 3 specific consumable bulk items they purchase regularly"],
    "supply_pitch_angle": "A 1-sentence angle pitching bulk purchasing, consolidated invoicing, or volume discounts."
  }
}

Do not include markdown code blocks, conversational intros, or commentary outside the JSON object. Use only evidence or clearly labeled inference from the supplied data.`
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
