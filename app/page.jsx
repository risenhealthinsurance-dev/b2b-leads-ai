"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FaArrowRight, FaCheck, FaChevronDown, FaClock, FaExternalLinkAlt, FaGoogle, FaMapMarkerAlt, FaPhone, FaSearch, FaStar, FaTimes } from "react-icons/fa";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { validateSearchPrompt } from "../lib/search-validation.cjs";
import searchContract from "../lib/search-contract.cjs";

const QUADRANTS = ["A1", "A2", "B1", "B2"];
const REPS = ["All Reps", "Sarah M.", "James R.", "Unassigned"];
const { resolveAuthoritativeZip } = searchContract;

function scoreFor(account) {
  if (Number.isFinite(Number(account.sales_opportunity?.opportunity_score))) return Number(account.sales_opportunity.opportunity_score);
  if (Number.isFinite(Number(account.opportunity_score))) return Number(account.opportunity_score);
  const rating = Number(account.rating) || 0;
  const reviews = Number(account.reviews) || 0;
  return Math.max(35, Math.min(96, Math.round(rating * 12 + Math.log10(reviews + 1) * 8)));
}

function mapCoordinates(account, index) {
  const latitude = Number(account?.coordinates?.latitude);
  const longitude = Number(account?.coordinates?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) return [longitude, latitude];
  return null;
}

function coordinateLabel(account) {
  const coordinates = mapCoordinates(account);
  return coordinates ? `${coordinates[1].toFixed(6)}, ${coordinates[0].toFixed(6)}` : "Location unavailable";
}

