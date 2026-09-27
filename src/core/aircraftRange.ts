import type { AircraftCategory } from '../types/flight';

/**
 * Realistic maximum non-stop range per category, in kilometers — conservative typical values
 * for the most common aircraft in each class (not the absolute record holder). A route longer
 * than this genuinely cannot be flown non-stop by that category in real life, so the app
 * refuses to let it launch rather than silently pretending it can.
 */
export const AIRCRAFT_RANGE_KM: Record<AircraftCategory, number> = {
  regional: 2400, // e.g. ATR72, Embraer E-Jet
  narrowbody: 6300, // e.g. A321LR/737 MAX — covers most single-aisle routes, not true ultra-long-haul
  private: 7500, // e.g. Gulfstream/Global-class business jet
  widebody: 15200, // e.g. A350-900ULR/777-200LR class
  cargo: 9200, // e.g. 747-8F/777F class freighter
};

export function isRouteFeasible(distanceKm: number, category: AircraftCategory): boolean {
  return distanceKm <= AIRCRAFT_RANGE_KM[category];
}

/** The smallest category (by typical size, not necessarily range) that can cover the
 * distance non-stop, preferring the most "normal" choice for that stage length. */
export function suggestFeasibleCategory(distanceKm: number): AircraftCategory {
  const order: AircraftCategory[] = ['regional', 'narrowbody', 'private', 'cargo', 'widebody'];
  return order.find((c) => distanceKm <= AIRCRAFT_RANGE_KM[c]) ?? 'widebody';
}
