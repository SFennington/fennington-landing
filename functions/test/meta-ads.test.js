// Runs against the compiled output: `npm test` builds first.
const test = require("node:test");
const assert = require("node:assert/strict");
const meta = require("../lib/meta-ads.js");

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString("base64");

const concept = (overrides = {}) => ({
  trackingCode: "hcc-a4",
  angle: "Nothing gets forgotten",
  primaryText: "Every chore, feed run and vet date on one page.",
  headline: "Run the homestead from one binder",
  description: "Printable system",
  cta: "Shop Now",
  imageBase64: PNG,
  ...overrides
});

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, params: new URLSearchParams(init.body) });
    const body = responses.shift() || {};
    return { ok: !body.error, status: body.error ? 400 : 200, json: async () => body };
  };
  return { calls, impl };
}

test("parses a concept and maps the call to action", () => {
  const c = meta.parseAdConcept(concept());
  assert.equal(c.trackingCode, "HCC-A4");
  assert.equal(c.ctaType, "SHOP_NOW");
  assert.equal(meta.metaAdName(c), "HCC-A4 Nothing gets forgotten");
});

test("rejects bad tracking codes, calls to action and images", () => {
  assert.throws(() => meta.parseAdConcept(concept({ trackingCode: "HCC-4" })), /tracking code/);
  assert.throws(() => meta.parseAdConcept(concept({ cta: "Buy Now" })), /cta must be one of/);
  assert.throws(() => meta.parseAdConcept(concept({ imageBase64: Buffer.from("GIF89a....").toString("base64") })), /PNG or JPEG/);
  assert.throws(() => meta.parseAdConcept(concept({ imageBase64: "" })), /imageBase64/);
  assert.throws(() => meta.parseAdConcept(concept({ primaryText: "  " })), /primaryText is required/);
});

test("accepts a data URL prefix on the image", () => {
  const c = meta.parseAdConcept(concept({ imageBase64: "data:image/png;base64," + PNG }));
  assert.equal(c.imageBase64, PNG);
});

test("landing link carries the tracking code for attribution", () => {
  const url = new URL(meta.adLandingUrl("https://fennington.com/", "/digital-products/hcc", "homestead-command-center", "HCC-A4"));
  assert.equal(url.origin + url.pathname, "https://fennington.com/digital-products/hcc");
  assert.equal(url.searchParams.get("utm_content"), "HCC-A4");
  assert.equal(url.searchParams.get("utm_campaign"), "homestead-command-center");
});

test("ads are always built paused", () => {
  const params = meta.adParams(meta.parseAdConcept(concept()), "123", "456");
  assert.equal(params.status, "PAUSED");
  assert.deepEqual(params.creative, { creative_id: "456" });
});

test("refuses any write other than images, creatives and paused ads", async () => {
  const { calls, impl } = fakeFetch([]);
  await assert.rejects(meta.metaGraphPost("act_1", "campaigns", {}, "t", impl), /only images, creatives and ads/);
  await assert.rejects(meta.metaGraphPost("act_1", "adsets", {}, "t", impl), /only images, creatives and ads/);
  await assert.rejects(meta.metaGraphPost("act_1", "ads", { status: "ACTIVE" }, "t", impl), /not PAUSED/);
  await assert.rejects(meta.metaGraphPost("act_1", "ads", {}, "t", impl), /not PAUSED/);
  await assert.rejects(meta.metaGraphPost("act_1", "adcreatives", { daily_budget: 500 }, "t", impl), /budget/);
  await assert.rejects(meta.metaGraphPost("1234", "ads", { status: "PAUSED" }, "t", impl), /account id/);
  assert.equal(calls.length, 0);
});

