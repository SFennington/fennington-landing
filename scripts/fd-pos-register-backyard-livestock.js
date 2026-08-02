const fs = require("fs");
const path = require("path");

function loadRootEnv() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) return;
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key]) return;
    process.env[key] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  });
}

function defaultProjectId() {
  try {
    const firebaseConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", ".firebaserc"), "utf8"));
    return firebaseConfig.projects?.default || "fennington-financial";
  } catch {
    return "fennington-financial";
  }
}

loadRootEnv();

const apiBaseUrl = (process.env.FD_POS_API_BASE_URL || `http://127.0.0.1:5001/${defaultProjectId()}/us-central1/api`).replace(/\/$/, "");
const serviceSecret = process.env.FD_POS_SERVICE_SECRET || "";

if (!serviceSecret) {
  console.error("FD_POS_SERVICE_SECRET is required.");
  process.exit(1);
}

const manifest = {
  schemaVersion: "1.0",
  productId: "backyard-livestock-planner-001",
  slug: "backyard-livestock-planner",
  name: "Backyard Livestock Planner",
  priceCents: 1700,
  currency: "usd",
  sourceFolder: "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3",
  primaryAsset: {
    name: "ebook-asset",
    pathOrUrl: "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3/ebook-asset.docx",
    type: "ebook",
    format: "docx"
  },
  valueEnhancer: {
    name: "value-enhancer",
    pathOrUrl: "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3/value-enhancer.docx",
    type: "other",
    format: "docx"
  },
  targetAudience: "backyard livestock owners, small farms, and homesteaders",
  approvedImplementationPaths: ["paper", "spreadsheet", "Livestock Tracker app optional"],
  claimsPolicy: {
    noFakeTestimonials: true,
    noFakeScarcity: true,
    noUnsupportedAppFeatures: true,
    appIsOptional: true
  },
  fulfillment: {
    deliveryMode: "zip-or-private-files",
    tokenTtlDays: 7
  }
};

async function main() {
  const response = await fetch(`${apiBaseUrl}/digital-products/register-draft`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-fd-pos-secret": serviceSecret
    },
    body: JSON.stringify({ manifest })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(body, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
