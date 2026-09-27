import Fuse from 'fuse.js';
import type { Airport } from '../types/flight';

let airports: Airport[] = [];
let byIcao = new Map<string, Airport>();
let byIata = new Map<string, Airport>();
let fuse: Fuse<Airport> | null = null;
let loadPromise: Promise<Airport[]> | null = null;

export function loadAirportCatalog(): Promise<Airport[]> {
  if (loadPromise) return loadPromise;
  loadPromise = fetch(`${import.meta.env.BASE_URL}data/airports.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load airport data: HTTP ${res.status}`);
      return res.json() as Promise<Airport[]>;
    })
    .then((data) => {
      airports = data;
      byIcao = new Map(data.map((a) => [a.icao, a]));
      byIata = new Map(data.map((a) => [a.iata, a]));
      fuse = new Fuse(data, {
        keys: [
          { name: 'iata', weight: 3 },
          { name: 'icao', weight: 2 },
          { name: 'name', weight: 2 },
          { name: 'city', weight: 1.5 },
          { name: 'country', weight: 1 },
        ],
        threshold: 0.32,
        ignoreLocation: true,
      });
      return airports;
    });
  return loadPromise;
}

export function isAirportCatalogLoaded(): boolean {
  return airports.length > 0;
}

export function getAirportByIcao(icao: string): Airport | undefined {
  return byIcao.get(icao.toUpperCase());
}

export function getAirportByIata(iata: string): Airport | undefined {
  return byIata.get(iata.toUpperCase());
}

export function getAllAirports(): Airport[] {
  return airports;
}

export function getInternationalAirports(): Airport[] {
  return airports.filter((a) => a.type === 'large_airport');
}

export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim();
  if (!q || !fuse) return [];
  return fuse.search(q, { limit }).map((r) => r.item);
}
