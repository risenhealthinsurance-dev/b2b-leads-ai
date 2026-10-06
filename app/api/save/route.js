import { NextResponse } from "next/server";
import { saveLeadsToGoogleSheet } from "@/lib/sheets";

export async function POST(request) {
  try {
    const body = await request.json();
    const { leads, category, location } = body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: "Leads must be a non-empty array." },
        { status: 400 }
      );
    }

    if (!category || !location) {
      return NextResponse.json(
        { error: "Category and location are required." },
        { status: 400 }
      );
    }

    if (process.env.GOOGLE_SHEETS_DRY_RUN === "true") {
      return NextResponse.json({ success: true, dryRun: true, count: leads.length });
    }

    await saveLeadsToGoogleSheet(leads, category, location);

    return NextResponse.json({ success: true, count: leads.length });
  } catch (error) {
    console.error("[API] /api/save failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save leads to Google Sheets." },
      { status: 500 }
    );
  }
}
