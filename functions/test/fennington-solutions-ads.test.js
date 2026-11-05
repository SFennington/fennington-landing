// Runs against the compiled output: `npm test` builds first.
const test = require("node:test");
const assert = require("node:assert/strict");
const meta = require("../lib/meta-ads.js");
const { FENNINGTON_SOLUTIONS_AD_CONCEPTS } = require("../lib/fennington-solutions-ads.js");

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString("base64");

test("three Fennington Solutions ad concepts cover review, websites and automation with sequential codes", () => {
  assert.deepEqual(FENNINGTON_SOLUTIONS_AD_CONCEPTS.map((c) => c.trackingCode), ["FS-A1", "FS-A2", "FS-A3"]);
  assert.deepEqual(FENNINGTON_SOLUTIONS_AD_CONCEPTS.map((c) => c.service), ["review", "websites", "automation"]);
});

test("each concept parses as a valid ad and links to the fennington.com home page", () => {
  for (const draft of FENNINGTON_SOLUTIONS_AD_CONCEPTS) {
    const concept = meta.parseAdConcept({ ...draft, imageBase64: PNG });
    assert.equal(concept.trackingCode, draft.trackingCode);
    assert.equal(concept.service, draft.service);

    const link = new URL(meta.adLandingUrl("https://fennington.com", "/", "fennington-solutions", concept.trackingCode, concept.service));
    assert.equal(link.origin + link.pathname, "https://fennington.com/");
    assert.equal(link.searchParams.get("service"), draft.service);
    assert.equal(link.searchParams.get("utm_content"), draft.trackingCode);
    assert.equal(link.searchParams.get("utm_campaign"), "fennington-solutions");
  }
});
