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
import Stripe from "stripe";

loadLocalEnvFile();

initializeApp();

const db = getFirestore();
const serverTimestamp = FieldValue.serverTimestamp;
const openAiApiKey = defineSecret("OPENAI_API_KEY");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const stripePriceChoreTracker = defineSecret("STRIPE_PRICE_CHORE_TRACKER");
const fdPosServiceSecret = defineSecret("FD_POS_SERVICE_SECRET");
const resendApiKey = defineSecret("RESEND_API_KEY");

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
const CHORE_TRACKER_PRODUCT_SLUG = "chore-tracker";
const CHORE_TRACKER_PRODUCT_NAME = "14-Day Homestead Chore Tracker System";
const CHORE_TRACKER_FULFILLMENT_VERSION = "2026-08-01";
const DEFAULT_DIGITAL_PRODUCT_TOKEN_TTL_DAYS = 7;
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@fennington.com";
const SITE_URL = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || "https://fennington.com").replace(/\/$/, "");

const PRODUCT_STATUSES = [
  "IDEA", "ABK_GENERATING", "EBOOK_GENERATED", "SOURCE_REVIEW", "PROMISE_EXTRACTION", "PROMISE_APPROVAL_REQUIRED",
  "SUPPORTING_ASSETS_GENERATING", "SUPPORTING_ASSETS_REVIEW", "PACKAGE_READY", "SALES_PAGE_DRAFT", "SALES_PAGE_APPROVAL_REQUIRED",
  "STRIPE_DRAFT", "STRIPE_READY", "FULFILLMENT_READY", "LAUNCH_READY", "LIVE", "CONTENT_MARKETING_READY", "CONTENT_MARKETING_ACTIVE",
  "BLOCKED", "ARCHIVED"
] as const;
const PUBLIC_CHECKOUT_STATUSES = new Set(["LIVE", "LAUNCH_READY"]);
const ASSET_TYPES = new Set(["ebook", "pdf", "worksheet", "spreadsheet", "checklist", "template", "module", "cover", "zip", "sales-page", "other"]);
const ASSET_FORMATS = new Set(["docx", "pdf", "html", "xlsx", "gsheet", "csv", "png", "zip", "md", "json", "other"]);
const ASSET_SOURCES = new Set(["abk", "perc", "manual", "website-builder", "package-builder"]);
const PROMISE_CATEGORIES = new Set(["deliverable", "feature", "bonus", "upsell", "outcome", "app-tie-in", "price", "support", "refund", "testimonial", "scarcity", "statistic", "other"]);
const PROMISE_RISK_LEVELS = new Set(["low", "medium", "high", "blocked"]);
const PROMISE_CLASSIFICATIONS = new Set(["keep", "needs_asset", "needs_evidence", "move_to_upsell", "remove", "rewrite", "ignore"]);

type ProductStatus = typeof PRODUCT_STATUSES[number];

type ProductManifest = {
  schemaVersion?: string;
  productId?: string;
  slug?: string;
  name?: string;
  priceCents?: number;
  currency?: string;
  sourceFolder?: string;
  primaryAsset?: {
    name?: string;
    pathOrUrl?: string;
    type?: string;
    format?: string;
  };
  valueEnhancer?: {
    name?: string;
    pathOrUrl?: string;
    type?: string;
    format?: string;
  };
  targetAudience?: string;
  approvedImplementationPaths?: string[];
  claimsPolicy?: Record<string, unknown>;
  fulfillment?: {
    deliveryMode?: string;
    tokenTtlDays?: number;
    files?: Record<string, { filename?: string; downloadName?: string }>;
  };
};

type DigitalProduct = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  status: ProductStatus | string;
  priceCents: number;
  currency: string;
  primaryAssetPath: string;
  sourceFolder: string;
  salesPagePath: string;
  supportEmail: string;
  stripeProductId: string;
  stripePriceId: string;
  fulfillmentPackageId: string;
  fulfillmentVersion: string;
  tokenTtlDays: number;
  testCheckoutEnabled: boolean;
  approvalRequired: boolean;
  fulfillmentFiles: Record<string, { filename: string; downloadName: string }>;
};

type PurchaseEmailResult = {
  status: "sent" | "pending_config" | "failed";
  resendEmailId?: string | null;
  error?: unknown;
};

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

function hashDownloadToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function secretValue(envName: string, secret: { value: () => string }): string {
  if (process.env[envName]) return process.env[envName] || "";
  try {
    return secret.value() || "";
  } catch {
    return "";
  }
}

function normalizeEmail(value: unknown): string {
  return safeString(value).toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function stripeClient(): Stripe {
  const apiKey = secretValue("STRIPE_SECRET_KEY", stripeSecretKey);
  if (!apiKey) throw Object.assign(new Error("Stripe is not configured."), { statusCode: 412 });
  return new Stripe(apiKey);
}

function configuredChoreTrackerPriceId(): string {
  const priceId = secretValue("STRIPE_PRICE_CHORE_TRACKER", stripePriceChoreTracker);
  if (!priceId) throw Object.assign(new Error("Chore tracker Stripe price is not configured."), { statusCode: 412 });
  return priceId;
}

function createDownloadToken(tokenTtlDays = DEFAULT_DIGITAL_PRODUCT_TOKEN_TTL_DAYS): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashDownloadToken(token),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * Math.max(1, Math.min(30, tokenTtlDays)))
  };
}

function accessUrlForToken(product: DigitalProduct, token: string): string {
  const accessPath = product.salesPagePath ? `${product.salesPagePath.replace(/\/$/, "")}/access.html` : `/digital-products/${product.slug}/access.html`;
  return `${SITE_URL}${accessPath.startsWith("/") ? accessPath : `/${accessPath}`}?token=${encodeURIComponent(token)}`;
}

function privateProductFile(product: DigitalProduct, fileKey: string): { filePath: string; downloadName: string } | null {
  const files = product.fulfillmentFiles || {};
  const file = files[fileKey] || files.screen || files.default;
  if (!file) return null;
  return {
    filePath: path.resolve(__dirname, "..", "private-products", product.slug, file.filename),
    downloadName: file.downloadName
  };
}

