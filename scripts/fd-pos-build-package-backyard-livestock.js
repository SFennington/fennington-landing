const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

function slugify(value) {
  return String(value || "asset")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "asset";
}

function fileKey(value) {
  return slugify(value).replace(/-/g, "_");
}

function safeFilename(value) {
  return String(value || "file")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";
}

function localPath(pathOrUrl) {
  const value = String(pathOrUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return "";
  return path.resolve(value.replace(/^([A-Za-z]):\//, "$1:/"));
}

async function apiRequest(apiBaseUrl, serviceSecret, route, options = {}) {
  const response = await fetch(`${apiBaseUrl}${route}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      "x-fd-pos-secret": serviceSecret
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error || body.message || `Request failed: ${response.status}`;
    throw new Error(`${message}\n${JSON.stringify(body, null, 2)}`);
  }
  return body;
}

function copyAsset(asset, outputDir, prefix) {
  const sourcePath = localPath(asset.pathOrUrl);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Asset source is unavailable locally: ${asset.assetId || asset.id} (${asset.pathOrUrl || "missing path"})`);
  }
  const ext = path.extname(sourcePath);
  const base = safeFilename(`${prefix}-${asset.name || asset.assetId || asset.id}`);
  const filename = `${base}${ext || ""}`;
  const targetPath = path.join(outputDir, filename);
  fs.copyFileSync(sourcePath, targetPath);
  return {
    filename,
    downloadName: filename,
    path: targetPath
  };
}

function createZip(stagingDir, zipPath) {
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
  const command = `Get-ChildItem -LiteralPath "${stagingDir.replace(/"/g, "`\"")}" | Compress-Archive -DestinationPath "${zipPath.replace(/"/g, "`\"")}" -Force`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Compress-Archive failed.\n${result.stderr || result.stdout}`);
  }
}

async function main() {
  loadRootEnv();
  const slug = process.argv[2] || process.env.FD_POS_PRODUCT_SLUG || "backyard-livestock-planner";
  const apiBaseUrl = (process.env.FD_POS_API_BASE_URL || `http://127.0.0.1:5001/${defaultProjectId()}/us-central1/api`).replace(/\/$/, "");
  const serviceSecret = process.env.FD_POS_SERVICE_SECRET || "";
  const expectedSupportingAssets = Number(process.env.FD_POS_EXPECTED_SUPPORTING_ASSETS || 11);
  const salesPagePath = process.env.FD_POS_SALES_PAGE_PATH || `/digital-products/${slug}`;
  if (!serviceSecret) throw new Error("FD_POS_SERVICE_SECRET is required.");

  const state = await apiRequest(apiBaseUrl, serviceSecret, `/digital-products/${encodeURIComponent(slug)}/state`);
  const product = state.product;
  const assets = Array.isArray(state.assets) ? state.assets : [];
  const primaryAsset = assets.find((asset) => asset.assetId === `${product.productId}_primary`) || {
    assetId: `${product.productId}_primary`,
    name: product.name,
    type: "ebook",
    format: path.extname(product.primaryAssetPath).replace(/^\./, "") || "other",
    pathOrUrl: product.primaryAssetPath
  };
  const supportingAssets = assets
    .filter((asset) => asset.productId === product.productId)
    .filter((asset) => asset.status === "APPROVED")
    .filter((asset) => ![`${product.productId}_primary`, `${product.productId}_value_enhancer`].includes(asset.assetId || asset.id))
    .filter((asset) => asset.type !== "sales-page");

  if (supportingAssets.length !== expectedSupportingAssets) {
    throw new Error(`Expected ${expectedSupportingAssets} approved supporting assets, found ${supportingAssets.length}.`);
  }

  const privateDir = path.resolve(__dirname, "..", "functions", "private-products", slug);
  const stagingDir = path.join(privateDir, "staging");
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const version = new Date().toISOString().slice(0, 10);
  const fulfillmentFiles = {};
  const copiedPrimary = copyAsset(primaryAsset, stagingDir, "00-ebook");
  fulfillmentFiles.ebook = { filename: copiedPrimary.filename, downloadName: copiedPrimary.downloadName };

  const includedAssetIds = [primaryAsset.assetId || primaryAsset.id];
  supportingAssets.forEach((asset, index) => {
    const copied = copyAsset(asset, stagingDir, String(index + 1).padStart(2, "0"));
    fulfillmentFiles[fileKey(asset.assetId || asset.id || asset.name)] = { filename: copied.filename, downloadName: copied.downloadName };
    includedAssetIds.push(asset.assetId || asset.id);
  });

  const manifest = {
    schemaVersion: "1.0",
    productId: product.productId,
    slug: product.slug,
    name: product.name,
    version,
    salesPagePath,
    includedAssetIds,
    files: fulfillmentFiles,
    builtAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(stagingDir, "package-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const packageFilename = `${safeFilename(product.name)}-${version}.zip`;
  const packagePath = path.join(privateDir, packageFilename);
  createZip(stagingDir, packagePath);
  fs.copyFileSync(path.join(stagingDir, "package-manifest.json"), path.join(privateDir, "package-manifest.json"));
  fs.readdirSync(stagingDir).forEach((filename) => {
    fs.copyFileSync(path.join(stagingDir, filename), path.join(privateDir, filename));
  });
  fs.rmSync(stagingDir, { recursive: true, force: true });

  const registrationFiles = {
    default: { filename: packageFilename, downloadName: packageFilename },
    package: { filename: packageFilename, downloadName: packageFilename },
    ...fulfillmentFiles,
    manifest: { filename: "package-manifest.json", downloadName: "package-manifest.json" }
  };
  const result = await apiRequest(apiBaseUrl, serviceSecret, `/digital-products/${encodeURIComponent(slug)}/package-builder/complete`, {
    method: "POST",
    body: {
      packageId: `${product.productId}_${version.replace(/-/g, "_")}`,
      version,
      salesPagePath,
      includedAssetIds,
      fulfillmentFiles: registrationFiles,
      manifestFilename: "package-manifest.json"
    }
  });
  console.log(JSON.stringify({ ...result, packagePath }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
