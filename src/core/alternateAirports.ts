import type { Airport, GeoCoordinates } from '../types/flight';
import { greatCircleDistanceKm, sampleGreatCircle } from './greatCircle';
import { getInternationalAirports } from './airportCatalog';

/**
 * Suggests emergency/diversion (alternate) airports for a route: the nearest international
 * airport to each of several checkpoints along the great-circle path (roughly every quarter
 * of the way), excluding the origin and destination themselves. Mirrors how real dispatch
 * planning picks enroute alternates — coverage along the whole route, not just at the ends.
 */
export function suggestAlternates(
  origin: Airport,
  destination: Airport,
  maxCount = 3
): Airport[] {
  const candidates = getInternationalAirports().filter(
    (a) => a.icao !== origin.icao && a.icao !== destination.icao
  );
  if (candidates.length === 0) return [];

  const checkpoints: GeoCoordinates[] = sampleGreatCircle(
    { latitudeDeg: origin.latitudeDeg, longitudeDeg: origin.longitudeDeg },
    { latitudeDeg: destination.latitudeDeg, longitudeDeg: destination.longitudeDeg },
    4 // 0%, 25%, 50%, 75%, 100% — use the interior points as checkpoints
  ).slice(1, -1);

  const picked: Airport[] = [];
  const usedIcaos = new Set<string>();

  for (const checkpoint of checkpoints) {
    let nearest: Airport | null = null;
    let nearestDist = Infinity;
    for (const a of candidates) {
      if (usedIcaos.has(a.icao)) continue;
      const d = greatCircleDistanceKm(checkpoint, { latitudeDeg: a.latitudeDeg, longitudeDeg: a.longitudeDeg });
      if (d < nearestDist) { nearest = a; nearestDist = d; }
    }
    if (nearest) {
      picked.push(nearest);
      usedIcaos.add(nearest.icao);
      if (picked.length >= maxCount) break;
    }
  }
  return picked;
}

/**
 * A broader, browsable list of international airports near the route — for the person to pick
 * a transit/stopover from, distinct from the automatically-selected diversion alternates
 * above (which are just the nearest one per checkpoint). Uses more checkpoints and a higher
 * limit, deduplicated, sorted by distance to the nearest point on the route.
 */
export function suggestNearbyAirports(
  origin: Airport,
  destination: Airport,
  limit = 8
): Airport[] {
  const candidates = getInternationalAirports().filter(
    (a) => a.icao !== origin.icao && a.icao !== destination.icao
  );
  if (candidates.length === 0) return [];

  const checkpoints: GeoCoordinates[] = sampleGreatCircle(
    { latitudeDeg: origin.latitudeDeg, longitudeDeg: origin.longitudeDeg },
    { latitudeDeg: destination.latitudeDeg, longitudeDeg: destination.longitudeDeg },
    10
  );

  const bestDistanceByIcao = new Map<string, number>();
  for (const a of candidates) {
    let best = Infinity;
    for (const cp of checkpoints) {
      const d = greatCircleDistanceKm(cp, { latitudeDeg: a.latitudeDeg, longitudeDeg: a.longitudeDeg });
      if (d < best) best = d;
    }
    bestDistanceByIcao.set(a.icao, best);
  }

  return candidates
    .slice()
    .sort((a, b) => (bestDistanceByIcao.get(a.icao) ?? Infinity) - (bestDistanceByIcao.get(b.icao) ?? Infinity))
    .slice(0, limit);
}