function digitalProductFromSnapshot(snapshot: DocumentSnapshot): DigitalProduct | null {
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  const slug = safeString(data.slug || snapshot.id);
  const name = safeString(data.name || slug);
  if (!slug || !name) return null;
  const rawFiles = data.fulfillmentFiles && typeof data.fulfillmentFiles === "object" ? data.fulfillmentFiles : {};
  const fulfillmentFiles: Record<string, { filename: string; downloadName: string }> = {};
  Object.entries(rawFiles).forEach(([key, value]: [string, any]) => {
    const fileKey = safeString(key);
    const filename = safeString(value?.filename);
    const downloadName = safeString(value?.downloadName || value?.filename);
    if (fileKey && filename && downloadName) fulfillmentFiles[fileKey] = { filename, downloadName };
  });
  return {
    id: snapshot.id,
    productId: safeString(data.productId || snapshot.id),
    slug,
    name,
    status: safeString(data.status || "IDEA"),
    priceCents: Number(data.priceCents || 0),
    currency: safeString(data.currency || "usd").toLowerCase(),
    primaryAssetPath: safeString(data.primaryAssetPath),
    sourceFolder: safeString(data.sourceFolder),
    salesPagePath: safeString(data.salesPagePath),
    supportEmail: safeString(data.supportEmail || SUPPORT_EMAIL),
    stripeProductId: safeString(data.stripeProductId),
    stripePriceId: safeString(data.stripePriceId),
    fulfillmentPackageId: safeString(data.fulfillmentPackageId),
    fulfillmentVersion: safeString(data.fulfillmentVersion || data.packageVersion || "draft"),
    tokenTtlDays: Math.max(1, Math.min(30, Number(data.tokenTtlDays || DEFAULT_DIGITAL_PRODUCT_TOKEN_TTL_DAYS))),
    testCheckoutEnabled: data.testCheckoutEnabled === true,
    approvalRequired: data.approvalRequired === true,
    fulfillmentFiles
  };
}

async function getDigitalProductBySlug(slug: string): Promise<DigitalProduct> {
  const snapshot = await db.collection("digitalProducts").where("slug", "==", slug).limit(1).get();
  const product = snapshot.empty ? null : digitalProductFromSnapshot(snapshot.docs[0]);
  if (!product) throw Object.assign(new Error("Digital product not found."), { statusCode: 404 });
  return product;
}

async function getDigitalProductById(productId: string): Promise<DigitalProduct> {
  const snapshot = await db.collection("digitalProducts").doc(productId).get();
  const product = digitalProductFromSnapshot(snapshot);
  if (!product) throw Object.assign(new Error("Digital product not found."), { statusCode: 404 });
  return product;
}

function assertCheckoutEnabled(product: DigitalProduct): void {
  if (!product.stripePriceId) throw Object.assign(new Error("Product Stripe price is not configured."), { statusCode: 412 });
  if (!PUBLIC_CHECKOUT_STATUSES.has(product.status) && !product.testCheckoutEnabled) {
    throw Object.assign(new Error("Checkout is not enabled for this product."), { statusCode: 409 });
  }
}

function validateProductManifest(input: unknown): ProductManifest {
  const manifest = (input && typeof input === "object" ? input : {}) as ProductManifest;
  const errors: string[] = [];
  if (safeString(manifest.schemaVersion) !== "1.0") errors.push("schemaVersion must be 1.0");
  if (!safeString(manifest.productId)) errors.push("productId is required");
  if (!safeString(manifest.slug)) errors.push("slug is required");
  if (!safeString(manifest.name)) errors.push("name is required");
  if (!Number.isInteger(manifest.priceCents) || Number(manifest.priceCents) <= 0) errors.push("priceCents must be a positive integer");
  if (!safeString(manifest.currency)) errors.push("currency is required");
  if (!safeString(manifest.sourceFolder)) errors.push("sourceFolder is required");
  if (!safeString(manifest.primaryAsset?.pathOrUrl)) errors.push("primaryAsset.pathOrUrl is required");
  if (errors.length) throw Object.assign(new Error(`Invalid product manifest: ${errors.join(", ")}.`), { statusCode: 400 });
  return manifest;
}

function productDraftFromManifest(manifest: ProductManifest) {
  const productId = safeString(manifest.productId);
  const slug = slugify(safeString(manifest.slug));
  const name = safeString(manifest.name);
  const ttlDays = Number(manifest.fulfillment?.tokenTtlDays || DEFAULT_DIGITAL_PRODUCT_TOKEN_TTL_DAYS);
  return {
    productId,
    slug,
    name,
    status: "EBOOK_GENERATED",
    priceCents: Number(manifest.priceCents),
    currency: safeString(manifest.currency || "usd").toLowerCase(),
    primaryAssetPath: safeString(manifest.primaryAsset?.pathOrUrl),
    sourceFolder: safeString(manifest.sourceFolder),
    salesPagePath: "",
    supportEmail: SUPPORT_EMAIL,
    refundPolicyStatus: "unapproved",
    approvalRequired: true,
    stripeProductId: "",
    stripePriceId: "",
    fulfillmentPackageId: "",
    approvedClaims: [],
    blockedClaims: [],
    brandRulesVersion: "fd-pos-1.0",
    targetAudience: safeString(manifest.targetAudience),
    approvedImplementationPaths: Array.isArray(manifest.approvedImplementationPaths) ? manifest.approvedImplementationPaths.map((item) => safeString(item)).filter(Boolean) : [],
    claimsPolicy: manifest.claimsPolicy || {},
    fulfillment: manifest.fulfillment || {},
    tokenTtlDays: Math.max(1, Math.min(30, ttlDays)),
    statusHistory: FieldValue.arrayUnion({ status: "EBOOK_GENERATED", updatedBy: "register-draft", reason: "Product manifest registered.", workflow: "FD-POS register-draft", updatedAt: new Date() }),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  };
}

