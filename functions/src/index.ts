import { initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { FieldValue, getFirestore, type DocumentSnapshot, type Query } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";

loadLocalEnvFile();

initializeApp();

const db = getFirestore();
const serverTimestamp = FieldValue.serverTimestamp;
const openAiApiKey = defineSecret("OPENAI_API_KEY");

const REGION = "us-central1";
const TRADE = "hvac";
const MARKET = "nashville-tn";
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "Contact@fennington.com";
const BUSINESS_PHONE = process.env.BUSINESS_PHONE || "413-255-1777";
const DEFAULT_LEAD_CAP = 25;
const DEFAULT_EMAIL_CAP = 10;
const WEBSITE_TIMEOUT_MS = 6500;
const FINANCIAL_AI_MODEL = process.env.FINANCIAL_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-nano";
const FINANCIAL_AI_MAX_TRANSACTIONS = 100;
const FINANCIAL_INPUT_PRICE_PER_1M = Number(process.env.FINANCIAL_INPUT_PRICE_PER_1M || process.env.OPENAI_INPUT_PRICE_PER_1M || 0.20);
const FINANCIAL_OUTPUT_PRICE_PER_1M = Number(process.env.FINANCIAL_OUTPUT_PRICE_PER_1M || process.env.OPENAI_OUTPUT_PRICE_PER_1M || 1.25);
const FINANCIAL_WEB_SEARCH_PRICE_PER_1K = Number(process.env.FINANCIAL_WEB_SEARCH_PRICE_PER_1K || process.env.OPENAI_WEB_SEARCH_PRICE_PER_1K || 10);

const FINANCIAL_CATEGORIES = [
  "Housing", "Utilities", "Groceries", "Restaurants", "Transportation", "Fuel", "Vehicle expenses", "Insurance", "Medical", "Shopping", "Entertainment", "Subscriptions", "Kids", "Childcare", "Education", "Debt payments", "Taxes", "Transfers", "Credits to the Account", "Income", "Uncategorized"
];

const FINANCIAL_KEYWORDS = [
  { match: /rent|mortgage|apartment/i, category: "Housing", confidence: 90 },
  { match: /electric|power|water|gas company|internet|phone|utility|comcast|xfinity|verizon/i, category: "Utilities", confidence: 86 },
  { match: /grocery|market|kroger|aldi|costco|walmart|target|trader joe|whole foods/i, category: "Groceries", confidence: 84 },
  { match: /restaurant|pizza|cafe|coffee|doordash|uber eats|grubhub|taco|burger|sq \*/i, category: "Restaurants", confidence: 83 },
  { match: /shell|exxon|bp|chevron|speedway|fuel|gas station/i, category: "Fuel", confidence: 89 },
  { match: /auto|tire|mechanic|oil change|parts|registration/i, category: "Vehicle expenses", confidence: 82 },
  { match: /insurance|geico|progressive|state farm|allstate/i, category: "Insurance", confidence: 86 },
  { match: /doctor|hospital|pharmacy|cvs|walgreens|medical|dental/i, category: "Medical", confidence: 80 },
  { match: /amazon|etsy|best buy|home depot|lowes|store|shop/i, category: "Shopping", confidence: 76 },
  { match: /netflix|spotify|hulu|disney|subscription|apple\.com/i, category: "Subscriptions", confidence: 88 },
  { match: /movie|theater|concert|steam|xbox|playstation/i, category: "Entertainment", confidence: 80 },
  { match: /daycare|childcare/i, category: "Childcare", confidence: 82 },
  { match: /tuition|university|school|student loan/i, category: "Education", confidence: 80 },
  { match: /credit card payment|payment thank you|online payment received|transfer|zelle|venmo|cash app|savings|refund|reimbursement/i, category: "Transfers", confidence: 78 },
  { match: /loan payment|minimum payment/i, category: "Debt payments", confidence: 72 },
  { match: /irs|tax|revenue/i, category: "Taxes", confidence: 84 },
  { match: /payroll|direct deposit|salary|paycheck|wages/i, category: "Income", confidence: 94 },
  { match: /online transfer|payment received/i, category: "Transfers", confidence: 74 }
];

const NASHVILLE_QUERIES = [
  "HVAC contractor in Nashville TN",
  "air conditioning repair Nashville TN",
  "heating contractor Nashville TN",
  "furnace repair Nashville TN"
];

const SERVICE_AREA = [
  "Nashville",
  "Franklin",
  "Brentwood",
  "Hendersonville",
  "Mount Juliet",
  "Smyrna",
  "Murfreesboro",
  "Gallatin",
  "Lebanon",
  "Goodlettsville"
];

const HVAC_SERVICES = [
  "AC repair",
  "Heating repair",
  "System installation",
  "Maintenance plans",
  "Emergency HVAC service",
  "Ductwork and indoor air quality"
];

const DIRECTORY_HOSTS = [
  "facebook.com",
  "fb.com",
  "angi.com",
  "angieslist.com",
  "yelp.com",
  "thumbtack.com",
  "homeadvisor.com",
  "houzz.com",
  "google.com",
  "g.page",
  "linktr.ee",
  "linktree.com"
];

type DiscoveryOptions = {
  dryRun?: boolean;
  cap?: number;
  requestedBy?: string;
};

type WebsiteAudit = {
  status: "missing" | "ok" | "warning" | "error";
  finalUrl?: string;
  responseMs?: number;
  statusCode?: number;
  flags: string[];
  summary: string;
};

type EmailDiscovery = {
  email?: string;
  sourceUrl?: string;
  confidence: "none" | "medium" | "high";
  status: "not_attempted" | "not_found" | "found" | "error";
};

function loadLocalEnvFile(): void {
  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env")
  ];
  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) return;
      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key]) return;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    });
  }
}

function safeString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 600);
}

function safeLongString(value: unknown, fallback = "", maxLength = 12000): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

function escapeHtml(value: unknown): string {
  return safeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "hvac-contractor";
}

function normalizePhone(value: unknown): string {
  return safeString(value).replace(/\D/g, "");
}

function hashEmail(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function encodeToken(messageId: string, emailHash: string): string {
  return Buffer.from(`${messageId}:${emailHash}`, "utf8").toString("base64url");
}

function decodeToken(token: string): { messageId: string; emailHash: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [messageId, emailHash] = decoded.split(":");
    if (!messageId || !emailHash || emailHash.length < 32) return null;
    return { messageId, emailHash };
  } catch {
    return null;
  }
}

function isDirectoryUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return DIRECTORY_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function isHvacLike(place: any): boolean {
  const haystack = [
    place?.displayName?.text,
    place?.formattedAddress,
    place?.primaryType,
    ...(Array.isArray(place?.types) ? place.types : [])
  ].join(" ").toLowerCase();

  return /(hvac|heating|cooling|air conditioning|air conditioner|furnace|heat pump|mechanical)/.test(haystack);
}

