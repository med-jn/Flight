// Run once, locally (needs internet access): node scripts/build-airports.mjs
// Downloads the OurAirports dataset (public domain) and keeps only airports that have an
// IATA code (~9k) — every airport worth showing in a flight app — along with their `type`
// (large_airport / medium_airport / small_airport / ...), which the app uses to decide which
// airports are visible by default (international only) vs. pinned on demand.

import { writeFileSync, mkdirSync } from 'node:fs';

const CSV_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

const res = await fetch(CSV_URL);
if (!res.ok) throw new Error(`Failed to fetch airport data: HTTP ${res.status}`);
const csvText = await res.text();

// Minimal CSV parser that respects double-quoted fields (OurAirports quotes any field that
// may contain a comma, e.g. names and keywords).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(csvText);
const header = rows[0];
const col = (name) => header.indexOf(name);
const idx = {
  type: col('type'),
  name: col('name'),
  lat: col('latitude_deg'),
  lon: col('longitude_deg'),
  elevFt: col('elevation_ft'),
  country: col('iso_country'),
  municipality: col('municipality'),
  icao: col('icao_code'),
  iata: col('iata_code'),
  gps: col('gps_code'),
  ident: col('ident'),
};

const VALID_TYPES = new Set(['large_airport', 'medium_airport', 'small_airport']);

const airports = rows
  .slice(1)
  .filter((r) => r.length > 1 && VALID_TYPES.has(r[idx.type]) && r[idx.iata])
  .map((r) => ({
    icao: r[idx.icao] || r[idx.gps] || r[idx.ident],
    iata: r[idx.iata],
    name: r[idx.name],
    city: r[idx.municipality] || '',
    country: r[idx.country] || '',
    latitudeDeg: Number(r[idx.lat]),
    longitudeDeg: Number(r[idx.lon]),
    elevationFt: r[idx.elevFt] ? Number(r[idx.elevFt]) : undefined,
    type: r[idx.type],
  }))
  .filter((a) => a.icao && Number.isFinite(a.latitudeDeg) && Number.isFinite(a.longitudeDeg))
  .sort((a, b) => a.iata.localeCompare(b.iata));

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/airports.json', JSON.stringify(airports), 'utf-8');

const counts = airports.reduce((acc, a) => {
  acc[a.type] = (acc[a.type] || 0) + 1;
  return acc;
}, {});
console.log(`Wrote ${airports.length} airports to public/data/airports.json`);
console.log(counts);