test("sends the token in a header, never the URL, and encodes nested params as JSON", async () => {
  const { calls, impl } = fakeFetch([{ id: "999" }]);
  const c = meta.parseAdConcept(concept());
  const body = await meta.metaGraphPost("act_42", "adcreatives", meta.creativeParams(c, "777", "hash1", "https://x.test/p"), "secret-token", impl);
  assert.equal(body.id, "999");
  assert.equal(calls[0].url, "https://graph.facebook.com/v21.0/act_42/adcreatives");
  assert.ok(!calls[0].url.includes("secret-token"));
  assert.equal(calls[0].init.headers.authorization, "Bearer secret-token");
  const spec = JSON.parse(calls[0].params.get("object_story_spec"));
  assert.equal(spec.page_id, "777");
  assert.equal(spec.link_data.image_hash, "hash1");
  assert.equal(spec.link_data.call_to_action.type, "SHOP_NOW");
  assert.equal(spec.link_data.call_to_action.value.link, "https://x.test/p");
});

test("surfaces Meta's error message without the token", async () => {
  const { impl } = fakeFetch([{ error: { message: "Invalid parameter", error_user_msg: "Page not linked" } }]);
  await assert.rejects(meta.metaGraphPost("act_42", "adimages", { bytes: PNG }, "secret-token", impl), (err) => {
    assert.match(err.message, /Invalid parameter - Page not linked/);
    assert.ok(!err.message.includes("secret-token"));
    return true;
  });
});

test("reads the image hash from Meta's adimages response", () => {
  assert.equal(meta.imageHashFrom({ images: { bytes: { hash: "abc", url: "u" } } }), "abc");
  assert.throws(() => meta.imageHashFrom({ images: {} }), /image hash/);
});

test("normalizes ad account ids", () => {
  assert.equal(meta.normalizeAdAccountId("12345"), "act_12345");
  assert.equal(meta.normalizeAdAccountId("act_12345"), "act_12345");
  assert.equal(meta.normalizeAdAccountId("act_abc"), "");
});

test("pause sends only status PAUSED to the ad itself", async () => {
  const { calls, impl } = fakeFetch([{ success: true }]);
  await meta.metaPauseAd("120200", "secret-token", impl);
  assert.equal(calls[0].url, "https://graph.facebook.com/v21.0/120200");
  assert.deepEqual([...calls[0].params.entries()], [["status", "PAUSED"]]);
  await assert.rejects(meta.metaPauseAd("act_1/campaigns", "t", impl), /ad id is invalid/);
  assert.equal(calls.length, 1);
});

test("ranking puts real Stripe sales first, then cheaper clicks", () => {
  const rows = [
    { trackingCode: "HCC-A1", clicks: 40, spend: 12, impressions: 3000, ctr: 1.3 },
    { trackingCode: "HCC-A2", clicks: 20, spend: 12, impressions: 2500, ctr: 0.8 },
    { trackingCode: "HCC-A3", clicks: 50, spend: 11, impressions: 3500, ctr: 1.4, purchases: 0 }
  ];
  const sales = new Map([["HCC-A2", { count: 1, revenueCents: 1700 }]]);
  const ranked = meta.rankAds(rows, sales);
  assert.deepEqual(ranked.map((r) => r.trackingCode), ["HCC-A2", "HCC-A3", "HCC-A1"]);
  assert.equal(ranked[0].revenue, 17);
  assert.equal(ranked[0].costPerSale, 12);
  assert.equal(ranked[1].costPerClick, 0.22);
});

test("ranking flags ads that have not had enough spend to judge", () => {
  const ranked = meta.rankAds([
    { trackingCode: "HCC-A1", clicks: 3, spend: 2 },
    { trackingCode: "HCC-A2", clicks: 25, spend: 4 }
  ], new Map());
  assert.equal(ranked.find((r) => r.trackingCode === "HCC-A1").enoughData, false);
  assert.equal(ranked.find((r) => r.trackingCode === "HCC-A2").enoughData, true);
});

test("an ad with no clicks ranks below one with clicks", () => {
  const ranked = meta.rankAds([
    { trackingCode: "HCC-A1", clicks: 0, spend: 0 },
    { trackingCode: "HCC-A2", clicks: 5, spend: 3 }
  ], new Map());
  assert.deepEqual(ranked.map((r) => r.trackingCode), ["HCC-A2", "HCC-A1"]);
});
