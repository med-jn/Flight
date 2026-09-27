// Run after build-airports.mjs (needs public/data/airports.json to already exist):
//   node scripts/build-routes.mjs
// Downloads OpenFlights' routes.dat (public domain-ish, free/open dataset of real published
// airline routes) and keeps only routes between airports we actually know about, deduplicated
// by origin-destination pair, with one representative equipment code per pair.

import { readFileSync, writeFileSync } from 'node:fs';

const ROUTES_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat';

const airports = JSON.parse(readFileSync('public/data/airports.json', 'utf-8'));
const knownIata = new Set(airports.map((a) => a.iata));

const res = await fetch(ROUTES_URL);
if (!res.ok) throw new Error(`Failed to fetch routes data: HTTP ${res.status}`);
const text = await res.text();

// Columns: Airline,AirlineID,SourceAirport,SourceAirportID,DestAirport,DestAirportID,
//          Codeshare,Stops,Equipment
const seen = new Map(); // "ORIGIN-DEST" -> equipment code

for (const line of text.split('\n')) {
  if (!line.trim()) continue;
  const cols = line.split(',');
  if (cols.length < 9) continue;
  const [airlineIcao, , src, , dst, , , stops, equipment] = cols;
  if (stops !== '0') continue; // only non-stop routes count as a "real direct route"
  if (!knownIata.has(src) || !knownIata.has(dst) || src === dst) continue;

  const key = `${src}-${dst}`;
  if (!seen.has(key)) {
    const firstEquip = (equipment || '').trim().split(' ')[0] || '';
    seen.set(key, { o: src, d: dst, eq: firstEquip, a: airlineIcao });
  }
}

const routes = [...seen.values()];
writeFileSync('public/data/routes.json', JSON.stringify(routes), 'utf-8');
console.log(`Wrote ${routes.length} unique real non-stop routes to public/data/routes.json`);