function isNashvilleArea(place: any): boolean {
  const address = safeString(place?.formattedAddress).toLowerCase();
  return address.includes("tn") || address.includes("tennessee") || SERVICE_AREA.some((city) => address.includes(city.toLowerCase()));
}

function qualificationFor(place: any, audit: WebsiteAudit): { passes: boolean; score: number; reasons: string[] } {
  const rating = Number(place?.rating || 0);
  const reviewCount = Number(place?.userRatingCount || 0);
  const reasons: string[] = [];
  let score = 0;

  if (isHvacLike(place)) score += 20;
  else reasons.push("not_hvac_like");

  if (isNashvilleArea(place)) score += 15;
  else reasons.push("outside_nashville_area");

  if (!place?.businessStatus || place.businessStatus === "OPERATIONAL") score += 10;
  else reasons.push(`business_status_${place.businessStatus}`);

  if (rating >= 4) score += 20;
  else reasons.push("rating_below_4");

  if (reviewCount >= 50) score += 20;
  else reasons.push("review_count_below_50");

  if (audit.flags.length > 0 && audit.flags.some((flag) => ["missing_website", "unreachable", "http_error", "no_https", "facebook_or_directory_only", "slow_response", "thin_content", "missing_phone_or_cta", "mobile_unfriendly_signal"].includes(flag))) {
    score += 15;
  } else {
    reasons.push("website_gap_not_detected");
  }

  const passes = !reasons.includes("not_hvac_like") &&
    !reasons.includes("outside_nashville_area") &&
    !reasons.some((reason) => reason.startsWith("business_status_") && reason !== "business_status_OPERATIONAL") &&
    rating >= 4 &&
    reviewCount >= 50 &&
    audit.flags.length > 0;

  return { passes, score, reasons };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = WEBSITE_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "FenningtonPreviewBot/1.0 (+https://fennington.com)",
        ...(init.headers || {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function auditWebsite(websiteUri?: string): Promise<WebsiteAudit> {
  const url = safeString(websiteUri);
  if (!url) {
    return { status: "missing", flags: ["missing_website"], summary: "No website listed in Google Places." };
  }

  const flags: string[] = [];
  if (isDirectoryUrl(url)) flags.push("facebook_or_directory_only");

  let parsed: URL;
  try {
    parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return { status: "error", flags: ["unreachable"], summary: "Website URL is invalid." };
  }

  if (parsed.protocol !== "https:") flags.push("no_https");

  const started = Date.now();
  try {
    const response = await fetchWithTimeout(parsed.toString(), { redirect: "follow" });
    const responseMs = Date.now() - started;
    if (responseMs > 5000) flags.push("slow_response");
    if (response.status >= 400) flags.push("http_error");
    const finalUrl = response.url || parsed.toString();
    if (finalUrl.startsWith("http://")) flags.push("no_https");
    if (isDirectoryUrl(finalUrl)) flags.push("facebook_or_directory_only");

    const html = await response.text();
    const visibleText = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (visibleText.length < 800) flags.push("thin_content");
    if (!/(tel:|call|phone|contact|schedule|estimate)/i.test(html)) flags.push("missing_phone_or_cta");
    if (!/<meta[^>]+name=["']viewport["']/i.test(html)) flags.push("mobile_unfriendly_signal");

    return {
      status: flags.length > 0 ? "warning" : "ok",
      finalUrl,
      responseMs,
      statusCode: response.status,
      flags: Array.from(new Set(flags)),
      summary: flags.length > 0 ? `Detected website gaps: ${Array.from(new Set(flags)).join(", ")}.` : "Website responded without obvious MVP audit flags."
    };
  } catch (error: any) {
    const responseMs = Date.now() - started;
    return {
      status: "error",
      responseMs,
      flags: [responseMs >= WEBSITE_TIMEOUT_MS ? "slow_response" : "unreachable"],
      summary: `Website fetch failed: ${safeString(error?.message, "unknown error")}`
    };
  }
}

function extractEmails(html: string): string[] {
  const matches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((email) => email.toLowerCase())))
    .filter((email) => !/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email))
    .filter((email) => !email.includes("example.com"));
}

async function discoverPublicEmail(websiteUri?: string): Promise<EmailDiscovery> {
  const url = safeString(websiteUri);
  if (!url || isDirectoryUrl(url)) return { confidence: "none", status: "not_attempted" };

  let origin: string;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    origin = parsed.origin;
  } catch {
    return { confidence: "none", status: "error" };
  }

  const paths = ["/", "/contact", "/contact-us", "/about", "/about-us"];
  for (const path of paths) {
    const sourceUrl = `${origin}${path}`;
    try {
      const response = await fetchWithTimeout(sourceUrl, { redirect: "follow" }, 4500);
      if (!response.ok) continue;
      const html = await response.text();
      const [email] = extractEmails(html);
      if (email) {
        const host = new URL(origin).hostname.replace(/^www\./, "");
        return { email, sourceUrl, confidence: email.endsWith(`@${host}`) ? "high" : "medium", status: "found" };
      }
    } catch {
      continue;
    }
  }

  return { confidence: "none", status: "not_found" };
}

function placeId(place: any): string {
  return safeString(place?.id || (safeString(place?.name).startsWith("places/") ? safeString(place.name).slice(7) : place?.name));
}

async function googleTextSearch(query: string): Promise<any[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not configured.");

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask": "places.id,places.name,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri,places.businessStatus,places.types,places.primaryType"
    },
    body: JSON.stringify({
      textQuery: query,
      minRating: 4,
      maxResultCount: 20,
      locationBias: {
        circle: {
          center: { latitude: 36.1627, longitude: -86.7816 },
          radius: 50000
        }
      }
    })
  });

  if (!response.ok) throw new Error(`Google Places Text Search failed with ${response.status}.`);
  const body = await response.json() as { places?: any[] };
  return body.places || [];
}

async function googlePlaceDetails(id: string): Promise<any> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not configured.");

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: {
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask": "id,name,displayName,formattedAddress,location,googleMapsUri,websiteUri,nationalPhoneNumber,internationalPhoneNumber,rating,userRatingCount,businessStatus,types,primaryType,regularOpeningHours,reviews"
    }
  });

  if (!response.ok) throw new Error(`Google Place Details failed with ${response.status}.`);
  return response.json();
}

function normalizeReviews(place: any): any[] {
  if (!Array.isArray(place?.reviews)) return [];
  return place.reviews.slice(0, 3).map((review: any) => ({
    rating: Number(review?.rating || 0),
    text: safeString(review?.text?.text || review?.text, ""),
    author: safeString(review?.authorAttribution?.displayName || "Google reviewer")
  })).filter((review: any) => review.text);
}

