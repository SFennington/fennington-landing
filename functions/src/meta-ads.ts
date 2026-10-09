// Uploading Ad Studio concepts to Meta as paused ads. Kept out of index.ts so the
// parts that decide what reaches Meta can be tested without Firestore or a network.
//
// Guardrails live here rather than in the route, so no caller can get around them:
// only images, creatives and ads can be created, and an ad can only be created
// PAUSED. Campaigns, ad sets and budgets are never written; the owner creates those
// once in Ads Manager and presses Start on each ad by hand.

export const META_GRAPH_VERSION = "v21.0";

// Same shape the insights sync matches ad names against, anchored at both ends.
export const TRACKING_CODE_PATTERN = /^[A-Z]{2,6}-A\d{1,2}$/;

const CTA_TYPES: Record<string, string> = {
  "shop now": "SHOP_NOW",
  "learn more": "LEARN_MORE",
  "get offer": "GET_OFFER",
  "sign up": "SIGN_UP"
};

// Meta rejects images over 30MB; a 1080x1080 creative is nowhere near, so anything
// this large is a wrong file rather than a big image.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const WRITABLE_EDGES = new Set(["adimages", "adcreatives", "ads"]);

export type AdConcept = {
  trackingCode: string;
  angle: string;
  primaryText: string;
  headline: string;
  description: string;
  ctaType: string;
  imageBase64: string;
};

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function text(value: unknown, field: string, max: number, required = true): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (required && !s) throw badRequest(`${field} is required.`);
  if (s.length > max) throw badRequest(`${field} must be ${max} characters or fewer.`);
  return s;
}

export function parseAdConcept(raw: any): AdConcept {
  const trackingCode = text(raw?.trackingCode, "trackingCode", 12).toUpperCase();
  if (!TRACKING_CODE_PATTERN.test(trackingCode)) throw badRequest(`trackingCode "${trackingCode}" is not a tracking code like HCC-A1.`);

  const cta = text(raw?.cta, `${trackingCode} cta`, 20).toLowerCase();
  const ctaType = CTA_TYPES[cta];
  if (!ctaType) throw badRequest(`${trackingCode} cta must be one of: Shop Now, Learn More, Get Offer, Sign Up.`);

  const imageBase64 = typeof raw?.imageBase64 === "string" ? raw.imageBase64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "") : "";
  if (!imageBase64 || !/^[A-Za-z0-9+/]+=*$/.test(imageBase64)) throw badRequest(`${trackingCode} imageBase64 is missing or not base64.`);
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length > MAX_IMAGE_BYTES) throw badRequest(`${trackingCode} image is larger than 8MB.`);
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPng && !isJpeg) throw badRequest(`${trackingCode} image must be a PNG or JPEG.`);

  return {
    trackingCode,
    angle: text(raw?.angle, `${trackingCode} angle`, 80, false),
    primaryText: text(raw?.primaryText, `${trackingCode} primaryText`, 2000),
    headline: text(raw?.headline, `${trackingCode} headline`, 255),
    description: text(raw?.description, `${trackingCode} description`, 255, false),
    ctaType,
    imageBase64
  };
}

// The insights sync attributes spend by this prefix, so the code goes first.
export function metaAdName(concept: Pick<AdConcept, "trackingCode" | "angle">): string {
  return `${concept.trackingCode} ${concept.angle || "concept"}`.trim().slice(0, 200);
}

// utm_content carries the tracking code to the sales page, which is what lets a
// sale be tied back to the ad that produced it.
export function adLandingUrl(siteUrl: string, salesPagePath: string, productSlug: string, trackingCode: string): string {
  const path = salesPagePath.startsWith("/") ? salesPagePath : `/${salesPagePath}`;
  const url = new URL(`${siteUrl.replace(/\/$/, "")}${path}`);
  url.searchParams.set("utm_source", "facebook");
  url.searchParams.set("utm_medium", "paid_social");
  url.searchParams.set("utm_campaign", productSlug);
  url.searchParams.set("utm_content", trackingCode);
  return url.toString();
}

export function creativeParams(concept: AdConcept, pageId: string, imageHash: string, link: string): Record<string, unknown> {
  return {
    name: metaAdName(concept),
    object_story_spec: {
      page_id: pageId,
      link_data: {
        image_hash: imageHash,
        link,
        message: concept.primaryText,
        name: concept.headline,
        ...(concept.description ? { description: concept.description } : {}),
        call_to_action: { type: concept.ctaType, value: { link } }
      }
    }
  };
}

export function adParams(concept: AdConcept, adSetId: string, creativeId: string): Record<string, unknown> {
  return {
    name: metaAdName(concept),
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status: "PAUSED"
  };
}

export function normalizeAdAccountId(value: string): string {
  const id = value.trim().replace(/^act_/, "");
  return /^\d+$/.test(id) ? `act_${id}` : "";
}

