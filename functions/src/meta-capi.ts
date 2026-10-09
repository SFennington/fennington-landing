// Server-side copy of the pixel's Purchase event (Meta's Conversions API). Kept out
// of index.ts so what reaches Meta can be tested without Firestore or a network.
//
// Only digital-product sales are ever sent: the webhook calls this after it has
// matched the session to a digital product, so Livestock Tracker subscriptions on
// the shared Stripe account never get here. The event_id matches the one the
// thank-you page gives the pixel, so Meta counts a sale seen by both only once.

import { META_GRAPH_VERSION } from "./meta-ads";

export const META_PIXEL_ID = "4207276016235953";

// What the browser told us at checkout, carried through Stripe metadata.
export type BrowserIds = { fbp: string; fbc: string; ip: string; userAgent: string };

// _fbp / _fbc cookies look like fb.1.1712345678901.abc... Anything else is dropped
// so a visitor can't push arbitrary text into Stripe or Meta.
const FB_COOKIE_PATTERN = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_\-.]{1,400}$/;

export function cleanBrowserIds(raw: any): BrowserIds {
  const fbp = typeof raw?.fbp === "string" && FB_COOKIE_PATTERN.test(raw.fbp.trim()) ? raw.fbp.trim() : "";
  const fbc = typeof raw?.fbc === "string" && FB_COOKIE_PATTERN.test(raw.fbc.trim()) ? raw.fbc.trim() : "";
  const ip = typeof raw?.ip === "string" && /^[0-9a-fA-F:.]{3,45}$/.test(raw.ip.trim()) ? raw.ip.trim() : "";
  const userAgent = typeof raw?.userAgent === "string" ? raw.userAgent.trim().slice(0, 450) : "";
  return { fbp, fbc, ip, userAgent };
}

// The visitor's address as Google's front end saw it (first x-forwarded-for entry).
export function clientIpFrom(forwardedFor: unknown, fallback: unknown): string {
  const first = typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : "";
  return first || (typeof fallback === "string" ? fallback : "");
}

export type PurchaseEventInput = {
  sessionId: string;
  productSlug: string;
  amountTotal: number;
  currency: string;
  emailHash: string;
  purchasedAt: number;
  sourceUrl: string;
  browser: BrowserIds;
};

export function purchaseEventId(sessionId: string): string {
  return `purchase-${sessionId}`;
}

export function purchaseEventPayload(input: PurchaseEventInput) {
  const userData: Record<string, unknown> = { em: [input.emailHash] };
  if (input.browser.fbp) userData.fbp = input.browser.fbp;
  if (input.browser.fbc) userData.fbc = input.browser.fbc;
  if (input.browser.ip) userData.client_ip_address = input.browser.ip;
  if (input.browser.userAgent) userData.client_user_agent = input.browser.userAgent;
  return {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(input.purchasedAt / 1000),
      event_id: purchaseEventId(input.sessionId),
      action_source: "website",
      event_source_url: input.sourceUrl,
      user_data: userData,
      custom_data: {
        value: (Number(input.amountTotal) || 0) / 100,
        currency: (input.currency || "usd").toUpperCase(),
        content_ids: [input.productSlug],
        content_type: "product"
      }
    }]
  };
}

export async function sendPurchaseEvent(input: PurchaseEventInput, token: string, fetchImpl: typeof fetch = fetch): Promise<{ eventsReceived: number }> {
  // Token in the header, never the URL, so it cannot end up in an error message.
  const response = await fetchImpl(`https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PIXEL_ID}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(purchaseEventPayload(input))
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) {
    const reason = [body?.error?.message, body?.error?.error_user_msg].filter(Boolean).join(" - ") || `Meta returned ${response.status}.`;
    throw new Error(`Meta Conversions API request failed: ${reason}`);
  }
  return { eventsReceived: Number(body?.events_received) || 0 };
}

