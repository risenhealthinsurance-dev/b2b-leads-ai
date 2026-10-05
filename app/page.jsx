"use client";

import { useState } from "react";
import { FaPaperPlane, FaSearch, FaCheck, FaExclamationTriangle, FaGoogle, FaExternalLinkAlt } from "react-icons/fa";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults([]);
    setMeta(null);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch leads");
      }

      const data = await res.json();
      setResults(data.leads || []);
      setMeta(data.meta);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!results.length || !meta) return;

    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leads: results,
          category: meta.category,
          location: meta.location,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save leads");
      }

      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <main className="max-w-5xl mx-auto p-4 md:p-8">
        <header className="mb-10 text-center">
           <h1 className="text-4xl md:text-5xl font-extrabold text-blue-700 mb-2 tracking-tight">
            LeadFinder AI <span className="text-3xl">🎯</span>
          </h1>
          <p className="text-gray-600 text-lg">
            Find local businesses without websites and convert them into leads.
          </p>
        </header>

        <section className="bg-white shadow-xl rounded-2xl p-6 md:p-8 mb-8 border border-gray-100 transition-all hover:shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2 uppercase tracking-wide" htmlFor="prompt">
                Search Query
              </label>
              <div className="relative">
                <textarea
                  id="prompt"
                  className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-base rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-4 shadow-sm transition-colors duration-200 ease-in-out"
                  rows="3"
                  placeholder="e.g., Near Nagaon Assam (cafe) {website development}"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  required
                ></textarea>
                <div className="absolute bottom-3 right-3 text-gray-400 text-xs">
                  AI Powered
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center space-x-2 font-bold py-4 px-6 rounded-xl shadow-lg transition-all duration-300 transform hover:-translate-y-1 ${
                loading
                  ? "bg-gray-400 cursor-not-allowed text-gray-100"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              }`}
            >
              {loading ? (
                 <>
                   <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                   <span>Finding Leads...</span>
                 </>
              ) : (
                <>
                  <FaSearch />
                  <span>Find Leads</span>
                </>
              )}
            </button>
          </form>
        </section>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-8 shadow-sm flex items-start space-x-3" role="alert">
            <FaExclamationTriangle className="mt-1 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {results.length > 0 && (
          <section className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-2xl font-bold text-gray-800">
                Results Found <span className="bg-blue-100 text-blue-800 text-sm font-semibold px-2.5 py-0.5 rounded ml-2">{results.length}</span>
              </h2>

              <div className="mt-4 md:mt-0 w-full md:w-auto">
                <button
                  onClick={handleSave}
                  disabled={saving || saveSuccess}
                  className={`w-full md:w-auto flex items-center justify-center space-x-2 font-bold py-2 px-6 rounded-lg shadow-md transition-colors duration-200 ${
                    saveSuccess
                      ? "bg-green-500 text-white cursor-default"
                      : saving
                      ? "bg-gray-400 cursor-not-allowed text-white"
                      : "bg-green-600 hover:bg-green-700 text-white"
                  }`}
                >
                   {saving ? (
                    <>
                       <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                         <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                         <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                       </svg>
                       <span>Pushing...</span>
                    </>
                  ) : saveSuccess ? (
                    <>
                      <FaCheck />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <FaGoogle />
                      <span>Push to Sheets</span>
                    </>
                  )}
                </button>
              </div>
            </div>

             {saveError && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-sm flex items-start space-x-3">
                 <FaExclamationTriangle className="mt-1 flex-shrink-0" />
                 <span>Error saving to sheets: {saveError}</span>
              </div>
            )}

             {saveSuccess && (
                <div className="bg-green-50 border-l-4 border-green-500 text-green-700 p-4 rounded-md shadow-sm flex items-start space-x-3">
                  <FaCheck className="mt-1 flex-shrink-0" />
                  <span>Successfully saved {results.length} leads to Google Sheets!</span>
                </div>
             )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {results.map((lead, index) => (
                <article key={index} className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow duration-300 flex flex-col h-full">
                  <div className="bg-blue-600 h-2 w-full"></div>
                  <div className="p-5 flex-grow">
                    <h3 className="font-bold text-lg text-gray-900 mb-2 line-clamp-2">{lead.name}</h3>
                    <p className="text-gray-600 text-sm mb-3 flex items-start">
                      <span className="mr-2 mt-0.5">📍</span>
                      <span className="line-clamp-2">{lead.address}</span>
                    </p>
                     <div className="flex items-center text-sm text-gray-600 mb-2">
                      <span className="mr-2">📞</span>
                      <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{lead.phone || "N/A"}</span>
                    </div>
                     <div className="flex items-center text-sm text-gray-600 mb-3">
                      <span className="mr-2">⭐</span>
                      <span>{lead.rating || "N/A"}</span>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700 mb-4">
                      <h4 className="font-bold text-gray-800 mb-2">Technical Signals</h4>
                      {lead.website_inspection?.status === "available" ? (
                        <>
                          <p><span className="font-semibold">Site:</span> {lead.website_inspection.https ? "HTTPS" : "Not HTTPS"} · {lead.website_inspection.response_time_ms ?? "N/A"} ms</p>
                          <p><span className="font-semibold">Payments:</span> {lead.website_inspection.payment_signals?.join(", ") || "None detected"}</p>
                          <p><span className="font-semibold">Tracking:</span> {lead.website_inspection.tracking_pixels?.join(", ") || "None detected"}</p>
                          <p><span className="font-semibold">SEO:</span> {lead.website_inspection.page_title ? "Title found" : "Missing title"} · {lead.website_inspection.meta_description ? "Description found" : "Missing description"}</p>
                        </>
                      ) : (
                        <p>{lead.website_inspection?.reason || "Website could not be inspected"}</p>
                      )}
                    </div>
                    <div className="space-y-4 border-t border-gray-100 pt-4 mt-4">
                      <section>
                        <h4 className="text-sm font-bold text-blue-700 mb-2">Payment & Marketing Intelligence</h4>
                        <p className="text-xs text-gray-700 mb-1"><span className="font-semibold">Payment setup:</span> {lead.priority_1_marketing_and_processing?.detected_payment_setup || "Unknown"}</p>
                        <p className="text-xs text-gray-700 mb-2"><span className="font-semibold">Processing opportunity:</span> {lead.priority_1_marketing_and_processing?.payment_processing_opportunity || "N/A"}</p>
                        {lead.priority_1_marketing_and_processing?.digital_marketing_flaws?.length > 0 && (
                          <ul className="list-disc list-inside text-xs text-gray-700 mb-2">
                            {lead.priority_1_marketing_and_processing.digital_marketing_flaws.map((flaw, flawIndex) => <li key={flawIndex}>{flaw}</li>)}
                          </ul>
                        )}
                        <p className="text-xs text-gray-700"><span className="font-semibold">Pitch:</span> {lead.priority_1_marketing_and_processing?.marketing_pitch_angle || "N/A"}</p>
                      </section>
                      <section>
                        <h4 className="text-sm font-bold text-indigo-700 mb-2">Amazon Supplies Inference</h4>
                        <p className="text-xs text-gray-700 mb-1"><span className="font-semibold">Category:</span> {lead.priority_2_amazon_supplies_inference?.primary_amazon_category || "N/A"}</p>
                        <p className="text-xs text-gray-700 mb-2"><span className="font-semibold">Monthly volume:</span> {lead.priority_2_amazon_supplies_inference?.estimated_monthly_order_volume || "N/A"}</p>
                        {lead.priority_2_amazon_supplies_inference?.high_probability_amazon_skus?.length > 0 && (
                          <p className="text-xs text-gray-700 mb-2"><span className="font-semibold">Likely SKUs:</span> {lead.priority_2_amazon_supplies_inference.high_probability_amazon_skus.join(", ")}</p>
                        )}
                        <p className="text-xs text-gray-700"><span className="font-semibold">Pitch:</span> {lead.priority_2_amazon_supplies_inference?.supply_pitch_angle || "N/A"}</p>
                      </section>
                    </div>
                  </div>
                    <div className="bg-gray-50 px-5 py-3 border-t border-gray-100">
                     {lead.website && lead.website.startsWith("http") ? (
                       <a
                         href={lead.website}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="text-blue-600 text-xs font-semibold flex items-center hover:underline"
                       >
                         <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                         Visit Website <FaExternalLinkAlt className="ml-1 text-[10px]" />
                       </a>
                     ) : (
                       <p className="text-red-500 text-xs font-semibold flex items-center">
                         <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
                         {lead.website}
                       </p>
                     )}
                   </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="mt-12 py-6 bg-white border-t border-gray-200 text-center text-gray-500 text-sm">
        <p>&copy; {new Date().getFullYear()} LeadFinder AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
