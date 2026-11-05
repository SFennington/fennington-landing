// Builds the T3 Inspections "can book online" ZIP list (functions/src/t3-zips.json).
//
// Rule agreed with Stephen (2026-11-05): Massachusetts only. Every ZIP in the three counties
// I-91 runs through (Hampden, Hampshire, Franklin), plus any other Massachusetts ZIP within
// about a 30-minute drive of I-91. Drive time is approximated as straight-line miles to the
// I-91 centreline, so the cap is a judgement call that Ted should review, not a routing result.
//
// Usage: node scripts/build-t3-zip-list.mjs <path to GeoNames US.txt>
// Data: GeoNames postal codes (https://download.geonames.org/export/zip/US.zip, CC BY 4.0).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/build-t3-zip-list.mjs <GeoNames US.txt>');
  process.exit(1);
}

const COUNTIES = new Set(['Hampden', 'Hampshire', 'Franklin']);
// Straight-line miles standing in for 30 minutes of driving on rural roads.
const CORRIDOR_MILES = 20;

// I-91 through Massachusetts, south to north: [lat, lon].
const I91 = [
  [42.0, -72.6],
  [42.1, -72.59],
  [42.2, -72.62],
  [42.32, -72.64],
  [42.43, -72.62],
  [42.54, -72.6],
  [42.6, -72.6],
  [42.68, -72.55],
  [42.73, -72.53],
];

const MILES_PER_DEG_LAT = 69;
function milesToSegment(lat, lon, a, b) {
  const kx = MILES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const px = lon * kx, py = lat * MILES_PER_DEG_LAT;
  const ax = a[1] * kx, ay = a[0] * MILES_PER_DEG_LAT;
  const bx = b[1] * kx, by = b[0] * MILES_PER_DEG_LAT;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function milesToI91(lat, lon) {
  let best = Infinity;
  for (let i = 0; i < I91.length - 1; i += 1) best = Math.min(best, milesToSegment(lat, lon, I91[i], I91[i + 1]));
  return best;
}

const rows = fs.readFileSync(source, 'utf8').split('\n').filter(Boolean).map((line) => line.split('\t'));
const list = [];
const nearMisses = [];
for (const [, zip, town, , state, county, , , , lat, lon] of rows) {
  if (state !== 'MA') continue;
  const miles = milesToI91(Number(lat), Number(lon));
  const inCounty = COUNTIES.has(county);
  if (inCounty || miles <= CORRIDOR_MILES) {
    list.push({ zip, town, county, why: inCounty ? 'county' : 'corridor', miles: Math.round(miles * 10) / 10 });
  } else if (miles <= CORRIDOR_MILES + 8) {
    nearMisses.push(`${zip} ${town} (${county}) ${miles.toFixed(1)} mi`);
  }
}
list.sort((a, b) => a.zip.localeCompare(b.zip));

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'functions', 'src', 't3-zips.json');
fs.writeFileSync(out, `${JSON.stringify(list, null, 1)}\n`);
console.log(`${list.length} ZIPs written (${list.filter((z) => z.why === 'county').length} by county, ${list.filter((z) => z.why === 'corridor').length} by corridor)`);
console.log('Corridor towns:', [...new Set(list.filter((z) => z.why === 'corridor').map((z) => `${z.town} (${z.county})`))].join(', '));
console.log(`Just outside (${CORRIDOR_MILES}-${CORRIDOR_MILES + 8} mi), for Ted to consider:`, nearMisses.join('; '));