function confidenceTone(value) { return value === "High" ? "success" : value === "Low" ? "warning" : "info"; }
function Badge({ children, tone = "neutral" }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
function Score({ account }) { const value = scoreFor(account); return <span className={`score score-${value >= 85 ? "high" : value >= 70 ? "medium" : "low"}`}>{value}</span>; }

function AccountCard({ account, selected, onSelect }) {
  const intelligence = account.payment_and_ordering_intelligence || {};
  const opportunity = account.sales_opportunity || {};
  const categories = intelligence.website_ordering_status || "Ordering status unknown";
  const reasons = account.fit_reasons || ["Public business signals available", "Category fit requires verification"];
  return <article className={`account-card ${selected ? "account-card-selected" : ""}`}>
    <button className="account-card-button" data-testid="account-card-button" onClick={() => onSelect(account)} aria-label={`View profile for ${account.name || "business"}`}>
      <div className="account-card-top"><div className="account-logo">{(account.name || "B")[0]}</div><div className="account-title"><div className="eyebrow">{account.category || "Business"} · {account.quadrant || "Quadrant pending"}</div><h3>{account.name || "Unknown business"}</h3><p><FaMapMarkerAlt /> {account.address || "Address unavailable"}</p></div><Score account={account} /></div>
      <div className="account-meta"><span><FaStar /> {account.rating || "N/A"} ({account.reviews || "N/A"})</span><Badge tone={confidenceTone(account.confidence)}>{account.confidence || "Unknown"} confidence</Badge><Badge tone="muted">{account.enrichment_status || "partial"}</Badge></div>
      <div className="reason-row"><Badge tone="muted">{Array.isArray(categories) ? categories[0] : categories}</Badge>{(opportunity.sales_triggers || reasons).slice(0, 2).map((reason) => <Badge key={reason} tone="muted">{reason}</Badge>)}</div>
      <div className="account-next"><span><strong>Next intelligence action</strong>{account.next || "Review public evidence and verify the buyer conversationally."}</span><FaArrowRight /></div>
    </button>
    <button className="view-profile" data-testid="view-profile-button" onClick={() => onSelect(account)}>View profile <FaArrowRight /></button>
  </article>;
}

function IntelligenceSection({ title, children }) { return <section className="drawer-section"><h3>{title}</h3>{children}</section>; }

function AccountDrawer({ account, onClose, onSave, saving, saved, notify }) {
  if (!account) return null;
  const intelligence = account.payment_and_ordering_intelligence || {};
  const inspection = account.website_inspection || {};
  const sources = account.sources || [];
  return <aside className="intel-drawer" data-testid="profile-drawer" aria-label={`${account.name || "Business"} profile`}>
    <div className="drawer-header"><div><span className="eyebrow">BUSINESS INTELLIGENCE</span><h2>{account.name || "Unknown business"}</h2><p>{account.category || "Business"} · ZIP {account.zip || "Unknown"} · {account.quadrant || "Quadrant pending"}</p></div><button className="icon-button" data-testid="profile-close-button" onClick={onClose} aria-label="Close profile"><FaTimes /></button></div>
    <div className="drawer-actions"><button onClick={() => notify("Public contact action noted for downstream sales systems.")}><FaPhone /> Contact</button><button onClick={() => notify("Profile refreshed from the current public evidence.")}><FaClock /> Refresh</button></div>
    <div className="drawer-score"><div><span className="eyebrow">PAYMENT &amp; ORDERING OPPORTUNITY</span><p>Ranked from public POS and website-ordering evidence.</p></div><Score account={account} /></div>
    <IntelligenceSection title="Business and location"><div className="detail-grid"><span>Address<strong>{account.address || "Unavailable"}</strong></span><span>Coordinates<strong data-testid="profile-coordinates">{coordinateLabel(account)}</strong></span><span>Phone<strong>{account.phone || "Unavailable"}</strong></span><span>Rating<strong>{account.rating || "N/A"} / 5 · {account.reviews || "N/A"} reviews</strong></span><span>Rep context<strong>{account.rep || "All Reps"}</strong></span></div></IntelligenceSection>
    <IntelligenceSection title="POS and ordering intelligence"><div className="signal-table"><span>POS / payment processor<strong>{opportunity.payment_processor || intelligence.detected_payment_setup || inspection.payment_signals?.join(", ") || "Not detected"}</strong></span><span>Payment evidence<strong>{opportunity.payment_evidence?.join(" · ") || "No specific evidence"}</strong></span><span>Website ordering<strong>{opportunity.ordering_model || intelligence.website_ordering_status || "Not detected"}</strong></span><span>Ordering platform<strong>{opportunity.ordering_platform || intelligence.ordering_platform || "Unknown"}</strong></span><span>Delivery<strong>{opportunity.delivery_capability || intelligence.delivery_capability || "Not detected"}</strong></span></div><div className="pitch-card"><span className="eyebrow">SALES OPPORTUNITY</span><p>{opportunity.recommended_pitch || intelligence.ordering_sales_opportunity || "Review whether ordering can be brought onto the restaurant's own website."}</p><p><strong>Triggers:</strong> {(opportunity.sales_triggers || []).join(" · ") || "No additional public trigger detected."}</p><p><strong>Verify:</strong> {(opportunity.unknowns_to_verify || []).join(" · ")}</p></div></IntelligenceSection>
    <IntelligenceSection title="Public evidence and signals"><div className="signal-list"><div><span className="signal-dot" />Observed facts from public business data</div><div><span className="signal-dot signal-dot-purple" />Confidence-labeled inference</div><div><span className="signal-dot signal-dot-amber" />Unknown or unverified data is not treated as negative</div></div><div className="detail-grid compact-grid"><span>Website<strong>{account.website || "No website found"}</strong></span><span>Website status<strong>{inspection.status || "Not inspected"}</strong></span><span>Ordering evidence<strong>{intelligence.ordering_evidence?.join(" · ") || "Not detected"}</strong></span><span>Freshness<strong>{account.freshness || "Unavailable"}</strong></span></div></IntelligenceSection>
    <IntelligenceSection title="Sources"><div className="source-list">{sources.length ? sources.map((source) => <span key={source}><FaExternalLinkAlt /> {source}</span>) : <span>No source links available.</span>}</div></IntelligenceSection>
    <div className="drawer-footer"><button className="save-button" data-testid="save-to-sheets-button" onClick={onSave} disabled={saving || saved}>{saved ? <><FaCheck /> Saved</> : <><FaGoogle /> {saving ? "Saving..." : "Save to Google Sheets"}</>}</button></div>
  </aside>;
}

function MapCanvas({ accounts, selected, onSelect, zip, quadrant }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const locatedAccounts = accounts.filter((account) => mapCoordinates(account) !== null);

  useEffect(() => {
    if (!token || !containerRef.current) return undefined;
    mapboxgl.accessToken = token;
    const initialCenter = locatedAccounts[0] ? mapCoordinates(locatedAccounts[0]) : [-95.43, 29.65];
    const map = new mapboxgl.Map({ container: containerRef.current, style: "mapbox://styles/mapbox/dark-v11", center: initialCenter, zoom: locatedAccounts.length === 1 ? 13 : 4, attributionControl: true });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.once("load", () => {
      containerRef.current?.parentElement?.querySelectorAll(".mapboxgl-ctrl-zoom-in, .mapboxgl-ctrl-zoom-out").forEach((control) => {
        control.setAttribute("data-testid", control.classList.contains("mapboxgl-ctrl-zoom-in") ? "map-zoom-in" : "map-zoom-out");
      });
    });
    map.on("load", () => {
      const bounds = new mapboxgl.LngLatBounds();
      locatedAccounts.forEach((account) => {
        const coordinates = mapCoordinates(account);
        bounds.extend(coordinates);
        const marker = document.createElement("button");
        marker.className = `mapbox-score-marker ${selected?.business_id === account.business_id ? "mapbox-score-marker-selected" : ""}`;
        marker.type = "button";
        marker.textContent = String(scoreFor(account));
        marker.setAttribute("aria-label", `Select ${account.name || "business"} at ${coordinateLabel(account)}`);
        marker.addEventListener("click", () => onSelect(account));
        new mapboxgl.Marker({ element: marker, anchor: "bottom" }).setLngLat(mapCoordinates(account)).addTo(map);
      });
      if (locatedAccounts.length > 1 && !bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [locatedAccounts, onSelect, selected?.business_id, token]);

  if (token) return <div ref={containerRef} data-testid="map-container" className="map-canvas mapbox-canvas" aria-label={`Mapbox map of ${zip || "selected ZIP"} ${quadrant || "active quadrant"}`} />;
      return <div className="map-canvas" data-testid="map-container" aria-label={`Map preview of ${zip || "selected ZIP"} ${quadrant || "active quadrant"}`}><div className="map-grid" /><div className="map-label map-label-one">{quadrant || "ACTIVE QUADRANT"}</div><div className="map-label map-label-two">PUBLIC BUSINESS SIGNALS</div>{locatedAccounts.map((account, index) => <button key={account.business_id || `${account.name}-${index}`} className={`map-pin pin-${index % 4} ${selected?.business_id === account.business_id ? "map-pin-selected" : ""}`} onClick={() => onSelect(account)} aria-label={`Select ${account.name || "business"} at ${coordinateLabel(account)}`}><span>{scoreFor(account)}</span></button>)}</div>;
}

function MapPanel({ accounts, selected, onSelect, zip, quadrant }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mappedCount = accounts.filter((account) => mapCoordinates(account) !== null).length;
  return <div className="map-panel"><div className="map-panel-header"><div><span className="eyebrow">PUBLIC BUSINESS MAP</span><h2>ZIP {zip || "—"} · QUADRANT {quadrant || "—"}</h2></div><Badge tone="info">{accounts.length} discovered</Badge></div><p data-testid="map-status" className="map-note">{accounts.length} results · {mappedCount} mapped · {accounts.length - mappedCount} without verified coordinates</p><MapCanvas accounts={accounts} selected={selected} onSelect={onSelect} zip={zip} quadrant={quadrant} />{!token && <p className="map-config-note">Mapbox token not configured; showing the accessible visual map fallback.</p>}<p className="map-note">Map shows live provider results in the active search scope. Coverage may vary by provider.</p></div>;
}

export default function Home() {
  const [prompt, setPrompt] = useState("Find restaurants in ZIP 77096 and identify their POS/payment processor and whether website ordering is first-party or redirects to DoorDash, Uber Eats, ChowNow, or another third party");
  const [zip, setZip] = useState("77096");
  const [quadrant, setQuadrant] = useState("A1");
  const [rep, setRep] = useState("All Reps");
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("list");
  const [sort, setSort] = useState("opportunity");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeDetails, setNoticeDetails] = useState([]);
  const [showNoticeDetails, setShowNoticeDetails] = useState(false);
  const [promptError, setPromptError] = useState("");
  const searchInputRef = useRef(null);
  const [meta, setMeta] = useState(null);
  const isSample = false;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const filtered = useMemo(() => [...accounts].sort((a, b) => sort === "distance" ? Number(a.distance || 999) - Number(b.distance || 999) : sort === "freshness" ? String(b.freshness || "").localeCompare(String(a.freshness || "")) : sort === "signals" ? Number(b.reviews || 0) - Number(a.reviews || 0) : scoreFor(b) - scoreFor(a)), [accounts, sort]);

  const search = async (event) => {
    event.preventDefault();
    const validation = validateSearchPrompt(prompt);
    if (!validation.valid) { setPromptError(validation.error); searchInputRef.current?.focus(); return; }
    setPromptError(""); setLoading(true); setNotice(""); setNoticeDetails([]); setShowNoticeDetails(false); setSaved(false); setSelected(null); setAccounts([]); setMeta(null);
    const resolvedZip = resolveAuthoritativeZip(prompt, zip);
    if (resolvedZip.overridden) setZip(resolvedZip.zip);
    try { const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, zip: resolvedZip.zip, quadrant, rep }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Live search failed"); setAccounts(data.leads || []); setMeta(data.meta || null); const count = data.leads?.length || 0; const warningState = data.meta?.warnings || {}; const categoryAudit = data.meta?.categoryAudit || {}; const categoryLabel = categoryAudit.requested ? ` ${categoryAudit.requested}` : ""; const uncertain = categoryAudit.probable || 0; const variability = data.meta?.coverageIntent ? " Live provider coverage may vary." : ""; const resultMessage = count ? `${count} live${categoryLabel} businesses loaded.${uncertain ? ` ${uncertain} require category verification.` : ""}${variability}` : "No live businesses matched this ZIP and search."; setNotice(resolvedZip.overridden ? `Using ZIP ${resolvedZip.zip} from your search prompt.${resultMessage}` : resultMessage); setNoticeDetails(warningState.details || []); }
    catch (error) { setNotice("Live search could not be completed."); setNoticeDetails([{ code: "search-failure", summary: error.message || "The live search provider returned an error.", details: "Try again or adjust the ZIP, quadrant, or search terms." }]); } finally { setLoading(false); }
  };

  const save = async () => {
    if (!accounts.length || !meta) return; setSaving(true); setNotice("");
    try { const response = await fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leads: accounts, category: meta.category, location: meta.location }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Unable to save businesses"); setSaved(true); setNotice(data.dryRun ? `QA dry run validated ${accounts.length} businesses without writing external data.` : `Saved ${accounts.length} businesses to Google Sheets.`); }
    catch (error) { setNotice(error.message || "Unable to save businesses."); } finally { setSaving(false); }
  };

  const coverage = meta?.coverage || { discovered: accounts.length, enriched: 0, totalKnown: null, remaining: null, quadrantsRemaining: QUADRANTS };
  return <div className="sales-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">R</div><div><strong>REIGN</strong><span>OSINT INTELLIGENCE</span></div></div><div className="identity-card"><span className="online-dot" /> PUBLIC BUSINESS INTELLIGENCE<small>Discover · enrich · classify · organize</small></div><nav className="main-nav"><div className="nav-item active"><span>⌕</span> Business discovery <b>{accounts.length}</b></div><div className="nav-item"><span>◉</span> ZIP coverage</div><div className="nav-item"><span>▣</span> Enrichment activity</div></nav><div className="sidebar-footer"><span>API-READY INTELLIGENCE LAYER</span><span>Session progress only</span></div></aside>
    <main className="main-content"><header className="topbar"><div className="topbar-brand"><div className="brand-mark">R</div><div><strong>REIGN OSINT</strong><span>Business Discovery &amp; Sales Intelligence</span></div></div><div className="topbar-divider" /><div className="workspace-context"><strong>ZIP business universe</strong><span>Discover · enrich · classify · organize</span></div><div className="topbar-actions"><Badge tone="success">API-READY INTELLIGENCE LAYER</Badge><Badge tone="info">Public sources only</Badge></div></header>
      <section className="search-panel"><form className="search-form" onSubmit={search}><FaSearch /><textarea ref={searchInputRef} data-testid="search-input" aria-label="Natural-language business search" aria-invalid={Boolean(promptError)} aria-describedby={promptError ? "search-error" : undefined} rows="2" value={prompt} onChange={(event) => { setPrompt(event.target.value); if (promptError) setPromptError(""); }} placeholder="Find every business in ZIP 77096, quadrant by quadrant, that is likely to buy recurring cleaning, paper, restaurant, or maintenance supplies." /><button type="submit" data-testid="discover-button" disabled={loading}>{loading ? "Discovering..." : "Discover & enrich"}</button></form>{promptError && <p id="search-error" data-testid="search-error" role="alert">{promptError}</p>}<div className="search-helper">Tracks measured session progress using public business facts, location, reviews, website, and visible operational signals. <Badge tone="success">Observed facts</Badge> <Badge tone="info">Confidence-labeled inference</Badge> <span>No private purchasing history.</span></div><div className="search-controls"><label>ZIP<input data-testid="zip-input" value={zip} onChange={(event) => setZip(event.target.value)} inputMode="numeric" aria-label="ZIP code" /></label><label>QUADRANT<select data-testid="quadrant-select" value={quadrant} onChange={(event) => setQuadrant(event.target.value)} aria-label="Quadrant">{QUADRANTS.map((item) => <option key={item}>{item}</option>)}</select></label><label>REP<select data-testid="representative-select" value={rep} onChange={(event) => setRep(event.target.value)} aria-label="Representative">{REPS.map((item) => <option key={item}>{item}</option>)}</select></label><span className="active-chip">{quadrant} active</span><div className="view-toggle" role="group" aria-label="Workspace view"><button type="button" data-testid="list-view-button" className={view === "list" ? "selected-toggle" : ""} onClick={() => setView("list")}>List</button><button type="button" data-testid="map-view-button" className={view === "map" ? "selected-toggle" : ""} onClick={() => setView("map")}>Map</button></div></div></section>
      <section className="progress-strip" aria-label="ZIP and quadrant enrichment progress"><div><strong>{coverage.discovered}</strong><span>ZIP DISCOVERED<small>businesses in {zip || "selected ZIP"}</small></span></div><div><strong>{coverage.enriched}</strong><span>{quadrant} ENRICHED<small>of {coverage.discovered} discovered</small></span></div><div><strong>{coverage.remaining ?? "—"}</strong><span>{quadrant} REMAINING<small>{coverage.remaining === null ? "not yet measured" : "awaiting enrichment"}</small></span></div><div><strong>{coverage.quadrantsRemaining?.length ? `${QUADRANTS.length - coverage.quadrantsRemaining.length}/${QUADRANTS.length}` : "0/4"}</strong><span>QUADRANTS COMPLETE<small>{coverage.quadrantsRemaining?.length || 4} remaining</small></span></div><p>Source-backed fact <span>Confidence-labeled inference</span> <em>Available for field-sales systems through shared data/API.</em></p></section>
      {notice && <div className="notice" data-testid="notice" role="status"><span data-testid="search-status">{notice}</span>{noticeDetails.length > 0 && <><button type="button" data-testid="warning-details-toggle" onClick={() => setShowNoticeDetails((value) => !value)} aria-expanded={showNoticeDetails}>{showNoticeDetails ? "Hide details" : "Details"}</button>{showNoticeDetails && <div data-testid="warning-details-content" className="notice-details">{noticeDetails.map((detail) => <div key={detail.code}><strong>{detail.summary}</strong><p>{detail.details}</p></div>)}</div>}</>}<button data-testid="dismiss-notice-button" onClick={() => setNotice("")} aria-label="Dismiss notice"><FaTimes /></button></div>}
      {view === "map" ? <MapPanel accounts={filtered} selected={selected} onSelect={setSelected} zip={zip} quadrant={quadrant} /> : <section className="workspace"><div className="queue-list">{isSample && <div className="sample-banner" role="status"><strong>Representative sample data</strong><span>Run Discover &amp; enrich to replace this preview with live public-business results.</span></div>}<div className="section-heading"><div><div className="eyebrow">BUSINESS DISCOVERY</div><h2>{filtered.length ? "Businesses ranked by sales relevance" : "Search the active quadrant"}</h2><p>{filtered.length ? `${filtered.length} businesses · Measured session progress` : "Use natural language to find and enrich businesses in the selected ZIP and quadrant."}</p></div><label className="select-control">Sort <select data-testid="sort-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="opportunity">Opportunity</option><option value="distance">Distance</option><option value="signals">Public signals</option><option value="freshness">Freshness</option></select><FaChevronDown /></label></div>{filtered.map((account) => <AccountCard key={account.business_id || account.name} account={account} selected={selected?.business_id === account.business_id} onSelect={setSelected} />)}{!filtered.length && <div className="empty-state"><FaSearch /><h3>No businesses in this session yet</h3><p>Run the discovery query to populate the active quadrant with live public-business results.</p></div>}</div><MapPanel accounts={filtered} selected={selected} onSelect={setSelected} zip={zip} quadrant={quadrant} /></section>}
      {selected && <AccountDrawer account={selected} onClose={() => setSelected(null)} onSave={save} saving={saving} saved={saved} notify={setNotice} />}
    </main></div>;
}
