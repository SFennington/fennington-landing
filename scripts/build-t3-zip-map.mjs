// Builds demo/t3-inspections/dashboard/zips.json: the ZIP outlines Ted clicks on in his dashboard map.
// Source: Census ZCTA boundaries for Massachusetts (a public GeoJSON copy of the 2010 file), trimmed
// to the western half of the state and simplified so the file stays small. Census ZIP areas are close
// to, not exactly, post office ZIPs; the dashboard says so.
//   node scripts/build-t3-zip-map.mjs [path-to-ma-zip-geojson]
// With no argument the file is downloaded from the public copy below.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/ma_massachusetts_zip_codes_geo.min.json";
const WEST_OF_LON = -71.55; // keeps Worcester County and everything west of it
const TOLERANCE = 0.0004; // degrees, about 40 m
const ours = JSON.parse(readFileSync(join(root, "functions/src/t3-zips.json"), "utf8"));
const towns = Object.fromEntries(ours.map((z) => [z.zip, z.town]));

const raw = process.argv[2] ? readFileSync(process.argv[2], "utf8") : await (await fetch(SOURCE)).text();
const source = JSON.parse(raw);

function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let max = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i], points[0], points[points.length - 1]);
    if (d > max) { max = d; index = i; }
  }
  if (max <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}
const round = (n) => Math.round(n * 1e4) / 1e4;
const ring = (r) => {
  const s = simplify(r, TOLERANCE).map((p) => [round(p[0]), round(p[1])]);
  return s.length >= 4 ? s : null;
};

const features = [];
for (const f of source.features) {
  const zip = f.properties.ZCTA5CE10;
  const lon = parseFloat(f.properties.INTPTLON10);
  if (!(lon < WEST_OF_LON) && !towns[zip]) continue;
  const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const kept = polygons.map((poly) => poly.map(ring).filter(Boolean)).filter((poly) => poly.length);
  if (!kept.length) continue;
  features.push({
    type: "Feature",
    properties: { z: zip, t: towns[zip] || "", lat: round(parseFloat(f.properties.INTPTLAT10)), lon: round(lon) },
    geometry: { type: "MultiPolygon", coordinates: kept }
  });
}
const out = join(root, "demo/t3-inspections/dashboard/zips.json");
writeFileSync(out, JSON.stringify({ type: "FeatureCollection", features }));
console.log(`${features.length} ZIP areas written to ${out}`);
const missing = ours.filter((z) => !features.some((f) => f.properties.z === z.zip));
if (missing.length) console.log(`Not on the Census map (PO boxes or newer ZIPs): ${missing.map((z) => z.zip).join(", ")}`);
