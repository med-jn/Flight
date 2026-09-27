// Run once, locally (needs internet access): node scripts/build-coastlines.mjs
//
// Downloads Natural Earth's land boundaries (public domain), pre-packaged as TopoJSON by
// topojson/world-atlas, and decodes them into plain [lon, lat] polygon rings — no external
// projection or topojson library needed, since we do our own polar-azimuthal projection
// per-vertex at render time (see core/coastlines.ts + flightRenderer.ts).
//
// RESOLUTION controls detail vs. file size. '10m' is Natural Earth's finest scale (captures
// small islands well, as requested) but is the largest download; drop to '50m' if the file
// turns out too heavy for your needs.
const RESOLUTION = '10m'; // '10m' | '50m' | '110m'

const SOURCE_URL = `https://cdn.jsdelivr.net/npm/world-atlas@2/land-${RESOLUTION}.json`;

import { writeFileSync } from 'node:fs';

/** Cumulative-sums each arc's delta-encoded, quantized integer coordinates, then applies the
 * topology's scale/translate to recover real [lon, lat] pairs. */
function decodeArcs(topology) {
  const [sx, sy] = topology.transform.scale;
  const [tx, ty] = topology.transform.translate;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [round(tx + x * sx), round(ty + y * sy)];
    });
  });
}

function round(n) {
  // ~100m precision at the equator — imperceptible at any zoom level this app uses, and cuts
  // file size substantially versus full float precision.
  return Math.round(n * 1000) / 1000;
}

/** TopoJSON arc references can be negative, meaning "use ~index, reversed" (bitwise NOT). */
function arcPoints(arcs, index) {
  if (index < 0) return arcs[~index].slice().reverse();
  return arcs[index];
}

/** Stitches a ring's arc references into one continuous list of [lon, lat] points. Adjacent
 * arcs share an endpoint, so every arc after the first drops its first point. */
function ringFromArcIndices(arcs, indices) {
  const ring = [];
  indices.forEach((idx, k) => {
    const pts = arcPoints(arcs, idx);
    ring.push(...(k === 0 ? pts : pts.slice(1)));
  });
  return ring;
}

function geometryToPolygons(arcs, geometry) {
  if (geometry.type === 'Polygon') {
    return [geometry.arcs.map((ring) => ringFromArcIndices(arcs, ring))];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.arcs.map((poly) => poly.map((ring) => ringFromArcIndices(arcs, ring)));
  }
  return [];
}

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`Failed to fetch coastline data: HTTP ${res.status}`);
const topology = await res.json();

const arcs = decodeArcs(topology);
const land = topology.objects.land;

const polygons = [];
for (const geometry of land.geometries) {
  polygons.push(...geometryToPolygons(arcs, geometry));
}

writeFileSync('public/data/coastlines.json', JSON.stringify(polygons));

const totalPoints = polygons.reduce((sum, poly) => sum + poly.reduce((s, ring) => s + ring.length, 0), 0);
console.log(`Wrote ${polygons.length} land polygons (${totalPoints.toLocaleString()} points, ${RESOLUTION} resolution) to public/data/coastlines.json`);