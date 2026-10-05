const REQUEST_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 1024 * 1024;

const EMPTY_INSPECTION = {
  status: "unavailable",
  reason: "No website provided",
  url: "",
  final_url: "",
  https: false,
  http_status: null,
  response_time_ms: null,
  page_title: "",
  meta_description: "",
  viewport: "",
  mobile_indicators: [],
  payment_signals: [],
  tracking_pixels: [],
  checkout_iframes: []
};

function htmlText(value = "") {
  return value.replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|#39);/g, " ").replace(/\s+/g, " ").trim();
}

function firstMatch(html, pattern) {
  return html.match(pattern)?.[1]?.trim() || "";
}

function detectSignals(html) {
  const source = html.toLowerCase();
  const paymentSignals = [];
  const trackingPixels = [];
  const paymentPatterns = [
    ["Stripe", /stripe(?:\.js|\.com|checkout|elements)/i],
    ["Square", /square(?:up|\.com)|square\.js/i],
    ["Toast", /toasttab|toast\.com/i],
    ["PayPal", /paypal|paypalsdk/i],
    ["Apple Pay", /applepay|apple-pay/i],
    ["Klarna", /klarna/i]
  ];
  const trackingPatterns = [
    ["Meta Pixel", /fbq\s*\(|connect\.facebook\.net|facebook\.com\/tr/i],
    ["Google Tag Manager", /googletagmanager\.com|\bGTM-[A-Z0-9]+\b/i],
    ["Google Analytics", /google-analytics\.com|gtag\s*\(|ga\s*\(/i],
    ["TikTok Pixel", /analytics\.tiktok\.com|ttq\s*\./i]
  ];
  paymentPatterns.forEach(([name, pattern]) => { if (pattern.test(source)) paymentSignals.push(name); });
  trackingPatterns.forEach(([name, pattern]) => { if (pattern.test(source)) trackingPixels.push(name); });
  const checkoutIframes = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(src => /checkout|payment|stripe|paypal|square|klarna|toast/i.test(src))
    .slice(0, 5);
  const mobileIndicators = [];
  if (/<meta[^>]+name=["']viewport["'][^>]*>/i.test(html)) mobileIndicators.push("viewport meta tag");
  if (/media\s*\(|@media|responsive|bootstrap|tailwind/i.test(source)) mobileIndicators.push("responsive CSS markers");
  return { paymentSignals, trackingPixels, checkoutIframes, mobileIndicators };
}

async function fetchPage(url) {
  let currentUrl = url;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const parsed = new URL(currentUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("Unsupported website protocol");
    const started = Date.now();
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": "LeadFinderAI/1.0 website signal inspection" }
    });
    const responseTime = Date.now() - started;
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Too many redirects or missing redirect target");
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    const reader = response.body?.getReader();
    let body = "";
    let bytes = 0;
    if (reader) {
      while (bytes < MAX_BODY_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        body += new TextDecoder().decode(value, { stream: true });
      }
      await reader.cancel();
    } else {
      body = (await response.text()).slice(0, MAX_BODY_BYTES);
    }
    return { response, body, responseTime, finalUrl: currentUrl };
  }
  throw new Error("Unable to fetch website");
}

export async function inspectWebsite(website) {
  const base = { ...EMPTY_INSPECTION };
  if (!website || website === "No website found") return base;
  try {
    const inputUrl = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    const { response, body, responseTime, finalUrl } = await fetchPage(inputUrl);
    const signals = detectSignals(body);
    return {
      status: response.ok ? "available" : "http_error",
      reason: response.ok ? "" : `HTTP ${response.status}`,
      url: inputUrl,
      final_url: finalUrl,
      https: new URL(finalUrl).protocol === "https:",
      http_status: response.status,
      response_time_ms: responseTime,
      page_title: htmlText(firstMatch(body, /<title[^>]*>([\s\S]*?)<\/title>/i)),
      meta_description: firstMatch(body, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
      viewport: firstMatch(body, /<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']*)["']/i),
      mobile_indicators: signals.mobileIndicators,
      payment_signals: signals.paymentSignals,
      tracking_pixels: signals.trackingPixels,
      checkout_iframes: signals.checkoutIframes
    };
  } catch (error) {
    return { ...base, status: "unavailable", reason: error?.name === "TimeoutError" ? "Request timed out" : error.message || "Unable to inspect website", url: website, final_url: website };
  }
}

export async function inspectWebsites(websites, concurrency = 5) {
  const results = new Array(websites.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < websites.length) {
      const index = nextIndex++;
      results[index] = await inspectWebsite(websites[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, websites.length || 1) }, worker));
  return results;
}
