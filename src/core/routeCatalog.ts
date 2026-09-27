import { equipmentCodeToCategory } from './aircraftTypeMap';
import type { AircraftCategory } from '../types/flight';

export interface RealRoute {
  originIata: string;
  destinationIata: string;
  aircraftType: AircraftCategory;
}

let routesByOrigin = new Map<string, RealRoute[]>();
let routeExists = new Set<string>(); // "ORIGIN-DEST"
let loadPromise: Promise<void> | null = null;

export function loadRouteCatalog(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = fetch(`${import.meta.env.BASE_URL}data/routes.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load route data: HTTP ${res.status}`);
      return res.json() as Promise<{ o: string; d: string; eq: string; a: string }[]>;
    })
    .then((raw) => {
      routesByOrigin = new Map();
      routeExists = new Set();
      for (const r of raw) {
        const route: RealRoute = {
          originIata: r.o,
          destinationIata: r.d,
          aircraftType: equipmentCodeToCategory(r.eq, r.a),
        };
        routeExists.add(`${r.o}-${r.d}`);
        const list = routesByOrigin.get(r.o) ?? [];
        list.push(route);
        routesByOrigin.set(r.o, list);
      }
    })
    .catch((err) => {
      // Non-fatal: the app still works without real-route suggestions, just without the
      // "usual destinations" shortcut and equipment auto-fill.
      // eslint-disable-next-line no-console
      console.warn('Route catalog unavailable — run `npm run data:routes`.', err);
    });
  return loadPromise;
}

/** Real, currently-scheduled non-stop destinations from this origin (by IATA code). */
export function getRealDestinationsFrom(originIata: string, limit = 8): RealRoute[] {
  return (routesByOrigin.get(originIata) ?? []).slice(0, limit);
}

export function isRealRoute(originIata: string, destinationIata: string): boolean {
  return routeExists.has(`${originIata}-${destinationIata}`);
}
