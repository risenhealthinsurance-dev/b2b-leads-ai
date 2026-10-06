import axios from "axios";
import searchContract from "./search-contract.cjs";

const { buildSearchQuery } = searchContract;

function buildSerperError(detail, status = 500, originalError) {
  const error = new Error(`Error: Failed Serper API call - ${detail}`);
  error.status = status;
  if (originalError) {
    error.cause = originalError;
  }
  error.details = detail;
  return error;
}

function extractSerperErrorDetail(error) {
  if (error?.response?.data) {
    if (typeof error.response.data === "string") {
      return error.response.data;
    }
    if (typeof error.response.data.error?.message === "string") {
      return error.response.data.error.message;
    }
    if (typeof error.response.data.error === "string") {
      return error.response.data.error;
    }
    try {
      return JSON.stringify(error.response.data);
    } catch {
      return "Unknown Serper error.";
    }
  }
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return "Unknown Serper error.";
}

/**
 * Searches for local businesses using Serper.dev Google Maps API.
 * @param {string} category - The category to search for.
 * @param {string} location - The location to search in.
 * @returns {Promise<Array>} - Array of raw lead objects.
 */
export async function searchMapsViaSerper(category, location, context = {}, supplyCategories = []) {
  const scope = [context.zip, context.quadrant].filter(Boolean).join(" ");
  console.log(`[Serper] searchMapsViaSerper invoked (category="${category}", location="${location}", scope="${scope}")`);

  if (!process.env.SERPER_API_KEY) {
    const detail = "Missing SERPER_API_KEY environment variable.";
    console.error("[Serper]", detail);
    throw buildSerperError(detail);
  }

  try {
    const query = buildSearchQuery({ category, location, context, supplyCategories });
    console.log(`[Serper] Query: ${query}`);
    const data = JSON.stringify({
      q: query,
      gl: "us",
      hl: "en"
    });

    const config = {
      method: "post",
      url: "https://google.serper.dev/maps",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      data: data
    };

    const response = await axios(config);

    if (!response?.data) {
      throw buildSerperError("Received empty response payload from Serper API.", 502);
    }

    const places = response.data.places || [];
    console.log(`[Serper] Successfully retrieved ${places.length} places from Serper API.`);
    return places;
  } catch (error) {
    if (error?.message?.startsWith("Error: Failed Serper API call -")) {
      console.error("[Serper] Serper API call failed:", error.details || error.message);
      throw error;
    }

    const status = error?.response?.status || error?.status || 500;
    const detail = extractSerperErrorDetail(error);
    console.error("[Serper] Serper API request error:", detail, error?.response?.data || error);
    throw buildSerperError(detail, status, error);
  }
}
