// A polygon is a list of rings (the first is the outer boundary, any further rings are holes),
// and each ring is a list of [lon, lat] points — exactly what build-coastlines.mjs produces.
export type Ring = [number, number][];
export type Polygon = Ring[];

let polygons: Polygon[] = [];
let loadPromise: Promise<Polygon[]> | null = null;

/** Loads public/data/coastlines.json once. Safe to call multiple times — later calls just
 * return the same in-flight/completed promise. */
export function loadCoastlines(): Promise<Polygon[]> {
  if (loadPromise) return loadPromise;
  loadPromise = fetch(`${import.meta.env.BASE_URL}data/coastlines.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load coastline data: HTTP ${res.status}`);
      return res.json() as Promise<Polygon[]>;
    })
    .then((data) => {
      polygons = data;
      return polygons;
    })
    .catch((err) => {
      // Non-fatal: the app still works without the vector coastlines (falling back to
      // whatever land layer is available), just without this data until the script is run.
      // eslint-disable-next-line no-console
      console.warn('Coastline data unavailable — run `npm run data:coastlines`.', err);
      return [];
    });
  return loadPromise;
}

export function isCoastlinesLoaded(): boolean {
  return polygons.length > 0;
}

export function getCoastlinePolygons(): Polygon[] {
  return polygons;
}