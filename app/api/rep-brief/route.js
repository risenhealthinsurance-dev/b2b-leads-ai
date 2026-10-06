import { NextResponse } from "next/server";
import { searchMapsViaSerper } from "@/lib/serper";
import searchContract from "@/lib/search-contract.cjs";
import { toRepBrief } from "@/lib/rep-brief.cjs";

const { normalizeSearchContext, filterLeadsToContext, normalizeCoordinates, normalizeLeadRecord } = searchContract;

function json(payload, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Access-Control-Allow-Origin", process.env.REIGN_TERRITORY_ORIGIN || "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, x-reign-territory-key");
  return NextResponse.json(payload, { ...init, headers });
}

export async function OPTIONS() {
  return json({ ok: true });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get("zip")?.trim() || "";
  const quadrant = searchParams.get("quadrant")?.trim().toUpperCase() || "";
  const rep = searchParams.get("rep")?.trim() || "";
  const context = normalizeSearchContext({ zip, quadrant, rep });
  const expectedKey = process.env.REIGN_TERRITORY_SHARED_SECRET;
  if (expectedKey && request.headers.get("x-reign-territory-key") !== expectedKey) {
    return json({ error: "Unauthorized rep brief request." }, { status: 401 });
  }
  if (!context.zip) return json({ error: "zip is required" }, { status: 400 });

  try {
    const raw = await searchMapsViaSerper("businesses", `ZIP ${context.zip}`, context, []);
    const scoped = filterLeadsToContext(raw, context).map((lead, index) => normalizeLeadRecord({
      name: lead.title,
      address: lead.address,
      phone: lead.phoneNumber || lead.phone,
      website: lead.website || lead.link,
      rating: lead.rating,
      reviews: lead.reviews || lead.reviewCount,
      coordinates: normalizeCoordinates(lead),
      sources: ["Google Maps"],
      freshness: new Date().toISOString(),
      enrichment_status: "partial",
    }, index, context));
    return json(toRepBrief(scoped, context));
  } catch (error) {
    return json(toRepBrief([], context, [{ code: "provider-unavailable", message: error?.message || "Live discovery is unavailable; use cached or local data." }]), { status: 200 });
  }
}
