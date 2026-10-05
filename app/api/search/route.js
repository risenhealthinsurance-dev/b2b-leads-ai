import { NextResponse } from "next/server";
import { analyzeLead, extractDataFromPrompt } from "@/lib/ai";
import { searchMapsViaSerper } from "@/lib/serper";
import { inspectWebsites } from "@/lib/website";

function buildValidationError(detail) {
  const error = new Error(`Error: Invalid input validation failed - ${detail}`);
  error.status = 400;
  error.details = detail;
  return error;
}

function normalizeStatus(error) {
  if (typeof error?.status === "number") return error.status;
  if (typeof error?.statusCode === "number") return error.statusCode;
  if (typeof error?.code === "number" && error.code >= 400 && error.code <= 599) {
    return error.code;
  }
  return 500;
}

async function getRequestBody(request) {
  try {
    const body = await request.json();
    return body || {};
  } catch (error) {
    console.error("[API] Failed to parse request body as JSON:", error);
    throw buildValidationError("Unable to parse request body as JSON.");
  }
}

export async function POST(request) {
  console.log("[API] Received POST /api/search request.");

  try {
    const body = await getRequestBody(request);
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      throw buildValidationError("Prompt is required.");
    }

    console.log("[API] Starting AI extraction step.");
    let extracted;
    try {
      extracted = await extractDataFromPrompt(prompt);
    } catch (error) {
      console.error("[API] extractDataFromPrompt failed:", error);
      throw error;
    }

    const location = typeof extracted.location === "string" ? extracted.location.trim() : "";
    const category = typeof extracted.category === "string" ? extracted.category.trim() : "";
    const intent = typeof extracted.intent === "string" ? extracted.intent.trim() : "";
    const requiresMissingWebsite = !!extracted.requires_missing_website;

    if (!location || !category) {
      throw buildValidationError("Could not extract both location and category from prompt.");
    }

    console.log(`[API] AI extraction successful (location="${location}", category="${category}", intent="${intent}", requiresMissingWebsite=${requiresMissingWebsite})`);

    console.log("[API] Starting Serper search step.");
    let localResults;
    try {
      localResults = await searchMapsViaSerper(category, location);
    } catch (error) {
      console.error("[API] searchMapsViaSerper failed:", error);
      throw error;
    }

    const resultsArray = Array.isArray(localResults) ? localResults : [];
    console.log(`[API] Serper returned ${resultsArray.length} raw results.`);

    let filteredLeads;
    if (requiresMissingWebsite) {
      filteredLeads = resultsArray.filter(item => !item.website && !item.link);
      console.log(`[API] Filtered down to ${filteredLeads.length} leads with no website (Strict Mode).`);
    } else {
      filteredLeads = resultsArray;
      console.log(`[API] Kept all ${filteredLeads.length} leads (Broad Mode).`);
    }

    const websites = filteredLeads.map(lead => lead.website || lead.link || "");
    const inspections = await inspectWebsites(websites, 5);
    const formattedLeads = await Promise.all(filteredLeads.map(async (lead, index) => {
      const formattedLead = {
        name: lead.title || "Unknown",
        address: lead.address || "Unknown",
        // Force phone to be treated as string in Sheets to avoid #ERROR!
        phone: lead.phoneNumber || lead.phone ? `'${lead.phoneNumber || lead.phone}` : "N/A",
        rating: lead.rating || "N/A",
        reviews: lead.reviews || lead.reviewCount || lead.userRatingCount || "N/A",
        website: lead.website || lead.link || "No website found"
      };

      const websiteInspection = inspections[index];
      const intelligence = await analyzeLead({
        name: formattedLead.name,
        address: formattedLead.address,
        phone: formattedLead.phone,
        rating: formattedLead.rating,
        reviews: formattedLead.reviews,
        website: formattedLead.website
      }, websiteInspection);

      return { ...formattedLead, website_inspection: websiteInspection, ...intelligence };
    }));

    if (formattedLeads.length === 0) {
      console.log("[API] No leads found matching the criteria.");
    }

    // Return leads and metadata for the frontend
    return NextResponse.json({
      leads: formattedLeads,
      meta: { location, category, intent }
    });
  } catch (error) {
    const status = normalizeStatus(error);
    const message = error?.message || "Internal Server Error";
    console.error("[API] /api/search failed:", message, error);

    const responsePayload = {
      error: message,
      statusCode: status,
    };

    if (error?.details && error.details !== message) {
      responsePayload.details = error.details;
    }

    return NextResponse.json(responsePayload, { status });
  }
}
