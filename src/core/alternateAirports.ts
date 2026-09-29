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