// The single write path to Meta. Everything above builds parameters; this is where
// the guardrails are enforced, so a future caller cannot skip them.
export async function metaGraphPost(
  accountId: string,
  edge: string,
  params: Record<string, unknown>,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<any> {
  if (!/^act_\d+$/.test(accountId)) throw new Error("Meta ad account id is invalid.");
  if (!WRITABLE_EDGES.has(edge)) throw new Error(`Refusing to write Meta ${edge}: only images, creatives and ads are allowed.`);
  if (edge === "ads" && params.status !== "PAUSED") throw new Error("Refusing to create a Meta ad that is not PAUSED.");
  if ("daily_budget" in params || "lifetime_budget" in params || "bid_amount" in params) throw new Error("Refusing to set a budget or bid.");

  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    form.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return graphFormPost(`${accountId}/${edge}`, form, token, fetchImpl, edge);
}

// The only change ever made to an existing ad: set it to PAUSED. Pausing can only
// lower spend, so it is the one edit allowed; starting an ad stays with the owner.
export async function metaPauseAd(adId: string, token: string, fetchImpl: typeof fetch = fetch): Promise<any> {
  if (!/^\d+$/.test(adId)) throw new Error("Meta ad id is invalid.");
  return graphFormPost(adId, new URLSearchParams({ status: "PAUSED" }), token, fetchImpl, "pause");
}

async function graphFormPost(path: string, form: URLSearchParams, token: string, fetchImpl: typeof fetch, label: string): Promise<any> {
  // Token in the header, never the URL, so it cannot end up in an error message.
  const response = await fetchImpl(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) {
    const reason = [body?.error?.message, body?.error?.error_user_msg].filter(Boolean).join(" - ") || `Meta returned ${response.status}.`;
    throw Object.assign(new Error(`Meta ${label} request failed: ${reason}`), { statusCode: 502 });
  }
  return body;
}

export type AdPerformanceRow = {
  trackingCode: string;
  impressions?: number;
  clicks?: number;
  linkClicks?: number;
  spend?: number;
  purchases?: number;
  ctr?: number;
};

export type RankedAd = {
  trackingCode: string;
  impressions: number;
  clicks: number;
  linkClicks: number;
  spend: number;
  ctr: number;
  costPerClick: number | null;
  costPerLinkClick: number | null;
  sales: number;
  revenue: number;
  costPerSale: number | null;
  enoughData: boolean;
};

// Below this an ad has not been shown enough to judge. Roughly a week at $5/day
// split three ways, or enough clicks that a click-rate gap means something.
const MIN_SPEND_TO_JUDGE = 10;
const MIN_CLICKS_TO_JUDGE = 20;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Sales are counted from Stripe, by the tracking code checkout stored with the
// order, not from Meta's pixel, which can miss or double-count. Meta purchases are
// only a fallback for ads with no recorded sale. With no sales anywhere (the usual
// case at a small budget), cheaper clicks win, then the higher click rate.
export function rankAds(rows: AdPerformanceRow[], sales: Map<string, { count: number; revenueCents: number }>): RankedAd[] {
  const ranked = rows.map((row) => {
    const clicks = Number(row.clicks) || 0;
    const linkClicks = Number(row.linkClicks) || 0;
    const spend = Number(row.spend) || 0;
    const sale = sales.get(row.trackingCode);
    const salesCount = sale ? sale.count : Number(row.purchases) || 0;
    return {
      trackingCode: row.trackingCode,
      impressions: Number(row.impressions) || 0,
      clicks,
      linkClicks,
      spend: round2(spend),
      ctr: Number(row.ctr) || 0,
      costPerClick: clicks > 0 ? round2(spend / clicks) : null,
      costPerLinkClick: linkClicks > 0 ? round2(spend / linkClicks) : null,
      sales: salesCount,
      revenue: sale ? round2(sale.revenueCents / 100) : 0,
      costPerSale: salesCount > 0 ? round2(spend / salesCount) : null,
      enoughData: spend >= MIN_SPEND_TO_JUDGE || clicks >= MIN_CLICKS_TO_JUDGE
    };
  });
  const cpc = (ad: RankedAd) => (ad.costPerClick === null ? Number.POSITIVE_INFINITY : ad.costPerClick);
  return ranked.sort((a, b) =>
    b.sales - a.sales
    || (a.costPerSale ?? Infinity) - (b.costPerSale ?? Infinity)
    || cpc(a) - cpc(b)
    || b.ctr - a.ctr);
}

export function imageHashFrom(body: any): string {
  const images = body?.images && typeof body.images === "object" ? Object.values(body.images) : [];
  const hash = (images[0] as any)?.hash;
  if (typeof hash !== "string" || !hash) throw Object.assign(new Error("Meta did not return an image hash."), { statusCode: 502 });
  return hash;
}
