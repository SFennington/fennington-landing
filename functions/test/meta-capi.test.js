// Runs against the compiled output: `npm test` builds first.
const test = require("node:test");
const assert = require("node:assert/strict");
const capi = require("../lib/meta-capi.js");

const browser = { fbp: "fb.1.1712345678901.123456789", fbc: "fb.1.1712345678901.IwAR0abc-_xyz", ip: "203.0.113.7", userAgent: "Mozilla/5.0" };

const input = (overrides = {}) => ({
  sessionId: "cs_live_abc",
  productSlug: "homestead-command-center",
  amountTotal: 1700,
  currency: "usd",
  emailHash: "a".repeat(64),
  purchasedAt: 1760000000000,
  sourceUrl: "https://fennington.com/digital-products/homestead-command-center",
  browser,
  ...overrides
});

test("keeps well-formed browser ids and drops junk", () => {
  assert.deepEqual(capi.cleanBrowserIds(browser), browser);
  const cleaned = capi.cleanBrowserIds({ fbp: "<script>", fbc: "fb.1.abc.x", ip: "not an ip", userAgent: 42 });
  assert.deepEqual(cleaned, { fbp: "", fbc: "", ip: "", userAgent: "" });
  assert.equal(capi.cleanBrowserIds({ userAgent: "x".repeat(900) }).userAgent.length, 450);
});

test("takes the visitor's address from the first forwarded entry", () => {
  assert.equal(capi.clientIpFrom("203.0.113.7, 10.0.0.1", "10.0.0.2"), "203.0.113.7");
  assert.equal(capi.clientIpFrom(undefined, "10.0.0.2"), "10.0.0.2");
});

test("builds a Purchase whose event_id matches the browser pixel", () => {
  const event = capi.purchaseEventPayload(input()).data[0];
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.event_id, "purchase-cs_live_abc");
  assert.equal(event.event_time, 1760000000);
  assert.equal(event.action_source, "website");
  assert.deepEqual(event.custom_data, { value: 17, currency: "USD", content_ids: ["homestead-command-center"], content_type: "product" });
  assert.deepEqual(event.user_data, { em: ["a".repeat(64)], fbp: browser.fbp, fbc: browser.fbc, client_ip_address: "203.0.113.7", client_user_agent: "Mozilla/5.0" });
});

test("leaves out browser fields the buyer didn't have", () => {
  const event = capi.purchaseEventPayload(input({ browser: { fbp: "", fbc: "", ip: "", userAgent: "" } })).data[0];
  assert.deepEqual(event.user_data, { em: ["a".repeat(64)] });
});

test("posts to the pixel's events edge with the token in the header", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ events_received: 1 }) }; };
  const result = await capi.sendPurchaseEvent(input(), "secret-token", fetchImpl);
  assert.equal(result.eventsReceived, 1);
  assert.match(calls[0].url, /\/4207276016235953\/events$/);
  assert.ok(!calls[0].url.includes("secret-token"));
  assert.equal(calls[0].init.headers.authorization, "Bearer secret-token");
});

test("surfaces Meta's error message", async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid parameter" } }) });
  await assert.rejects(capi.sendPurchaseEvent(input(), "t", fetchImpl), /Invalid parameter/);
});