function siteContentFromLead(lead: any): any {
  const rating = Number(lead.rating || 0);
  const reviewCount = Number(lead.reviewCount || 0);
  return {
    heroHeadline: `${lead.businessName} HVAC Service in Nashville`,
    heroSubtitle: `Heating and cooling service page preview for ${lead.businessName}, highlighting ${rating ? `${rating.toFixed(1)} stars` : "local reviews"}${reviewCount ? ` and ${reviewCount} Google reviews` : ""}.`,
    services: HVAC_SERVICES,
    serviceArea: lead.serviceArea || SERVICE_AREA,
    phone: lead.phone || BUSINESS_PHONE,
    contactEmail: CONTACT_EMAIL,
    ctaPhone: BUSINESS_PHONE,
    ctaEmail: CONTACT_EMAIL,
    rating,
    reviewCount,
    reviews: Array.isArray(lead.reviews) ? lead.reviews : [],
    address: lead.formattedAddress || "Nashville, TN",
    hours: lead.hours || null,
    websiteAudit: lead.websiteAudit || null
  };
}

async function upsertLeadAndSite(place: any, audit: WebsiteAudit, emailDiscovery: EmailDiscovery, qualification: any): Promise<{ leadId: string; siteId?: string }> {
  const id = placeId(place);
  const businessName = safeString(place?.displayName?.text || place?.displayName || "HVAC Contractor");
  const slug = `${slugify(businessName)}-nashville`;
  const leadRef = db.collection("leads").doc(id);
  const existingLead = await leadRef.get();
  const leadData = {
    placeId: id,
    source: "google_places",
    trade: TRADE,
    market: MARKET,
    businessName,
    slug,
    rating: Number(place?.rating || 0),
    reviewCount: Number(place?.userRatingCount || 0),
    phone: safeString(place?.nationalPhoneNumber || place?.internationalPhoneNumber),
    phoneNormalized: normalizePhone(place?.nationalPhoneNumber || place?.internationalPhoneNumber),
    formattedAddress: safeString(place?.formattedAddress),
    serviceArea: SERVICE_AREA,
    websiteUri: safeString(place?.websiteUri),
    googleMapsUri: safeString(place?.googleMapsUri),
    businessStatus: safeString(place?.businessStatus || "UNKNOWN"),
    types: Array.isArray(place?.types) ? place.types.slice(0, 20).map((type: unknown) => safeString(type)) : [],
    hours: place?.regularOpeningHours || null,
    reviews: normalizeReviews(place),
    websiteAudit: audit,
    qualification,
    emailDiscovery,
    outreachStatus: qualification.passes ? (emailDiscovery.email ? "email_ready" : "call_queue") : "rejected",
    lastScoredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAt: existingLead.exists ? existingLead.get("createdAt") || serverTimestamp() : serverTimestamp()
  };

  await leadRef.set(leadData, { merge: true });

  let siteId: string | undefined;
  if (qualification.passes) {
    const siteRef = db.collection("sites").doc(id);
    siteId = siteRef.id;
    const siteData = {
      leadId: leadRef.id,
      slug,
      businessName,
      trade: TRADE,
      market: MARKET,
      status: "preview",
      template: "hvac",
      canonicalPath: `/sites/${slug}`,
      previewPath: `/preview/${slug}`,
      subdomain: slug,
      seoIndexable: false,
      content: siteContentFromLead(leadData),
      source: {
        placeId: id,
        rating: leadData.rating,
        reviewCount: leadData.reviewCount,
        websiteUri: leadData.websiteUri,
        googleMapsUri: leadData.googleMapsUri,
        formattedAddress: leadData.formattedAddress
      },
      stripe: {
        checkoutSessionId: null,
        customerId: null,
        subscriptionId: null,
        activatedAt: null
      },
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    };
    await siteRef.set(siteData, { merge: true });
    await leadRef.set({ previewSiteId: siteRef.id, updatedAt: serverTimestamp() }, { merge: true });
  }

  return { leadId: leadRef.id, siteId };
}

async function runNashvilleHvacDiscovery(options: DiscoveryOptions = {}): Promise<any> {
  const cap = Math.max(1, Math.min(Number(options.cap || DEFAULT_LEAD_CAP), DEFAULT_LEAD_CAP));
  const jobRef = db.collection("jobs").doc();
  const counters = { candidates: 0, insertedOrUpdated: 0, qualified: 0, skipped: 0, errors: 0 };
  const errors: string[] = [];

  await jobRef.set({
    type: "lead_discovery",
    market: MARKET,
    trade: TRADE,
    dryRun: Boolean(options.dryRun),
    status: "running",
    requestedBy: options.requestedBy || "scheduled",
    startedAt: serverTimestamp(),
    counters,
    errors: []
  });

  try {
    const candidates = new Map<string, any>();
    for (const query of NASHVILLE_QUERIES) {
      const places = await googleTextSearch(query);
      for (const place of places) {
        const id = placeId(place);
        if (id && !candidates.has(id)) candidates.set(id, { ...place, querySource: query });
      }
    }

    counters.candidates = candidates.size;

    for (const candidate of candidates.values()) {
      if (counters.qualified >= cap) break;
      try {
        const id = placeId(candidate);
        if (!id) {
          counters.skipped += 1;
          continue;
        }

        const details = await googlePlaceDetails(id);
        const place = { ...candidate, ...details };
        const audit = await auditWebsite(place.websiteUri);
        const qualification = qualificationFor(place, audit);
        const emailDiscovery = qualification.passes ? await discoverPublicEmail(place.websiteUri) : { confidence: "none", status: "not_attempted" } as EmailDiscovery;

        if (qualification.passes) counters.qualified += 1;

        if (!options.dryRun) {
          await upsertLeadAndSite(place, audit, emailDiscovery, qualification);
          counters.insertedOrUpdated += 1;
        } else {
          counters.skipped += 1;
        }
      } catch (error: any) {
        counters.errors += 1;
        errors.push(safeString(error?.message, "candidate failed"));
      }
    }

    await jobRef.set({ status: "complete", completedAt: serverTimestamp(), counters, errors: errors.slice(0, 20) }, { merge: true });
    return { jobId: jobRef.id, counters, errors, dryRun: Boolean(options.dryRun) };
  } catch (error: any) {
    counters.errors += 1;
    errors.push(safeString(error?.message, "discovery failed"));
    await jobRef.set({ status: "failed", completedAt: serverTimestamp(), counters, errors: errors.slice(0, 20) }, { merge: true });
    throw error;
  }
}

async function getAdminEmails(): Promise<string[]> {
  const envEmails = safeString(process.env.ADMIN_EMAILS).split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const configDoc = await db.collection("config").doc("admin").get();
  const configEmails = Array.isArray(configDoc.get("allowlistedEmails")) ? configDoc.get("allowlistedEmails").map((email: unknown) => safeString(email).toLowerCase()).filter(Boolean) : [];
  return Array.from(new Set([...envEmails, ...configEmails]));
}

async function requireAdmin(req: express.Request): Promise<DecodedIdToken> {
  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw Object.assign(new Error("Missing bearer token."), { statusCode: 401 });

  const decoded = await getAuth().verifyIdToken(match[1]);
  const emails = await getAdminEmails();
  const email = safeString(decoded.email).toLowerCase();
  if (!decoded.admin && (!email || !emails.includes(email))) {
    throw Object.assign(new Error("Admin access denied."), { statusCode: 403 });
  }
  return decoded;
}

