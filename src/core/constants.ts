/** How long (in simulated time, milliseconds) a landed flight's route line and aircraft take
 * to fade out and disappear after arrival, before being pruned from the store entirely. */
export const FLIGHT_FADE_MS = 20 * 60 * 1000; // 20 simulated minutes

/** Average cruise ground speed used to estimate a "typical" flight duration when no real
 * schedule data pins it down more precisely — a standard planning figure, not specific to any
 * one aircraft. */
export const AVERAGE_CRUISE_SPEED_KMH = 850;

/** Fixed overhead added to the pure cruise-time estimate for taxi, climb, descent and
 * approach — keeps very short hops from coming out unrealistically brief. */
export const FLIGHT_OVERHEAD_HOURS = 0.5;

export function estimateTypicalDurationHours(distanceKm: number): number {
  const hours = distanceKm / AVERAGE_CRUISE_SPEED_KMH + FLIGHT_OVERHEAD_HOURS;
  return Math.round(hours * 2) / 2; // round to nearest half hour
}
