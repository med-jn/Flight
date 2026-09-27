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