async function requireUser(req: express.Request): Promise<DecodedIdToken> {
  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw Object.assign(new Error("Missing bearer token."), { statusCode: 401 });
  return getAuth().verifyIdToken(match[1]);
}

function normalizeFinancialMerchant(description: string): string {
  const processorVendor = processorVendorFromDescription(description);
  if (processorVendor) return processorVendor;
  const merchant = safeString(description, "Unknown Merchant")
    .replace(/^SQ \*/i, "")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/[#*]\w+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return merchant || "Unknown Merchant";
}

function processorVendorFromDescription(description: string): string {
  const paypal = safeString(description).match(/\bPAYPAL\s+\*([A-Z0-9][A-Z0-9&.'-]{1,})/i);
  if (!paypal?.[1]) return "";
  const compact = safeString(paypal[1]).replace(/(LIMITED|LIMIT|LLC|INC|CORP)$/i, "").trim();
  if (/^[A-Z]{2,6}LABS$/i.test(compact)) return compact.replace(/LABS$/i, "Labs");
  return compact.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function estimateFinancialCost(inputTokens: number, outputTokens: number, webSearchCalls = 0) {
  const inputCost = (Math.max(0, inputTokens) / 1000000) * FINANCIAL_INPUT_PRICE_PER_1M;
  const outputCost = (Math.max(0, outputTokens) / 1000000) * FINANCIAL_OUTPUT_PRICE_PER_1M;
  const webSearchCost = (Math.max(0, webSearchCalls) / 1000) * FINANCIAL_WEB_SEARCH_PRICE_PER_1K;
  return {
    inputCost,
    outputCost,
    webSearchCost,
    totalCost: inputCost + outputCost + webSearchCost
  };
}

function extractOpenAiResponseText(body: any): string {
  if (typeof body?.output_text === "string") return body.output_text;
  if (!Array.isArray(body?.output)) return "";
  return body.output
    .filter((item: any) => item?.type === "message" && Array.isArray(item?.content))
    .flatMap((item: any) => item.content)
    .map((content: any) => safeLongString(content?.text || "", "", 30000))
    .filter(Boolean)
    .join("\n");
}

function countOpenAiWebSearchCalls(body: any): number {
  if (!Array.isArray(body?.output)) return 0;
  return body.output.filter((item: any) => item?.type === "web_search_call").length;
}

function responseUsage(body: any) {
  const usage = body?.usage || {};
  const inputTokens = Number(usage.input_tokens || usage.prompt_tokens || 0);
  const outputTokens = Number(usage.output_tokens || usage.completion_tokens || 0);
  return {
    inputTokens,
    outputTokens,
    totalTokens: Number(usage.total_tokens || inputTokens + outputTokens)
  };
}

function openAiApiKeyValue(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    return openAiApiKey.value() || "";
  } catch {
    return "";
  }
}

function supportsOpenAiTemperature(model: string): boolean {
  return !/^(gpt-5|o[0-9]|o1|o3|o4)/i.test(model.trim());
}

function openAiErrorMessage(body: any, status: number): string {
  const error = body?.error || {};
  const parts = [
    safeString(error.message, "AI categorization failed."),
    safeString(error.code),
    safeString(error.param),
    safeString(error.type)
  ].filter(Boolean);
  return `OpenAI request failed (${status}): ${parts.join("; ")}`;
}

function keywordFinancialCategorize(item: any, allowedCategories = FINANCIAL_CATEGORIES) {
  const description = safeString(item?.description);
  const matched = FINANCIAL_KEYWORDS.find((rule) => rule.match.test(description));
  const category = matched && allowedCategories.includes(matched.category) ? matched.category : "Uncategorized";
  const vendor = normalizeFinancialMerchant(description);
  return {
    id: safeString(item?.id),
    displayName: vendor,
    vendor,
    merchant: vendor,
    category,
    confidence: matched?.confidence || 35,
    suggestedDescription: vendor,
    notes: matched ? `Matched ${category} from conservative keyword rules.` : "Manual review recommended.",
    reason: matched ? "Matched conservative server-side keyword rules." : "No server-side keyword rule matched; manual review recommended.",
    sourceUrls: [],
    source: "server_keyword"
  };
}

async function aiFinancialCategorize(transactions: any[], categories: string[], options: { webLookupEnabled?: boolean; updateFields?: string[] } = {}) {
  const apiKey = openAiApiKeyValue();
  if (!apiKey) return null;
  const validUpdateFields = new Set(["category", "merchant", "vendor", "notes"]);
  const updateFields: string[] = Array.isArray(options.updateFields) ? Array.from(new Set(options.updateFields.map((field) => safeString(field)).filter((field): field is string => validUpdateFields.has(field)))) : ["category", "merchant", "vendor", "notes"];
  const minimalTransactions = transactions.slice(0, FINANCIAL_AI_MAX_TRANSACTIONS).map((item) => ({
    id: safeString(item?.id),
    description: safeString(item?.description),
    currentMerchant: safeString(item?.merchant),
    currentVendor: safeString(item?.vendor || item?.merchant),
    amount: Number(item?.amount || 0),
    date: safeString(item?.date),
    matchCount: Math.max(1, Math.min(999, Number(item?.matchCount || 1)))
  }));
  const allowedCategories = categories.length ? Array.from(new Set(categories)).slice(0, 80) : FINANCIAL_CATEGORIES;
  const responsePayload = {
    model: FINANCIAL_AI_MODEL,
    max_output_tokens: Math.min(16000, 900 + minimalTransactions.length * 180),
    ...(supportsOpenAiTemperature(FINANCIAL_AI_MODEL) ? { temperature: 0.1 } : {}),
    ...(options.webLookupEnabled ? { tools: [{ type: "web_search_preview", search_context_size: "low" }], tool_choice: "auto" } : {}),
    text: {
      format: {
        type: "json_schema",
        name: "financial_transaction_analysis",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  displayName: { type: "string" },
                  vendor: { type: "string" },
                  category: { type: "string", enum: allowedCategories },
                  confidence: { type: "number", minimum: 0, maximum: 100 },
                  suggestedDescription: { type: "string" },
                  notes: { type: "string" },
                  reason: { type: "string" },
                  sourceUrls: { type: "array", items: { type: "string" }, maxItems: 3 }
                },
                required: ["id", "displayName", "vendor", "category", "confidence", "suggestedDescription", "notes", "reason", "sourceUrls"]
              }
            }
          },
          required: ["results"]
        }
      }
    },
    input: [
      {
        role: "system",
        content: "You clean and categorize personal finance transactions. Return only JSON that matches the schema. The selected updateFields indicate which fields the user wants applied locally, but still populate every schema field with your best analysis. For category updates, choose exactly one category from the provided List of Categories and never invent a category. For merchant updates, create a short recognizable displayName. For vendor updates, detect the real vendor. For notes updates, write one concise transaction note suitable for a notes field. Explain the decision in reason. Use description, currentMerchant, currentVendor, amount, date, and duplicate count. Treat payment processors such as PayPal, Venmo, Cash App, Square, Stripe, Apple Pay, and Google Pay as processors, not vendors, when the description contains a more specific seller token or name. In PayPal descriptions like PAYPAL *SELLER 4029357733, the real vendor is the token after PAYPAL *. Use Transfers for likely account movements and credit-card payments, but do not assume the final money-flow treatment; local account-aware reconciliation decides whether a transfer is internal, matched, single-sided, or reportable. Use Credits to the Account for credit-card credits/payments. Use Uncategorized when uncertain. Do not invent product details. If web search is available, use it only for low-confidence purchases with enough vendor/description context; never search by price alone."
      },
      {
        role: "user",
        content: JSON.stringify({ updateFields, "List of Categories": allowedCategories, categories: allowedCategories, webLookupEnabled: Boolean(options.webLookupEnabled), transactions: minimalTransactions })
      }
    ]
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(responsePayload)
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(openAiErrorMessage(body, response.status)), { statusCode: 502 });
  const content = safeLongString(extractOpenAiResponseText(body) || "{}", "{}", 30000);
  const parsed = JSON.parse(content);
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  const usage = responseUsage(body);
  const webSearchCalls = countOpenAiWebSearchCalls(body);
  return {
    results: results.map((result: any) => {
      const sourceTransaction = transactions.find((item) => item.id === result?.id);
      const vendor = safeString(result?.vendor || result?.merchant || normalizeFinancialMerchant(sourceTransaction?.description || ""));
      const displayName = safeString(result?.displayName || vendor || normalizeFinancialMerchant(sourceTransaction?.description || ""));
      return {
        id: safeString(result?.id),
        displayName,
        vendor,
        merchant: displayName || vendor,
        category: allowedCategories.includes(safeString(result?.category)) ? safeString(result?.category) : "Uncategorized",
        confidence: Math.max(0, Math.min(100, Number(result?.confidence || 0))),
        suggestedDescription: safeString(result?.suggestedDescription || displayName || vendor),
        notes: safeString(result?.notes || result?.reason || ""),
        reason: safeString(result?.reason || "AI categorization based on supplied transaction fields."),
        sourceUrls: Array.isArray(result?.sourceUrls) ? result.sourceUrls.slice(0, 3).map((url: unknown) => safeString(url)).filter(Boolean) : [],
        source: webSearchCalls ? "ai_web" : "ai"
      };
    }),
    usage,
    webSearchCalls,
    cost: estimateFinancialCost(usage.inputTokens, usage.outputTokens, webSearchCalls)
  };
}

