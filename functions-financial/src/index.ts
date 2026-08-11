import { initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import cors from "cors";
import express from "express";

initializeApp();

const REGION = "us-central1";

const openAiApiKey = defineSecret("OPENAI_API_KEY");

const FINANCIAL_AI_MODEL = process.env.FINANCIAL_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-nano";
const FINANCIAL_AI_MAX_TRANSACTIONS = 100;
const FINANCIAL_INPUT_PRICE_PER_1M = Number(process.env.FINANCIAL_INPUT_PRICE_PER_1M || process.env.OPENAI_INPUT_PRICE_PER_1M || 0.20);
const FINANCIAL_OUTPUT_PRICE_PER_1M = Number(process.env.FINANCIAL_OUTPUT_PRICE_PER_1M || process.env.OPENAI_OUTPUT_PRICE_PER_1M || 1.25);
const FINANCIAL_WEB_SEARCH_PRICE_PER_1K = Number(process.env.FINANCIAL_WEB_SEARCH_PRICE_PER_1K || process.env.OPENAI_WEB_SEARCH_PRICE_PER_1K || 10);
// This function hosts only the private Fennington family financial app. Restrict
// use of the paid AI categorization endpoint to these two accounts until a
// broader access model is needed.
const FINANCIAL_ALLOWED_EMAILS = (process.env.FINANCIAL_ALLOWED_EMAILS || "cfennington2@gmail.com,alainafennington@gmail.com")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

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

function safeString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 600);
}

function safeLongString(value: unknown, fallback = "", maxLength = 12000): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

async function requireUser(req: express.Request): Promise<DecodedIdToken> {
  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw Object.assign(new Error("Missing bearer token."), { statusCode: 401 });
  return getAuth().verifyIdToken(match[1]);
}

async function requireFinancialUser(req: express.Request): Promise<DecodedIdToken> {
  const decoded = await requireUser(req);
  const email = safeString(decoded.email).toLowerCase();
  if (!email || !FINANCIAL_ALLOWED_EMAILS.includes(email)) {
    throw Object.assign(new Error("This app is private. Access is restricted to authorized accounts."), { statusCode: 403 });
  }
  return decoded;
}

function processorVendorFromDescription(description: string): string {
  const paypal = safeString(description).match(/\bPAYPAL\s+\*([A-Z0-9][A-Z0-9&.'-]{1,})/i);
  if (!paypal?.[1]) return "";
  const compact = safeString(paypal[1]).replace(/(LIMITED|LIMIT|LLC|INC|CORP)$/i, "").trim();
  if (/^[A-Z]{2,6}LABS$/i.test(compact)) return compact.replace(/LABS$/i, "Labs");
  return compact.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
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

const financialApiApp = express();
financialApiApp.use(cors({ origin: true }));
financialApiApp.use((req, _res, next) => {
  if (req.url === "/api") req.url = "/";
  else if (req.url.startsWith("/api/")) req.url = req.url.slice(4);
  next();
});
financialApiApp.use(express.json({ limit: "1mb" }));

financialApiApp.post("/financial/categorize", asyncRoute(async (req, res) => {
  const user = await requireFinancialUser(req);
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

export const financialApi = onRequest({ region: REGION, timeoutSeconds: 120, memory: "512MiB", secrets: [openAiApiKey] }, financialApiApp);
