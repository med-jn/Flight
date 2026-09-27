// Run after build-coastlines.mjs: node scripts/build-world-map.mjs
//
// Rasterizes the vector coastline data into one high-resolution PNG, using the EXACT same
// polar-azimuthal-equidistant projection math as the live app (src/core/projection.ts) —
// duplicated here in plain JS since this runs in Node, not the browser.
//
// This is the key architectural fix: instead of projecting ~400k points every time the app
// draws a frame (even with caching, this was still too heavy), we do that work ONCE, offline,
// and ship a plain image. At runtime the app just scales/pans a picture — exactly as cheap as
// the original photo-based map was, but generated from real, complete, accurate data instead
// of a limited photograph.

import { createCanvas } from 'canvas';
import { readFileSync, writeFileSync } from 'node:fs';

// 8192px gives a sharp result even when zoomed in close; lower this (e.g. 4096) if generation
// is too slow/large on your machine — land is flat color, so the PNG compresses very well
// either way.
const SIZE = 8192;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2;

const OCEAN_COLOR = '#071a2e';
const LAND_COLOR = '#3a8c5f';

const DEG2RAD = Math.PI / 180;

function project(lat, lon) {
  const colat = 90 - lat;
  const r = (colat / 180) * RADIUS;
  const lonRad = (lon + 180) * DEG2RAD;
  return [CENTER - r * Math.sin(lonRad), CENTER - r * Math.cos(lonRad)];
}

const polygons = JSON.parse(readFileSync('public/data/coastlines.json', 'utf-8'));

const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

ctx.fillStyle = OCEAN_COLOR;
ctx.fillRect(0, 0, SIZE, SIZE);

ctx.fillStyle = LAND_COLOR;
ctx.beginPath();
for (const polygon of polygons) {
  for (const ring of polygon) {
    ring.forEach(([lon, lat], i) => {
      const [x, y] = project(lat, lon);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}
ctx.fill('evenodd');

writeFileSync('public/images/world-map.png', canvas.toBuffer('image/png'));
console.log(`Wrote public/images/world-map.png (${SIZE}x${SIZE})`);