function asyncRoute(handler: (req: express.Request, res: express.Response) => Promise<void>) {
  return async (req: express.Request, res: express.Response) => {
    try {
      await handler(req, res);
    } catch (error: any) {
      logger.error(error);
      res.status(Number(error?.statusCode || 500)).json({ error: safeString(error?.message, "Request failed.") });
    }
  };
}

async function getSiteBySlug(slug: string): Promise<DocumentSnapshot | null> {
  const snapshot = await db.collection("sites").where("slug", "==", slug).limit(1).get();
  return snapshot.empty ? null : snapshot.docs[0];
}

function renderSiteHtml(site: any, mode: "preview" | "live"): string {
  const content = site.content || {};
  const isPreview = mode === "preview" || site.status !== "live" || site.seoIndexable !== true;
  const robots = isPreview ? "<meta name=\"robots\" content=\"noindex,nofollow\">" : "<meta name=\"robots\" content=\"index,follow\">";
  const rating = Number(content.rating || site.source?.rating || 0);
  const reviewCount = Number(content.reviewCount || site.source?.reviewCount || 0);
  const phone = safeString(content.phone || BUSINESS_PHONE);
  const ctaPhone = safeString(content.ctaPhone || BUSINESS_PHONE);
  const ctaEmail = safeString(content.ctaEmail || CONTACT_EMAIL);
  const services = Array.isArray(content.services) && content.services.length > 0 ? content.services : HVAC_SERVICES;
  const serviceArea = Array.isArray(content.serviceArea) && content.serviceArea.length > 0 ? content.serviceArea : SERVICE_AREA;
  const reviews = Array.isArray(content.reviews) ? content.reviews.slice(0, 3) : [];
  const title = `${escapeHtml(site.businessName)} HVAC Services | Nashville`;
  const reviewLine = rating || reviewCount ? `${rating ? `${rating.toFixed(1)} stars` : "Google rated"}${reviewCount ? ` based on ${reviewCount} reviews` : ""}` : "Local Nashville HVAC service";

  const reviewCards = reviews.length > 0 ? reviews.map((review: any) => `
    <article class="card review"><strong>${escapeHtml(review.rating || "")}${review.rating ? " star review" : "Review"}</strong><p>${escapeHtml(review.text)}</p><small>${escapeHtml(review.author || "Google reviewer")}</small></article>
  `).join("") : `
    <article class="card review"><strong>Review section</strong><p>This generated preview uses actual available Google rating and review-count data. Review snippets only appear when available and approved for display.</p></article>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${robots}
  <title>${title}</title>
  <meta name="description" content="${escapeHtml(site.businessName)} HVAC service preview for Nashville heating and cooling searches.">
  <style>
    :root{--brand:#0f766e;--brand-dark:#115e59;--accent:#67e8f9;--text:#12313b;--muted:#60747c;--card:#ecfeff;--line:#d9f7f8;--bg:#fff}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--text);background:var(--bg);line-height:1.6}a{color:inherit}.banner{background:#082f49;color:#fff;text-align:center;padding:.7rem 1rem;font-weight:700}.header{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);z-index:10}.container{max-width:1100px;margin:0 auto;padding:0 20px}.header .container{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-top:1rem;padding-bottom:1rem}.logo{font-size:1.25rem;font-weight:800;color:var(--brand);text-decoration:none}.nav{display:flex;gap:1rem;color:var(--muted);font-weight:600}.nav a{text-decoration:none}.btn{display:inline-block;border-radius:8px;padding:.8rem 1.2rem;text-decoration:none;font-weight:800;border:2px solid transparent}.btn-primary{background:var(--brand);color:#fff}.btn-secondary{background:#fff;color:var(--brand);border-color:var(--brand)}.hero{background:linear-gradient(135deg,rgba(8,47,73,.92),rgba(15,118,110,.82)),#0f766e;color:#fff;text-align:center;padding:80px 0}.hero h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.1;margin:0 auto 1rem;max-width:850px}.hero p{font-size:1.2rem;max-width:780px;margin:0 auto 2rem}.cta{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap}.badges,.grid,.cities{display:grid;gap:1rem}.badges{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:2rem}.badge,.card{background:#fff;color:var(--text);border:1px solid var(--line);border-radius:14px;padding:1.25rem;box-shadow:0 10px 25px rgba(0,0,0,.08)}section{padding:70px 0}section:nth-child(even){background:var(--card)}h2{text-align:center;font-size:2rem;margin:0 0 .7rem}.subtitle{text-align:center;color:var(--muted);max-width:760px;margin:0 auto 2.5rem}.grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.service strong{display:block;color:var(--brand);font-size:1.1rem;margin-bottom:.4rem}.cities{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}.cities span{background:#fff;border:1px solid var(--line);border-radius:999px;text-align:center;padding:.7rem;font-weight:700}.contact-box{background:#fff;border-radius:16px;border:1px solid var(--line);padding:2rem;text-align:center}.footer{background:#082f49;color:#d9f7f8;padding:2rem 0;text-align:center}@media(max-width:760px){.header .container{align-items:flex-start;flex-direction:column}.nav{flex-wrap:wrap}.hero{padding:56px 0}.cta{flex-direction:column}.btn{width:100%;text-align:center}}
  </style>
</head>
<body>
  ${isPreview ? "<div class=\"banner\">Preview generated by Fennington. This preview does not imply contractor endorsement.</div>" : ""}
  <header class="header"><div class="container"><a class="logo" href="#top">${escapeHtml(site.businessName)}</a><nav class="nav"><a href="#services">Services</a><a href="#reviews">Reviews</a><a href="#area">Service Area</a><a href="#contact">Contact</a></nav><a class="btn btn-primary" href="tel:${escapeHtml(phone.replace(/\D/g, ""))}">${escapeHtml(phone || "Call")}</a></div></header>
  <main id="top">
    <section class="hero"><div class="container"><h1>${escapeHtml(content.heroHeadline || `${site.businessName} HVAC Service in Nashville`)}</h1><p>${escapeHtml(content.heroSubtitle || "Heating and cooling service preview for Nashville homeowners.")}</p><div class="cta"><a class="btn btn-primary" href="tel:${escapeHtml(phone.replace(/\D/g, ""))}">Call ${escapeHtml(phone || "Now")}</a><a class="btn btn-secondary" href="mailto:${escapeHtml(ctaEmail)}">Contact Fennington</a></div><div class="badges"><div class="badge"><strong>${escapeHtml(reviewLine)}</strong><br><span>Google profile signal</span></div><div class="badge"><strong>Mobile-ready HVAC page</strong><br><span>Designed for urgent calls</span></div><div class="badge"><strong>Nashville service focus</strong><br><span>Local search coverage</span></div></div></div></section>
    <section id="services"><div class="container"><h2>HVAC Services</h2><p class="subtitle">Clear service sections for the heating and cooling searches customers use before they call.</p><div class="grid">${services.map((service: string) => `<article class="card service"><strong>${escapeHtml(service)}</strong><p>Focused content for ${escapeHtml(service).toLowerCase()} calls in Nashville and nearby communities.</p></article>`).join("")}</div></div></section>
    <section id="reviews"><div class="container"><h2>Reviews & Trust</h2><p class="subtitle">${escapeHtml(reviewLine)}. Generated previews replace generic review claims with actual lead data.</p><div class="grid">${reviewCards}</div></div></section>
    <section id="area"><div class="container"><h2>Service Area</h2><p class="subtitle">Nashville-area towns presented in a simple local SEO section.</p><div class="cities">${serviceArea.map((city: string) => `<span>${escapeHtml(city)}</span>`).join("")}</div></div></section>
    <section id="contact"><div class="container"><div class="contact-box"><h2>Ready to claim this website preview?</h2><p>Call ${escapeHtml(ctaPhone)} or email ${escapeHtml(ctaEmail)}. Activation and Stripe checkout are currently configured as a disabled placeholder until pricing is finalized.</p><div class="cta"><a class="btn btn-primary" href="tel:${escapeHtml(ctaPhone.replace(/\D/g, ""))}">Call Fennington</a><a class="btn btn-secondary" href="mailto:${escapeHtml(ctaEmail)}">Email Fennington</a></div></div></div></section>
  </main>
  <footer class="footer"><div class="container">${escapeHtml(site.businessName)} ${isPreview ? "preview" : "website"} by Fennington.</div></footer>
</body>
</html>`;
}