function assetRecordFromManifest(productId: string, assetId: string, asset: ProductManifest["primaryAsset"], source: string) {
  return {
    productId,
    assetId,
    name: safeString(asset?.name || assetId),
    type: ASSET_TYPES.has(safeString(asset?.type)) ? safeString(asset?.type) : "other",
    format: ASSET_FORMATS.has(safeString(asset?.format)) ? safeString(asset?.format) : "other",
    pathOrUrl: safeString(asset?.pathOrUrl),
    source: ASSET_SOURCES.has(source) ? source : "manual",
    status: "NEEDS_REVIEW",
    qualityReview: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function normalizePromiseCategory(value: unknown, text: string): string {
  const explicit = safeString(value);
  if (PROMISE_CATEGORIES.has(explicit)) return explicit;
  if (/\b(testimonial|customer said|client said|customer reviews?|user reviews?)\b/i.test(text)) return "testimonial";
  if (/\b(limited time|only \d+ (?:copies|spots|available|left)|enrollment closes|offer expires?|fake scarcity)\b/i.test(text)) return "scarcity";
  if (/\b\d+%|\$\d+|\bprice\b|\bcost\b/i.test(text)) return /\$\d+|\bprice\b|\bcost\b/i.test(text) ? "price" : "statistic";
  if (/\brefund|guarantee|money back\b/i.test(text)) return "refund";
  if (/\bLivestock Tracker|app|iOS|Android|notification|reminder|sync|export\b/i.test(text)) return "app-tie-in";
  if (/\bbonus|upsell|upgrade\b/i.test(text)) return /\bupsell|upgrade\b/i.test(text) ? "upsell" : "bonus";
  if (/\btemplate|worksheet|checklist|spreadsheet|pdf|module|planner|tracker|resource|printable|toolkit|reference chart\b/i.test(text)) return "deliverable";
  if (/\bresult|outcome|save|avoid|fix|solve|build|learn\b/i.test(text)) return "outcome";
  return "other";
}

function classifyPromise(text: string, category: string, product: DigitalProduct, explicit?: unknown) {
  const requested = safeString(explicit);
  if (PROMISE_CLASSIFICATIONS.has(requested)) return requested;
  if (category === "testimonial" || category === "scarcity") return "remove";
  if (category === "statistic" || category === "refund") return "needs_evidence";
  if (category === "price" && !text.includes(String(product.priceCents / 100)) && !text.includes(String(product.priceCents))) return "rewrite";
  if (category === "upsell") return "move_to_upsell";
  if (category === "deliverable" || category === "bonus") return "needs_asset";
  if (category === "app-tie-in" && /\bchore|task assignment|calendar assignment\b/i.test(text)) return "rewrite";
  return "keep";
}

function riskForPromise(text: string, category: string, classification: string, explicit?: unknown): string {
  const requested = safeString(explicit);
  if (PROMISE_RISK_LEVELS.has(requested)) return requested;
  if (classification === "remove" || /\bguaranteed|testimonial|limited time|only \d+|\d+%|scientifically proven\b/i.test(text)) return "high";
  if (["needs_evidence", "rewrite", "move_to_upsell"].includes(classification) || ["refund", "price", "app-tie-in", "statistic"].includes(category)) return "medium";
  return "low";
}

function requiredAssetTypeForPromise(text: string, category: string): string {
  if (category !== "deliverable" && category !== "bonus") return "";
  if (/\bspreadsheet|sheet|xlsx|csv\b/i.test(text)) return "spreadsheet";
  if (/\bworksheet\b/i.test(text)) return "worksheet";
  if (/\bchecklist\b/i.test(text)) return "checklist";
  if (/\btemplate\b/i.test(text)) return "template";
  if (/\bmodule|lesson\b/i.test(text)) return "module";
  if (/\bpdf|printable\b/i.test(text)) return "pdf";
  return "other";
}

function extractPromiseCandidatesFromText(sourceText: string): string[] {
  return safeLongString(sourceText, "", 50000)
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((line) => safeString(line, "").replace(/^[\s>*#-]+/, ""))
    .filter((line) => line.length >= 18)
    .filter((line) => /\b(template|worksheet|checklist|spreadsheet|pdf|bonus|module|planner|tracker|Livestock Tracker|app|iOS|Android|refund|guarantee|limited time|only \d+|\d+%|\$\d+|included|you get|download|printable|resource|system)\b/i.test(line))
    .slice(0, 200);
}

function promiseRecordFromInput(product: DigitalProduct, index: number, item: any, fallbackAssetId: string) {
  const text = safeLongString(item?.text || item, "", 2000);
  if (!text) return null;
  const category = normalizePromiseCategory(item?.category, text);
  const classification = classifyPromise(text, category, product, item?.classification);
  const riskLevel = riskForPromise(text, category, classification, item?.riskLevel);
  const promiseId = safeString(item?.promiseId || `${product.productId}_promise_${String(index + 1).padStart(3, "0")}`);
  return {
    productId: product.productId,
    promiseId,
    sourceAssetId: safeString(item?.sourceAssetId || fallbackAssetId),
    sourceLocation: safeString(item?.sourceLocation || item?.location || "source-text"),
    text,
    category,
    riskLevel,
    classification,
    requiredAssetType: safeString(item?.requiredAssetType || requiredAssetTypeForPromise(text, category)),
    approvedBy: "",
    approvalStatus: "PENDING",
    linkedAssetIds: Array.isArray(item?.linkedAssetIds) ? item.linkedAssetIds.map((id: unknown) => safeString(id)).filter(Boolean) : [],
    notes: safeLongString(item?.notes || "", "", 2000),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function firestoreDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return null;
}

async function sendDigitalProductAccessEmail(product: DigitalProduct, toEmail: string, accessUrl: string): Promise<PurchaseEmailResult> {
  const emailConfig = await db.collection("config").doc("email").get();
  const fromEmail = safeString(emailConfig.get("transactionalFromEmail") || emailConfig.get("fromEmail") || process.env.RESEND_FROM_EMAIL);
  const apiKey = secretValue("RESEND_API_KEY", resendApiKey);
  if (!fromEmail || !apiKey) return { status: "pending_config" };

  const subject = `Your ${product.name} access link`;
  const text = `Thank you for purchasing ${product.name}.\n\nAccess your files here: ${accessUrl}\n\nThis link is time-limited. If it expires, request a fresh link from the access page.\n\nSupport: ${product.supportEmail}`;
  const html = `<p>Thank you for purchasing <strong>${escapeHtml(product.name)}</strong>.</p><p><a href="${escapeHtml(accessUrl)}">Access your files</a></p><p>This link is time-limited. If it expires, request a fresh link from the access page.</p><p>Support: <a href="mailto:${escapeHtml(product.supportEmail)}">${escapeHtml(product.supportEmail)}</a></p>`;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      reply_to: product.supportEmail,
      subject,
      html,
      text
    })
  });
  const resendBody = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) return { status: "failed", error: resendBody };
  return { status: "sent", resendEmailId: resendBody.id || null };
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

async function requireAdminOrServiceSecret(req: express.Request): Promise<{ uid: string; email?: string }> {
  const configuredSecret = secretValue("FD_POS_SERVICE_SECRET", fdPosServiceSecret);
  const providedSecret = safeString(req.header("x-fd-pos-secret") || req.header("x-webhook-secret"));
  const provided = Buffer.from(providedSecret);
  const expected = Buffer.from(configuredSecret);
  if (configuredSecret && providedSecret && provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
    return { uid: "fd-pos-service", email: "fd-pos-service" };
  }
  return requireAdmin(req);
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

apiApp.post("/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }), asyncRoute(async (req, res) => {
  const stripe = stripeClient();
  const webhookSecret = secretValue("STRIPE_WEBHOOK_SECRET", stripeWebhookSecret);
  if (!webhookSecret) throw Object.assign(new Error("Stripe webhook secret is not configured."), { statusCode: 412 });
  const signature = req.header("stripe-signature");
  if (!signature) throw Object.assign(new Error("Missing Stripe signature."), { statusCode: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error: any) {
    logger.warn("Stripe webhook signature verification failed", { error: error?.message });
    throw Object.assign(new Error("Invalid Stripe signature."), { statusCode: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    res.json({ received: true, ignored: true });
    return;
  }

  const eventSession = event.data.object as Stripe.Checkout.Session;
  const productSlug = safeString(eventSession.metadata?.product_slug);
  const productId = safeString(eventSession.metadata?.product_id);
  if (!productSlug && !productId) throw Object.assign(new Error("Checkout session is missing product metadata."), { statusCode: 400 });
  const product = productId ? await getDigitalProductById(productId) : await getDigitalProductBySlug(productSlug);

  const session = await stripe.checkout.sessions.retrieve(eventSession.id);
  const lineItems = await stripe.checkout.sessions.listLineItems(eventSession.id, { limit: 100 });
  const hasExpectedPrice = lineItems.data.some((item) => item.price?.id === product.stripePriceId);
  if (!hasExpectedPrice) throw Object.assign(new Error("Checkout session does not include the configured product price."), { statusCode: 400 });
  if (session.payment_status !== "paid") throw Object.assign(new Error("Checkout session is not paid."), { statusCode: 400 });

  const customerEmail = normalizeEmail(session.customer_details?.email || session.customer_email);
  if (!isValidEmail(customerEmail)) throw Object.assign(new Error("Checkout session is missing a valid customer email."), { statusCode: 400 });

  const emailHash = hashEmail(customerEmail);
  const purchaseRef = db.collection("digitalPurchases").doc(session.id);
  const eventRef = db.collection("stripeEvents").doc(event.id);
  const { token, tokenHash, expiresAt } = createDownloadToken(product.tokenTtlDays);
  const tokenRef = db.collection("downloadTokens").doc(tokenHash);
  let shouldSendEmail = false;

  await db.runTransaction(async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef);
    if (eventSnapshot.exists) return;

    transaction.create(eventRef, {
      type: event.type,
      stripeEventId: event.id,
      stripeCreatedAt: new Date(event.created * 1000),
      productId: product.productId,
      productSlug: product.slug,
      stripeSessionId: session.id,
      status: "processing",
      createdAt: serverTimestamp()
    });
    transaction.set(purchaseRef, {
      productId: product.productId,
      productSlug: product.slug,
      productName: product.name,
      fulfillmentPackageId: product.fulfillmentPackageId,
      fulfillmentVersion: product.fulfillmentVersion,
      status: "fulfilled",
      stripeSessionId: session.id,
      stripePaymentIntentId: safeString(session.payment_intent as string),
      stripeCustomerId: safeString(session.customer as string),
      stripePriceId: product.stripePriceId,
      amountTotal: session.amount_total || 0,
      currency: safeString(session.currency || "usd"),
      customerEmail,
      emailHash,
      latestTokenHash: tokenHash,
      tokenExpiresAt: expiresAt,
      fulfillmentEmailStatus: "pending",
      purchasedAt: new Date((session.created || event.created) * 1000),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    }, { merge: true });
    transaction.create(tokenRef, {
      productId: product.productId,
      productSlug: product.slug,
      purchaseId: purchaseRef.id,
      emailHash,
      tokenHash,
      expiresAt,
      revoked: false,
      downloadCount: 0,
      createdFrom: "stripe_webhook",
      createdAt: serverTimestamp()
    });
    transaction.set(eventRef, {
      status: "fulfilled",
      purchaseId: purchaseRef.id,
      tokenHash,
      processedAt: serverTimestamp()
    }, { merge: true });
    shouldSendEmail = true;
  });

  if (shouldSendEmail) {
    const emailResult = await sendDigitalProductAccessEmail(product, customerEmail, accessUrlForToken(product, token));
    await purchaseRef.set({
      fulfillmentEmailStatus: emailResult.status,
      resendEmailId: emailResult.resendEmailId || null,
      fulfillmentEmailError: emailResult.error || null,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await tokenRef.set({ emailStatus: emailResult.status, updatedAt: serverTimestamp() }, { merge: true });
  }

  res.json({ received: true, fulfilled: shouldSendEmail });
}));

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

apiApp.post("/digital-products/register-draft", asyncRoute(async (req, res) => {
  const actor = await requireAdminOrServiceSecret(req);
  const manifest = validateProductManifest(req.body?.manifest || req.body);
  const productId = safeString(manifest.productId);
  const productRef = db.collection("digitalProducts").doc(productId);
  const draft = productDraftFromManifest(manifest);
  await productRef.set(draft, { merge: true });
  await db.collection("productAssets").doc(`${productId}_primary`).set(assetRecordFromManifest(productId, `${productId}_primary`, manifest.primaryAsset, "abk"), { merge: true });
  if (safeString(manifest.valueEnhancer?.pathOrUrl)) {
    await db.collection("productAssets").doc(`${productId}_value_enhancer`).set(assetRecordFromManifest(productId, `${productId}_value_enhancer`, {
      name: manifest.valueEnhancer?.name || "value-enhancer",
      pathOrUrl: manifest.valueEnhancer?.pathOrUrl,
      type: manifest.valueEnhancer?.type || "other",
      format: manifest.valueEnhancer?.format || "other"
    }, "abk"), { merge: true });
  }
  const taskRef = db.collection("productTasks").doc(`${productId}_promise_review`);
  await taskRef.set({
    productId,
    taskId: taskRef.id,
    title: "Run Promise Review",
    workflow: "FD-POS - Promise Review",
    status: "OPEN",
    priority: "high",
    inputRefs: { productId, manifestAssetIds: [`${productId}_primary`, `${productId}_value_enhancer`] },
    outputRefs: {},
    error: null,
    createdBy: actor.uid === "fd-pos-service" ? "workflow" : "user",
    assignedTo: "manager-ai",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  res.json({ ok: true, productId, slug: draft.slug, status: draft.status, nextRequiredApproval: "promise-list" });
}));

apiApp.post("/digital-products/:slug/promise-review", asyncRoute(async (req, res) => {
  const actor = await requireAdminOrServiceSecret(req);
  const product = await getDigitalProductBySlug(safeString(req.params.slug));
  const explicitPromises = Array.isArray(req.body?.promises) ? req.body.promises : [];
  const sourceTexts = Array.isArray(req.body?.sourceTexts) ? req.body.sourceTexts : [];
  const extractedPromises = sourceTexts.flatMap((source: any) => {
    const sourceAssetId = safeString(source?.assetId || source?.sourceAssetId || `${product.productId}_source`);
    const sourceLocation = safeString(source?.sourceLocation || source?.pathOrUrl || "source-text");
    return extractPromiseCandidatesFromText(source?.text || "").map((text) => ({ text, sourceAssetId, sourceLocation }));
  });
  const promiseInputs = [...explicitPromises, ...extractedPromises].slice(0, 300);
  if (!promiseInputs.length) throw Object.assign(new Error("Promise Review requires promises or sourceTexts."), { statusCode: 400 });

  const seen = new Set<string>();
  const promises = promiseInputs
    .map((item, index) => promiseRecordFromInput(product, index, item, `${product.productId}_primary`))
    .filter((record): record is NonNullable<ReturnType<typeof promiseRecordFromInput>> => {
      if (!record) return false;
      const key = record.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!promises.length) throw Object.assign(new Error("No valid promise records were found."), { statusCode: 400 });

  const approvalRef = db.collection("productApprovals").doc(`${product.productId}_promise_list_${Date.now()}`);
  const batch = db.batch();
  promises.forEach((promise) => {
    batch.set(db.collection("productPromises").doc(promise.promiseId), promise, { merge: true });
  });
  const summary = {
    total: promises.length,
    needsAsset: promises.filter((item) => item.classification === "needs_asset").length,
    needsEvidence: promises.filter((item) => item.classification === "needs_evidence").length,
    rewrite: promises.filter((item) => item.classification === "rewrite").length,
    remove: promises.filter((item) => item.classification === "remove").length,
    moveToUpsell: promises.filter((item) => item.classification === "move_to_upsell").length,
    highRisk: promises.filter((item) => item.riskLevel === "high" || item.riskLevel === "blocked").length
  };
  batch.set(approvalRef, {
    productId: product.productId,
    approvalId: approvalRef.id,
    approvalType: "promise-list",
    status: "PENDING",
    summary,
    items: promises.map((item) => ({
      promiseId: item.promiseId,
      text: item.text,
      category: item.category,
      riskLevel: item.riskLevel,
      classification: item.classification,
      requiredAssetType: item.requiredAssetType
    })),
    reviewerNotes: "",
    createdAt: serverTimestamp(),
    decidedAt: null
  });
  batch.set(db.collection("digitalProducts").doc(product.id), {
    status: "PROMISE_APPROVAL_REQUIRED",
    approvalRequired: true,
    statusHistory: FieldValue.arrayUnion({ status: "PROMISE_APPROVAL_REQUIRED", updatedBy: actor.email || actor.uid, reason: "Promise Review created pending approval.", workflow: "FD-POS - Promise Review", updatedAt: new Date() }),
    updatedAt: serverTimestamp()
  }, { merge: true });
  batch.set(db.collection("productTasks").doc(`${product.productId}_promise_review`), {
    status: "WAITING_FOR_APPROVAL",
    outputRefs: { approvalId: approvalRef.id, promiseIds: promises.map((item) => item.promiseId) },
    assignedTo: "user",
    updatedAt: serverTimestamp()
  }, { merge: true });
  await batch.commit();
  res.json({ ok: true, productId: product.productId, slug: product.slug, approvalId: approvalRef.id, summary });
}));

apiApp.get("/digital-products/:slug/state", asyncRoute(async (req, res) => {
  await requireAdminOrServiceSecret(req);
  const product = await getDigitalProductBySlug(safeString(req.params.slug));
  const tasks = await db.collection("productTasks").where("productId", "==", product.productId).limit(50).get();
  const approvals = await db.collection("productApprovals").where("productId", "==", product.productId).limit(50).get();
  const promises = await db.collection("productPromises").where("productId", "==", product.productId).limit(300).get();
  res.json({
    product,
    tasks: tasks.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    approvals: approvals.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    promises: promises.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  });
}));

apiApp.get("/digital-products/:slug/approvals/:approvalId", asyncRoute(async (req, res) => {
  await requireAdminOrServiceSecret(req);
  const product = await getDigitalProductBySlug(safeString(req.params.slug));
  const approval = await db.collection("productApprovals").doc(safeString(req.params.approvalId)).get();
  if (!approval.exists || approval.get("productId") !== product.productId) throw Object.assign(new Error("Approval not found."), { statusCode: 404 });
  res.json({ approval: { id: approval.id, ...approval.data() } });
}));

apiApp.post("/digital-products/:slug/approvals/:approvalId/decide", asyncRoute(async (req, res) => {
  const actor = await requireAdminOrServiceSecret(req);
  const reviewer = actor.uid === "fd-pos-service" ? safeString(req.body?.reviewer) : safeString(actor.email || actor.uid);
  if (!reviewer) throw Object.assign(new Error("A named human reviewer is required."), { statusCode: 400 });
  const product = await getDigitalProductBySlug(safeString(req.params.slug));
  const approvalRef = db.collection("productApprovals").doc(safeString(req.params.approvalId));
  const approval = await approvalRef.get();
  if (!approval.exists || approval.get("productId") !== product.productId) throw Object.assign(new Error("Approval not found."), { statusCode: 404 });
  if (approval.get("approvalType") !== "promise-list") throw Object.assign(new Error("Only promise-list approvals can be decided by this endpoint."), { statusCode: 400 });
  if (approval.get("status") !== "PENDING") throw Object.assign(new Error("Approval has already been decided."), { statusCode: 409 });

  const status = safeString(req.body?.status || "CHANGES_REQUESTED");
  if (!["APPROVED", "REJECTED", "CHANGES_REQUESTED"].includes(status)) throw Object.assign(new Error("Invalid approval status."), { statusCode: 400 });
  const decisions: any[] = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
  const decisionByPromiseId = new Map<string, any>();
  decisions.forEach((item: any) => {
    const promiseId = safeString(item?.promiseId);
    if (promiseId) decisionByPromiseId.set(promiseId, item);
  });
  const approvalItems = Array.isArray(approval.get("items")) ? approval.get("items") : [];
  const itemPromiseIds = approvalItems.map((item: any) => safeString(item?.promiseId)).filter(Boolean);
  const batch = db.batch();

  itemPromiseIds.forEach((promiseId: string) => {
    const decision: any = decisionByPromiseId.get(promiseId) || {};
    const approvalStatus = safeString(decision.approvalStatus || (status === "APPROVED" ? "APPROVED" : status === "REJECTED" ? "REJECTED" : "REWRITE_REQUIRED"));
    if (!["PENDING", "APPROVED", "REJECTED", "REWRITE_REQUIRED"].includes(approvalStatus)) throw Object.assign(new Error(`Invalid promise approval status for ${promiseId}.`), { statusCode: 400 });
    const classification = safeString(decision.classification);
    const update: Record<string, unknown> = {
      approvalStatus,
      approvedBy: reviewer,
      updatedAt: serverTimestamp()
    };
    if (PROMISE_CLASSIFICATIONS.has(classification)) update.classification = classification;
    if (Array.isArray(decision.linkedAssetIds)) update.linkedAssetIds = decision.linkedAssetIds.map((id: unknown) => safeString(id)).filter(Boolean);
    if (typeof decision.notes === "string") update.notes = safeLongString(decision.notes, "", 2000);
    batch.set(db.collection("productPromises").doc(promiseId), update, { merge: true });
  });

  const nextStatus = status === "APPROVED" ? "SUPPORTING_ASSETS_GENERATING" : status === "REJECTED" ? "BLOCKED" : "SOURCE_REVIEW";
  batch.set(approvalRef, {
    status,
    reviewerNotes: safeLongString(req.body?.reviewerNotes || "", "", 5000),
    decidedBy: reviewer,
    decidedAt: serverTimestamp()
  }, { merge: true });
  batch.set(db.collection("digitalProducts").doc(product.id), {
    status: nextStatus,
    approvalRequired: status !== "APPROVED",
    statusHistory: FieldValue.arrayUnion({ status: nextStatus, updatedBy: reviewer, reason: `Promise list ${status.toLowerCase().replace(/_/g, " ")}.`, workflow: "promise-list approval", updatedAt: new Date() }),
    updatedAt: serverTimestamp()
  }, { merge: true });
  batch.set(db.collection("productTasks").doc(`${product.productId}_promise_review`), {
    status: status === "APPROVED" ? "DONE" : "BLOCKED",
    updatedAt: serverTimestamp()
  }, { merge: true });
  if (status === "APPROVED") {
    const assetTaskRef = db.collection("productTasks").doc(`${product.productId}_asset_builder`);
    batch.set(assetTaskRef, {
      productId: product.productId,
      taskId: assetTaskRef.id,
      title: "Generate Approved Supporting Assets",
      workflow: "FD-POS - Asset Builder",
      status: "OPEN",
      priority: "high",
      inputRefs: { approvalId: approvalRef.id, promiseIds: itemPromiseIds },
      outputRefs: {},
      error: null,
      createdBy: "system",
      assignedTo: "workflow-name",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
  res.json({ ok: true, productId: product.productId, slug: product.slug, approvalId: approvalRef.id, status, nextStatus });
}));

apiApp.get("/digital-products/:slug/asset-builder/work", asyncRoute(async (req, res) => {
  await requireAdminOrServiceSecret(req);
  const product = await getDigitalProductBySlug(safeString(req.params.slug));
  if (product.status !== "SUPPORTING_ASSETS_GENERATING") {
    throw Object.assign(new Error("Product is not approved for supporting asset generation."), { statusCode: 409 });
  }
  const promiseSnapshot = await db.collection("productPromises").where("productId", "==", product.productId).limit(300).get();
  const assetSnapshot = await db.collection("productAssets").where("productId", "==", product.productId).limit(300).get();
  const assets = assetSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any));
  const linkedAssetIds = new Set(assets.map((asset) => safeString(asset.assetId || asset.id)));
  const workItems = promiseSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as any))
    .filter((promise) => promise.approvalStatus === "APPROVED")
    .filter((promise) => promise.classification === "needs_asset" || (promise.classification === "keep" && safeString(promise.requiredAssetType)))
    .filter((promise) => !Array.isArray(promise.linkedAssetIds) || !promise.linkedAssetIds.some((assetId: unknown) => linkedAssetIds.has(safeString(assetId))))
    .map((promise) => ({
      promiseId: safeString(promise.promiseId || promise.id),
      text: safeLongString(promise.text, "", 2000),
      category: safeString(promise.category),
      requiredAssetType: safeString(promise.requiredAssetType || "other"),
      notes: safeLongString(promise.notes, "", 2000),
      sourceAssetId: safeString(promise.sourceAssetId),
      approvedImplementationPaths: ["paper", "spreadsheet", "Livestock Tracker app optional"]
    }));
  res.json({
    product: {
      productId: product.productId,
      slug: product.slug,
      name: product.name,
      sourceFolder: product.sourceFolder,
      status: product.status
    },
    workItems,
    constraints: {
      generateOnlyApprovedPromises: true,
      appIsOptional: true,
      noUnsupportedAppFeatures: true,
      outputFolder: `${product.sourceFolder.replace(/\/$/, "")}/supporting-assets`
    }
  });
}));

apiApp.post("/digital-products/:slug/assets/register", asyncRoute(async (req, res) => {
  await requireAdminOrServiceSecret(req);
  const product = await getDigitalProductBySlug(safeString(req.params.slug));
  if (product.status !== "SUPPORTING_ASSETS_GENERATING") {
    throw Object.assign(new Error("Product is not approved for supporting asset generation."), { statusCode: 409 });
  }
  const promiseId = safeString(req.body?.promiseId);
  const promise = promiseId ? await db.collection("productPromises").doc(promiseId).get() : null;
  if (!promise?.exists || promise.get("productId") !== product.productId || promise.get("approvalStatus") !== "APPROVED") {
    throw Object.assign(new Error("Asset registration requires an approved product promise."), { statusCode: 409 });
  }
  if (!["needs_asset", "keep"].includes(safeString(promise.get("classification")))) {
    throw Object.assign(new Error("Promise classification does not permit asset generation."), { statusCode: 409 });
  }

  const assetInput = req.body?.asset || {};
  const assetId = safeString(assetInput.assetId || `${product.productId}_${slugify(safeString(assetInput.name || promiseId))}`);
  const pathOrUrl = safeLongString(assetInput.pathOrUrl, "", 4000);
  const normalizedSourceFolder = product.sourceFolder.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedPath = pathOrUrl.replace(/\\/g, "/");
  if (!assetId || !pathOrUrl) throw Object.assign(new Error("assetId and pathOrUrl are required."), { statusCode: 400 });
  if (!/^https:\/\//i.test(normalizedPath) && !normalizedPath.startsWith(`${normalizedSourceFolder}/`)) {
    throw Object.assign(new Error("Generated asset must be stored under the product source folder or at an HTTPS URL."), { statusCode: 400 });
  }
  const type = safeString(assetInput.type || promise.get("requiredAssetType") || "other");
  const format = safeString(assetInput.format || "md");
  if (!ASSET_TYPES.has(type)) throw Object.assign(new Error("Invalid asset type."), { statusCode: 400 });
  if (!ASSET_FORMATS.has(format)) throw Object.assign(new Error("Invalid asset format."), { statusCode: 400 });

  const assetRef = db.collection("productAssets").doc(assetId);
  const batch = db.batch();
  batch.set(assetRef, {
    productId: product.productId,
    assetId,
    name: safeString(assetInput.name || promise.get("text") || assetId),
    type,
    format,
    pathOrUrl,
    source: "perc",
    status: "NEEDS_REVIEW",
    qualityReview: null,
    sourcePromiseIds: [promiseId],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  batch.set(promise.ref, { linkedAssetIds: FieldValue.arrayUnion(assetId), updatedAt: serverTimestamp() }, { merge: true });
  batch.set(db.collection("productTasks").doc(`${product.productId}_asset_builder`), {
    status: "RUNNING",
    registeredAssetIds: FieldValue.arrayUnion(assetId),
    updatedAt: serverTimestamp()
  }, { merge: true });
  await batch.commit();
  res.json({ ok: true, productId: product.productId, promiseId, assetId, status: "NEEDS_REVIEW" });
}));

apiApp.post("/digital-products/:slug/asset-builder/complete", asyncRoute(async (req, res) => {
  const actor = await requireAdminOrServiceSecret(req);
  const product = await getDigitalProductBySlug(safeString(req.params.slug));
  if (product.status !== "SUPPORTING_ASSETS_GENERATING") {
    throw Object.assign(new Error("Product is not in supporting asset generation."), { statusCode: 409 });
  }
  const promiseSnapshot = await db.collection("productPromises").where("productId", "==", product.productId).limit(300).get();
  const requiredPromises = promiseSnapshot.docs.filter((doc) => doc.get("approvalStatus") === "APPROVED" && ["needs_asset", "keep"].includes(safeString(doc.get("classification"))) && (doc.get("classification") === "needs_asset" || safeString(doc.get("requiredAssetType"))));
  const missingPromiseIds = requiredPromises.filter((doc) => !Array.isArray(doc.get("linkedAssetIds")) || !doc.get("linkedAssetIds").length).map((doc) => safeString(doc.get("promiseId") || doc.id));
  if (missingPromiseIds.length) {
    throw Object.assign(new Error(`Approved promises are missing assets: ${missingPromiseIds.join(", ")}.`), { statusCode: 409 });
  }
  const includedAssetIds = Array.from(new Set(requiredPromises.flatMap((doc) => doc.get("linkedAssetIds") || []).map((id) => safeString(id)).filter(Boolean)));
  const assets = await Promise.all(includedAssetIds.map((assetId) => db.collection("productAssets").doc(assetId).get()));
  const unavailableAssetIds = assets.filter((asset) => !asset.exists || ["MISSING", "REJECTED"].includes(safeString(asset.get("status")))).map((asset) => asset.id);
  if (unavailableAssetIds.length) throw Object.assign(new Error(`Registered assets are unavailable: ${unavailableAssetIds.join(", ")}.`), { statusCode: 409 });

  const approvalRef = db.collection("productApprovals").doc(`${product.productId}_asset_quality_${Date.now()}`);
  const batch = db.batch();
  batch.set(approvalRef, {
    productId: product.productId,
    approvalId: approvalRef.id,
    approvalType: "asset-quality",
    status: "PENDING",
    summary: { total: includedAssetIds.length },
    items: assets.map((asset) => ({ assetId: asset.id, name: safeString(asset.get("name")), type: safeString(asset.get("type")), format: safeString(asset.get("format")), pathOrUrl: safeLongString(asset.get("pathOrUrl"), "", 4000) })),
    reviewerNotes: "",
    createdAt: serverTimestamp(),
    decidedAt: null
  });
  batch.set(db.collection("digitalProducts").doc(product.id), {
    status: "SUPPORTING_ASSETS_REVIEW",
    approvalRequired: true,
    statusHistory: FieldValue.arrayUnion({ status: "SUPPORTING_ASSETS_REVIEW", updatedBy: actor.email || actor.uid, reason: "Approved supporting assets registered and ready for quality review.", workflow: "FD-POS - Asset Builder", updatedAt: new Date() }),
    updatedAt: serverTimestamp()
  }, { merge: true });
  batch.set(db.collection("productTasks").doc(`${product.productId}_asset_builder`), {
    status: "WAITING_FOR_APPROVAL",
    outputRefs: { assetIds: includedAssetIds, approvalId: approvalRef.id },
    updatedAt: serverTimestamp()
  }, { merge: true });
  await batch.commit();
  res.json({ ok: true, productId: product.productId, status: "SUPPORTING_ASSETS_REVIEW", approvalId: approvalRef.id, assetIds: includedAssetIds });
}));

apiApp.post("/digital-products/:slug/create-stripe-product", asyncRoute(async (req, res) => {
  const actor = await requireAdmin(req);
  const product = await getDigitalProductBySlug(safeString(req.params.slug));
  if (product.status !== "PACKAGE_READY" && product.status !== "SALES_PAGE_DRAFT" && product.status !== "STRIPE_DRAFT") {
    throw Object.assign(new Error("Product must be package-ready or sales-page-draft before Stripe creation."), { statusCode: 409 });
  }
  if (!product.salesPagePath) throw Object.assign(new Error("Sales page path is required before Stripe creation."), { statusCode: 409 });
  const stripe = stripeClient();
  const stripeProduct = product.stripeProductId ? await stripe.products.retrieve(product.stripeProductId) : await stripe.products.create({
    name: product.name,
    metadata: {
      product_slug: product.slug,
      product_id: product.productId,
      package_version: product.fulfillmentVersion,
      environment: process.env.FUNCTIONS_EMULATOR === "true" ? "emulator" : "production"
    }
  });
  const price = product.stripePriceId ? await stripe.prices.retrieve(product.stripePriceId) : await stripe.prices.create({
    product: stripeProduct.id,
    unit_amount: product.priceCents,
    currency: product.currency,
    metadata: {
      product_slug: product.slug,
      product_id: product.productId,
      package_version: product.fulfillmentVersion,
      environment: process.env.FUNCTIONS_EMULATOR === "true" ? "emulator" : "production"
    }
  });
  await db.collection("digitalProducts").doc(product.id).set({
    stripeProductId: stripeProduct.id,
    stripePriceId: price.id,
    status: "STRIPE_READY",
    statusHistory: FieldValue.arrayUnion({ status: "STRIPE_READY", updatedBy: actor.email || actor.uid, reason: "Stripe Product and Price created.", workflow: "create-stripe-product", updatedAt: new Date() }),
    updatedAt: serverTimestamp()
  }, { merge: true });
  res.json({ ok: true, productId: product.productId, slug: product.slug, stripeProductId: stripeProduct.id, stripePriceId: price.id });
}));

async function createCheckoutSessionForSlug(slug: string) {
  const stripe = stripeClient();
  const product = await getDigitalProductBySlug(slug);
  assertCheckoutEnabled(product);
  const salesPath = product.salesPagePath || `/digital-products/${product.slug}`;
  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: product.stripePriceId, quantity: 1 }],
    success_url: `${SITE_URL}${salesPath.startsWith("/") ? salesPath : `/${salesPath}`}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}${salesPath.startsWith("/") ? salesPath : `/${salesPath}`}?checkout=cancelled`,
    allow_promotion_codes: true,
    metadata: {
      product_slug: product.slug,
      product_id: product.productId,
      package_version: product.fulfillmentVersion,
      environment: process.env.FUNCTIONS_EMULATOR === "true" ? "emulator" : "production"
    },
    payment_intent_data: {
      metadata: {
        product_slug: product.slug,
        product_id: product.productId,
        package_version: product.fulfillmentVersion,
        environment: process.env.FUNCTIONS_EMULATOR === "true" ? "emulator" : "production"
      }
    }
  });
}

apiApp.post("/digital-products/:slug/create-checkout-session", asyncRoute(async (req, res) => {
  const session = await createCheckoutSessionForSlug(safeString(req.params.slug));
  res.json({ sessionId: session.id, url: session.url });
}));

apiApp.post("/chore-tracker/create-checkout-session", asyncRoute(async (_req, res) => {
  const session = await createCheckoutSessionForSlug(CHORE_TRACKER_PRODUCT_SLUG);
  res.json({ sessionId: session.id, url: session.url });
}));

apiApp.get("/digital-products/:slug/purchase-status", asyncRoute(async (req, res) => {
  const slug = safeString(req.params.slug);
  const sessionId = safeString(req.query.session_id);
  if (!sessionId) throw Object.assign(new Error("Checkout session is required."), { statusCode: 400 });
  const purchase = await db.collection("digitalPurchases").doc(sessionId).get();
  if (purchase.exists && purchase.get("productSlug") === slug) {
    res.json({
      status: safeString(purchase.get("status"), "fulfilled"),
      emailStatus: safeString(purchase.get("fulfillmentEmailStatus"), "pending"),
      productSlug: slug
    });
    return;
  }

  try {
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.json({
      status: session.payment_status === "paid" ? "paid_pending_fulfillment" : "pending",
      emailStatus: "pending",
      productSlug: session.metadata?.product_slug || ""
    });
  } catch {
    res.json({ status: "pending", emailStatus: "pending", productSlug: "" });
  }
}));

apiApp.get("/chore-tracker/purchase-status", asyncRoute(async (req, res) => {
  req.params.slug = CHORE_TRACKER_PRODUCT_SLUG;
  const sessionId = safeString(req.query.session_id);
  if (!sessionId) throw Object.assign(new Error("Checkout session is required."), { statusCode: 400 });
  const purchase = await db.collection("digitalPurchases").doc(sessionId).get();
  res.json({
    status: purchase.exists && purchase.get("productSlug") === CHORE_TRACKER_PRODUCT_SLUG ? safeString(purchase.get("status"), "fulfilled") : "pending",
    emailStatus: purchase.exists ? safeString(purchase.get("fulfillmentEmailStatus"), "pending") : "pending",
    productSlug: purchase.exists ? safeString(purchase.get("productSlug")) : ""
  });
}));

apiApp.post("/digital-products/:slug/recover-access", asyncRoute(async (req, res) => {
  const product = await getDigitalProductBySlug(safeString(req.params.slug));
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    res.json({ ok: true });
    return;
  }

  const emailHash = hashEmail(email);
  const purchases = await db.collection("digitalPurchases").where("emailHash", "==", emailHash).limit(10).get();
  const purchase = purchases.docs.find((doc) => doc.get("productSlug") === product.slug && doc.get("status") === "fulfilled");
  if (purchase) {
    const { token, tokenHash, expiresAt } = createDownloadToken(product.tokenTtlDays);
    const tokenRef = db.collection("downloadTokens").doc(tokenHash);
    await tokenRef.create({
      productId: product.productId,
      productSlug: product.slug,
      purchaseId: purchase.id,
      emailHash,
      tokenHash,
      expiresAt,
      revoked: false,
      downloadCount: 0,
      createdFrom: "access_recovery",
      createdAt: serverTimestamp()
    });
    const emailResult = await sendDigitalProductAccessEmail(product, email, accessUrlForToken(product, token));
    await purchase.ref.set({
      latestTokenHash: tokenHash,
      tokenExpiresAt: expiresAt,
      recoveryEmailStatus: emailResult.status,
      lastRecoveryRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    await tokenRef.set({ emailStatus: emailResult.status, updatedAt: serverTimestamp() }, { merge: true });
  }

  res.json({ ok: true });
}));

apiApp.post("/chore-tracker/recover-access", asyncRoute(async (req, res) => {
  req.params.slug = CHORE_TRACKER_PRODUCT_SLUG;
  const product = await getDigitalProductBySlug(CHORE_TRACKER_PRODUCT_SLUG);
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    res.json({ ok: true });
    return;
  }
  const emailHash = hashEmail(email);
  const purchases = await db.collection("digitalPurchases").where("emailHash", "==", emailHash).limit(10).get();
  const purchase = purchases.docs.find((doc) => doc.get("productSlug") === product.slug && doc.get("status") === "fulfilled");
  if (purchase) {
    const { token, tokenHash, expiresAt } = createDownloadToken(product.tokenTtlDays);
    const tokenRef = db.collection("downloadTokens").doc(tokenHash);
    await tokenRef.create({ productId: product.productId, productSlug: product.slug, purchaseId: purchase.id, emailHash, tokenHash, expiresAt, revoked: false, downloadCount: 0, createdFrom: "access_recovery", createdAt: serverTimestamp() });
    const emailResult = await sendDigitalProductAccessEmail(product, email, accessUrlForToken(product, token));
    await purchase.ref.set({ latestTokenHash: tokenHash, tokenExpiresAt: expiresAt, recoveryEmailStatus: emailResult.status, lastRecoveryRequestedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await tokenRef.set({ emailStatus: emailResult.status, updatedAt: serverTimestamp() }, { merge: true });
  }
  res.json({ ok: true });
}));

apiApp.get("/digital-products/download", asyncRoute(async (req, res) => {
  const token = safeString(req.query.token, "");
  if (!token || token.length < 32) throw Object.assign(new Error("Invalid or expired access link."), { statusCode: 403 });
  const tokenHash = hashDownloadToken(token);
  const tokenRef = db.collection("downloadTokens").doc(tokenHash);
  const tokenSnapshot = await tokenRef.get();
  const expiresAt = firestoreDate(tokenSnapshot.get("expiresAt"));
  if (!tokenSnapshot.exists || tokenSnapshot.get("revoked") === true || !expiresAt || expiresAt.getTime() < Date.now()) {
    throw Object.assign(new Error("Invalid or expired access link."), { statusCode: 403 });
  }
  const product = await getDigitalProductBySlug(safeString(tokenSnapshot.get("productSlug")));

  const purchaseId = safeString(tokenSnapshot.get("purchaseId"));
  const purchase = purchaseId ? await db.collection("digitalPurchases").doc(purchaseId).get() : null;
  if (!purchase?.exists || purchase.get("status") !== "fulfilled" || purchase.get("productSlug") !== product.slug) throw Object.assign(new Error("Purchase is not eligible for download."), { statusCode: 403 });

  const fileKey = safeString(req.query.file, "screen");
  const productFile = privateProductFile(product, fileKey);
  if (!productFile || !fs.existsSync(productFile.filePath)) throw Object.assign(new Error("Product file is unavailable."), { statusCode: 503 });

  await tokenRef.set({ downloadCount: FieldValue.increment(1), lastUsedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  res.set("cache-control", "private, no-store");
  res.download(productFile.filePath, productFile.downloadName);
}));

apiApp.get("/chore-tracker/download", asyncRoute(async (req, res) => {
  const token = safeString(req.query.token, "");
  if (!token || token.length < 32) throw Object.assign(new Error("Invalid or expired access link."), { statusCode: 403 });
  const tokenSnapshot = await db.collection("downloadTokens").doc(hashDownloadToken(token)).get();
  if (!tokenSnapshot.exists || tokenSnapshot.get("productSlug") !== CHORE_TRACKER_PRODUCT_SLUG) throw Object.assign(new Error("Invalid or expired access link."), { statusCode: 403 });
  req.url = `/digital-products/download?token=${encodeURIComponent(token)}&file=${encodeURIComponent(safeString(req.query.file, "screen"))}`;
  const product = await getDigitalProductBySlug(CHORE_TRACKER_PRODUCT_SLUG);
  const expiresAt = firestoreDate(tokenSnapshot.get("expiresAt"));
  if (tokenSnapshot.get("revoked") === true || !expiresAt || expiresAt.getTime() < Date.now()) throw Object.assign(new Error("Invalid or expired access link."), { statusCode: 403 });
  const purchaseId = safeString(tokenSnapshot.get("purchaseId"));
  const purchase = purchaseId ? await db.collection("digitalPurchases").doc(purchaseId).get() : null;
  if (!purchase?.exists || purchase.get("status") !== "fulfilled") throw Object.assign(new Error("Purchase is not eligible for download."), { statusCode: 403 });
  const productFile = privateProductFile(product, safeString(req.query.file, "screen"));
  if (!productFile || !fs.existsSync(productFile.filePath)) throw Object.assign(new Error("Product file is unavailable."), { statusCode: 503 });
  await tokenSnapshot.ref.set({ downloadCount: FieldValue.increment(1), lastUsedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  res.set("cache-control", "private, no-store");
  res.download(productFile.filePath, productFile.downloadName);
}));

apiApp.post("/sites/:siteId/create-checkout-session", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  res.status(501).json({ error: "Stripe Checkout is intentionally disabled until product and price decisions are finalized.", siteId: req.params.siteId });
}));

export const api = onRequest({ region: REGION, timeoutSeconds: 120, memory: "512MiB", secrets: [openAiApiKey, stripeSecretKey, stripeWebhookSecret, stripePriceChoreTracker, fdPosServiceSecret, resendApiKey] }, apiApp);

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
