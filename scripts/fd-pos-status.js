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

async function getState(apiBaseUrl, serviceSecret, slug) {
  const response = await fetch(`${apiBaseUrl}/digital-products/${encodeURIComponent(slug)}/state`, {
    headers: { "x-fd-pos-secret": serviceSecret }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.message || `Status request failed: ${response.status}`);
  }
  return body;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item?.[key] || "unset";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function formatCounts(counts) {
  const entries = Object.entries(counts);
  if (!entries.length) return "none";
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

function latestStatusHistory(product) {
  const history = Array.isArray(product.statusHistory) ? product.statusHistory : [];
  const latest = history[history.length - 1];
  if (!latest) return "No status history.";
  const who = latest.updatedBy ? ` by ${latest.updatedBy}` : "";
  const reason = latest.reason ? ` - ${latest.reason}` : "";
  return `${latest.status || product.status}${who}${reason}`;
}

function summarizeNextStep(product, tasks, approvals) {
  const pendingApproval = approvals.find((approval) => approval.status === "PENDING");
  if (pendingApproval) return `Review approval ${pendingApproval.approvalId || pendingApproval.id} (${pendingApproval.approvalType}).`;
  const activeTask = tasks.find((task) => ["OPEN", "RUNNING", "WAITING_FOR_APPROVAL"].includes(task.status));
  if (activeTask) return `Continue task ${activeTask.taskId || activeTask.id} (${activeTask.workflow || activeTask.title}).`;
  if (!product.fulfillmentPackageId) return "Build/register fulfillment package.";
  if (!product.salesPagePath) return "Set sales page path.";
  if (!product.stripePriceId) return "Create Stripe Product/Price.";
  if (!product.testCheckoutEnabled && !["LAUNCH_READY", "LIVE"].includes(product.status)) return "Enable test checkout or move through launch approval.";
  return "Ready for checkout/fulfillment validation.";
}

function printStatus(state) {
  const product = state.product || {};
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const approvals = Array.isArray(state.approvals) ? state.approvals : [];
  const promises = Array.isArray(state.promises) ? state.promises : [];
  const assets = Array.isArray(state.assets) ? state.assets : [];
  const includedAssets = assets.filter((asset) => !String(asset.assetId || asset.id || "").includes("value_enhancer"));
  const supportingAssets = includedAssets.filter((asset) => asset.assetId !== `${product.productId}_primary` && asset.type !== "sales-page");

  console.log(`FD-POS Status: ${product.name || product.slug}`);
  console.log(`Slug: ${product.slug}`);
  console.log(`Status: ${product.status}`);
  console.log(`Next: ${summarizeNextStep(product, tasks, approvals)}`);
  console.log(`Latest: ${latestStatusHistory(product)}`);
  console.log("");
  console.log("Readiness");
  console.log(`Package: ${product.fulfillmentPackageId || "missing"}`);
  console.log(`Fulfillment files: ${product.fulfillmentFiles ? Object.keys(product.fulfillmentFiles).length : 0}`);
  console.log(`Sales page: ${product.salesPagePath || "missing"}`);
  console.log(`Stripe product: ${product.stripeProductId || "missing"}`);
  console.log(`Stripe price: ${product.stripePriceId || "missing"}`);
  console.log(`Test checkout: ${product.testCheckoutEnabled === true ? "enabled" : "disabled"}`);
  console.log("");
  console.log("Counts");
  console.log(`Tasks: ${formatCounts(countBy(tasks, "status"))}`);
  console.log(`Approvals: ${formatCounts(countBy(approvals, "status"))}`);
  console.log(`Promises: ${formatCounts(countBy(promises, "approvalStatus"))}`);
  console.log(`Assets: ${formatCounts(countBy(assets, "status"))}`);
  console.log(`Supporting assets approved: ${supportingAssets.filter((asset) => asset.status === "APPROVED").length}/${supportingAssets.length}`);
  console.log("");
  if (approvals.length) {
    console.log("Approvals");
    approvals
      .sort((a, b) => String(a.status).localeCompare(String(b.status)) || String(a.approvalType).localeCompare(String(b.approvalType)))
      .forEach((approval) => console.log(`- ${approval.status || "unset"}: ${approval.approvalType || "approval"} (${approval.approvalId || approval.id})`));
    console.log("");
  }
  if (tasks.length) {
    console.log("Tasks");
    tasks
      .sort((a, b) => String(a.status).localeCompare(String(b.status)) || String(a.workflow).localeCompare(String(b.workflow)))
      .forEach((task) => console.log(`- ${task.status || "unset"}: ${task.workflow || task.title || "task"} (${task.taskId || task.id})`));
  }
}

async function main() {
  loadRootEnv();
  const slug = process.argv[2] || process.env.FD_POS_PRODUCT_SLUG || "backyard-livestock-planner";
  const apiBaseUrl = (process.env.FD_POS_API_BASE_URL || `http://127.0.0.1:5001/${defaultProjectId()}/us-central1/api`).replace(/\/$/, "");
  const serviceSecret = process.env.FD_POS_SERVICE_SECRET || "";
  if (!serviceSecret) throw new Error("FD_POS_SERVICE_SECRET is required to read FD-POS status through the protected API.");
  const state = await getState(apiBaseUrl, serviceSecret, slug);
  printStatus(state);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