const apiApp = express();
apiApp.use(cors({ origin: true }));
apiApp.use((req, _res, next) => {
  if (req.url === "/api") req.url = "/";
  else if (req.url.startsWith("/api/")) req.url = req.url.slice(4);
  next();
});
apiApp.use(express.json({ limit: "1mb" }));

apiApp.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "fennington-lead-preview" });
});

apiApp.get("/admin/leads", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  let query: Query = db.collection("leads");
  if (req.query.market) query = query.where("market", "==", safeString(req.query.market));
  if (req.query.trade) query = query.where("trade", "==", safeString(req.query.trade));
  if (req.query.status) query = query.where("outreachStatus", "==", safeString(req.query.status));
  query = query.orderBy("updatedAt", "desc").limit(Math.min(Number(req.query.limit || 50), 100));
  const snapshot = await query.get();
  res.json({ leads: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
}));

apiApp.get("/admin/leads/:leadId", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const lead = await db.collection("leads").doc(req.params.leadId).get();
  if (!lead.exists) throw Object.assign(new Error("Lead not found."), { statusCode: 404 });
  const siteId = lead.get("previewSiteId");
  const site = siteId ? await db.collection("sites").doc(siteId).get() : null;
  const messages = await db.collection("outreach").where("leadId", "==", lead.id).orderBy("approvedAt", "desc").limit(10).get();
  res.json({ lead: { id: lead.id, ...lead.data() }, site: site?.exists ? { id: site.id, ...site.data() } : null, outreach: messages.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
}));

apiApp.post("/admin/jobs/discover-nashville-hvac", asyncRoute(async (req, res) => {
  const adminUser = await requireAdmin(req);
  const result = await runNashvilleHvacDiscovery({ dryRun: req.body?.dryRun !== false, cap: req.body?.cap, requestedBy: adminUser.email || adminUser.uid });
  res.json(result);
}));

apiApp.post("/admin/leads/:leadId/reject", asyncRoute(async (req, res) => {
  const adminUser = await requireAdmin(req);
  await db.collection("leads").doc(req.params.leadId).set({ outreachStatus: "rejected", rejectedBy: adminUser.email || adminUser.uid, rejectedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  res.json({ ok: true });
}));

apiApp.post("/admin/leads/:leadId/call-task", asyncRoute(async (req, res) => {
  const adminUser = await requireAdmin(req);
  await db.collection("leads").doc(req.params.leadId).set({ outreachStatus: "call_queue", callQueuedBy: adminUser.email || adminUser.uid, callQueuedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  res.json({ ok: true });
}));

apiApp.post("/admin/leads/:leadId/regenerate-preview", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const leadRef = db.collection("leads").doc(req.params.leadId);
  const lead = await leadRef.get();
  if (!lead.exists) throw Object.assign(new Error("Lead not found."), { statusCode: 404 });
  const leadData = lead.data() || {};
  const siteRef = db.collection("sites").doc(safeString(leadData.placeId || lead.id));
  await siteRef.set({
    leadId: lead.id,
    slug: leadData.slug || `${slugify(leadData.businessName || "hvac-contractor")}-nashville`,
    businessName: leadData.businessName || "HVAC Contractor",
    trade: TRADE,
    market: MARKET,
    status: "preview",
    template: "hvac",
    canonicalPath: `/sites/${leadData.slug}`,
    previewPath: `/preview/${leadData.slug}`,
    seoIndexable: false,
    content: siteContentFromLead(leadData),
    source: {
      placeId: leadData.placeId || lead.id,
      rating: leadData.rating || 0,
      reviewCount: leadData.reviewCount || 0,
      websiteUri: leadData.websiteUri || "",
      googleMapsUri: leadData.googleMapsUri || "",
      formattedAddress: leadData.formattedAddress || ""
    },
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge: true });
  await leadRef.set({ previewSiteId: siteRef.id, updatedAt: serverTimestamp() }, { merge: true });
  res.json({ ok: true, siteId: siteRef.id });
}));

apiApp.post("/admin/leads/:leadId/rerun-audit", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const leadRef = db.collection("leads").doc(req.params.leadId);
  const lead = await leadRef.get();
  if (!lead.exists) throw Object.assign(new Error("Lead not found."), { statusCode: 404 });
  const audit = await auditWebsite(lead.get("websiteUri"));
  await leadRef.set({ websiteAudit: audit, lastScoredAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  res.json({ ok: true, audit });
}));

apiApp.post("/admin/leads/:leadId/approve-outreach", asyncRoute(async (req, res) => {
  const adminUser = await requireAdmin(req);
  const lead = await db.collection("leads").doc(req.params.leadId).get();
  if (!lead.exists) throw Object.assign(new Error("Lead not found."), { statusCode: 404 });
  const leadData = lead.data() || {};
  const toEmail = safeString(req.body?.toEmail || leadData.emailDiscovery?.email).toLowerCase();
  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) throw Object.assign(new Error("A valid discovered email is required."), { statusCode: 400 });
  const siteId = safeString(leadData.previewSiteId || lead.id);
  const site = await db.collection("sites").doc(siteId).get();
  const previewPath = site.exists ? safeString(site.get("previewPath"), `/preview/${leadData.slug}`) : `/preview/${leadData.slug}`;
  const previewUrl = `https://fennington.com${previewPath}`;
  const messageRef = db.collection("outreach").doc();
  const emailHash = hashEmail(toEmail);
  const unsubscribeUrl = `https://fennington.com/unsubscribe/${encodeToken(messageRef.id, emailHash)}`;
  const subject = safeString(req.body?.subject || `I made a quick website preview for ${leadData.businessName}`);
  const observation = leadData.websiteAudit?.flags?.length ? `I noticed your current web presence may have this issue: ${leadData.websiteAudit.flags[0].replace(/_/g, " ")}.` : "I noticed your Google reviews could be doing more work for you online.";
  const text = safeLongString(req.body?.text || `Hi ${leadData.businessName},\n\nYou have ${leadData.reviewCount || "strong"} Google reviews, so I made a quick HVAC website preview showing how those reviews could turn into more service calls. ${observation}\n\nPreview: ${previewUrl}\nCall: ${BUSINESS_PHONE}\nReply: ${CONTACT_EMAIL}\n\nFennington Solutions\n${process.env.OUTREACH_PHYSICAL_ADDRESS || "Physical mailing address required before live sending"}\nUnsubscribe: ${unsubscribeUrl}` , "");
  const html = safeLongString(req.body?.html || `<p>Hi ${escapeHtml(leadData.businessName)},</p><p>You have ${escapeHtml(String(leadData.reviewCount || "strong"))} Google reviews, so I made a quick HVAC website preview showing how those reviews could turn into more service calls.</p><p>${escapeHtml(observation)}</p><p><a href="${escapeHtml(previewUrl)}">View the preview</a></p><p>Call ${escapeHtml(BUSINESS_PHONE)} or reply to ${escapeHtml(CONTACT_EMAIL)}.</p><p>Fennington Solutions<br>${escapeHtml(process.env.OUTREACH_PHYSICAL_ADDRESS || "Physical mailing address required before live sending")}<br><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p>`, "");

  await messageRef.set({
    leadId: lead.id,
    siteId,
    channel: "email",
    toEmail,
    emailHash,
    fromEmail: process.env.RESEND_FROM_EMAIL || "",
    subject,
    html,
    text,
    status: "approved",
    variant: safeString(req.body?.variant || "B"),
    unsubscribeToken: encodeToken(messageRef.id, emailHash),
    approvedBy: adminUser.email || adminUser.uid,
    approvedAt: serverTimestamp()
  });
  await lead.ref.set({ outreachStatus: "approved", updatedAt: serverTimestamp() }, { merge: true });
  res.json({ ok: true, messageId: messageRef.id });
}));

apiApp.post("/admin/outreach/:messageId/send", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const messageRef = db.collection("outreach").doc(req.params.messageId);
  const message = await messageRef.get();
  if (!message.exists) throw Object.assign(new Error("Outreach message not found."), { statusCode: 404 });
  if (message.get("status") !== "approved") throw Object.assign(new Error("Only approved outreach can be sent."), { statusCode: 400 });

  const emailConfig = await db.collection("config").doc("email").get();
  const sendingEnabled = emailConfig.get("sendingEnabled") === true;
  const physicalAddress = safeString(emailConfig.get("physicalMailingAddress") || process.env.OUTREACH_PHYSICAL_ADDRESS);
  const fromEmail = safeString(emailConfig.get("fromEmail") || process.env.RESEND_FROM_EMAIL);
  const dailyCap = Math.min(Number(emailConfig.get("dailyCap") || DEFAULT_EMAIL_CAP), DEFAULT_EMAIL_CAP);
  if (!sendingEnabled || !physicalAddress || !fromEmail || !process.env.RESEND_API_KEY) {
    throw Object.assign(new Error("Live sending is blocked until Resend, from email, physical address, and sendingEnabled are configured."), { statusCode: 412 });
  }

  const emailHash = safeString(message.get("emailHash") || hashEmail(message.get("toEmail")));
  const suppression = await db.collection("suppressions").doc(emailHash).get();
  if (suppression.exists) throw Object.assign(new Error("Recipient is suppressed."), { statusCode: 409 });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = await db.collection("outreach").where("channel", "==", "email").where("status", "==", "sent").where("sentAt", ">=", startOfDay).get();
  if (sentToday.size >= dailyCap) throw Object.assign(new Error("Daily approved email cap reached."), { statusCode: 429 });

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [message.get("toEmail")],
      reply_to: CONTACT_EMAIL,
      subject: message.get("subject"),
      html: message.get("html"),
      text: message.get("text")
    })
  });
  const resendBody = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) {
    await messageRef.set({ status: "failed", error: resendBody, updatedAt: serverTimestamp() }, { merge: true });
    throw Object.assign(new Error("Resend send failed."), { statusCode: 502 });
  }

  await messageRef.set({ status: "sent", resendEmailId: resendBody.id || null, sentAt: serverTimestamp(), fromEmail, updatedAt: serverTimestamp() }, { merge: true });
  const leadId = safeString(message.get("leadId"));
  if (leadId) await db.collection("leads").doc(leadId).set({ outreachStatus: "sent", lastContactedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  res.json({ ok: true, resendEmailId: resendBody.id || null });
}));

apiApp.post("/financial/categorize", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const transactions = Array.isArray(req.body?.transactions) ? req.body.transactions.slice(0, FINANCIAL_AI_MAX_TRANSACTIONS) : [];
  const categories = Array.isArray(req.body?.categories) ? req.body.categories.map((category: unknown) => safeString(category)).filter(Boolean) : FINANCIAL_CATEGORIES;
  const webLookupEnabled = req.body?.webLookupEnabled === true;
  const validUpdateFields = new Set(["category", "merchant", "vendor", "notes"]);
  const updateFields: string[] = Array.isArray(req.body?.updateFields) ? Array.from(new Set(req.body.updateFields.map((field: unknown) => safeString(field)).filter((field: string): field is string => validUpdateFields.has(field)))) : ["category", "merchant", "vendor", "notes"];
  const requireAi = req.body?.requireAi !== false;
  if (!transactions.length) throw Object.assign(new Error("At least one transaction is required."), { statusCode: 400 });
  const safeTransactions = transactions.map((item: any) => ({
    id: safeString(item?.id),
    description: safeString(item?.description),
    merchant: safeString(item?.merchant || item?.vendor),
    vendor: safeString(item?.vendor || item?.merchant),
    amount: Number(item?.amount || 0),
    date: safeString(item?.date),
    matchCount: Math.max(1, Math.min(999, Number(item?.matchCount || 1)))
  })).filter((item: any) => item.id && item.description);
  if (!safeTransactions.length) throw Object.assign(new Error("No valid transactions were provided."), { statusCode: 400 });
  if (requireAi && !openAiApiKeyValue()) throw Object.assign(new Error("OPENAI_API_KEY is not configured for the financial analyzer."), { statusCode: 412 });

  let results = safeTransactions.map((item: any) => keywordFinancialCategorize(item, categories));
  let source = "server_keyword";
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let cost = estimateFinancialCost(0, 0, 0);
  let webSearchCalls = 0;
  try {
    const aiResult = await aiFinancialCategorize(safeTransactions, categories, { webLookupEnabled, updateFields });
    if (aiResult?.results?.length) {
      const aiById = new Map(aiResult.results.map((item: any) => [item.id, item]));
      results = results.map((fallback: any) => aiById.get(fallback.id) || fallback);
      usage = aiResult.usage;
      cost = aiResult.cost;
      webSearchCalls = aiResult.webSearchCalls;
      source = webSearchCalls ? "ai_web" : "ai";
    }
  } catch (error) {
    if (requireAi) throw error;
    logger.warn("Financial AI categorization fell back to keyword rules", { uid: user.uid, error });
  }
  if (requireAi && source === "server_keyword") throw Object.assign(new Error("AI did not return usable transaction analysis results."), { statusCode: 502 });

  res.json({ results, source, processed: results.length, model: FINANCIAL_AI_MODEL, usage, cost, webSearchCalls });
}));

apiApp.post("/sites/:siteId/create-checkout-session", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  res.status(501).json({ error: "Stripe Checkout is intentionally disabled until product and price decisions are finalized.", siteId: req.params.siteId });
}));

apiApp.post("/stripe/webhook", asyncRoute(async (_req, res) => {
  res.status(501).json({ error: "Stripe webhook placeholder only. Enable with raw-body signature verification before production use." });
}));

export const api = onRequest({ region: REGION, timeoutSeconds: 120, memory: "512MiB", secrets: [openAiApiKey] }, apiApp);

export const renderSite = onRequest({ region: REGION, timeoutSeconds: 30, memory: "256MiB" }, async (req, res) => {
  const pathname = (req.originalUrl || req.url || "").split("?")[0];
  const segments = pathname.split("/").filter(Boolean);
  const mode = segments[0] === "sites" ? "live" : "preview";
  const slug = safeString(segments[1]);
  if (!slug) {
    res.status(404).send("Site not found.");
    return;
  }

  const site = await getSiteBySlug(slug);
  if (!site?.exists) {
    res.status(404).send("Site not found.");
    return;
  }

  const siteData: any = { id: site.id, ...(site.data() || {}) };
  if (siteData.status === "disabled") {
    res.status(410).send("Site disabled.");
    return;
  }

  const html = renderSiteHtml(siteData, mode);
  if (mode === "preview" || siteData.status !== "live" || siteData.seoIndexable !== true) {
    res.set("X-Robots-Tag", "noindex, nofollow");
  }
  res.set("content-type", "text/html; charset=utf-8").send(html);
});

export const unsubscribe = onRequest({ region: REGION, timeoutSeconds: 30, memory: "256MiB" }, async (req, res) => {
  const pathname = (req.originalUrl || req.url || "").split("?")[0];
  const token = safeString(pathname.split("/").filter(Boolean)[1]);
  const decoded = decodeToken(token);
  if (!decoded) {
    res.status(400).send("Invalid unsubscribe link.");
    return;
  }

  await db.collection("suppressions").doc(decoded.emailHash).set({
    emailHash: decoded.emailHash,
    reason: "unsubscribe",
    sourceMessageId: decoded.messageId,
    createdAt: serverTimestamp()
  }, { merge: true });

  await db.collection("outreach").doc(decoded.messageId).set({ status: "unsubscribed", unsubscribedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });

  res.set("content-type", "text/html; charset=utf-8").send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex,nofollow"><title>Unsubscribed</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:grid;min-height:100vh;place-items:center;margin:0;background:#ecfeff;color:#12313b}.card{max-width:560px;background:#fff;border-radius:16px;padding:2rem;box-shadow:0 10px 25px rgba(0,0,0,.1)}</style></head><body><main class="card"><h1>You are unsubscribed</h1><p>This email address has been added to the Fennington suppression list and will not receive further outreach emails.</p></main></body></html>`);
});

export const scheduledDiscoverNashvilleHvacLeads = onSchedule({ region: REGION, schedule: "every day 08:00", timeZone: "America/Chicago", timeoutSeconds: 540, memory: "512MiB" }, async () => {
  await runNashvilleHvacDiscovery({ dryRun: false, cap: DEFAULT_LEAD_CAP, requestedBy: "scheduled" });
});
