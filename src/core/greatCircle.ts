import type { GeoCoordinates } from '../types/flight';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

function angularDistanceRad(a: GeoCoordinates, b: GeoCoordinates): number {
  const lat1 = a.latitudeDeg * DEG2RAD;
  const lat2 = b.latitudeDeg * DEG2RAD;
  const dLat = lat2 - lat1;
  const dLon = (b.longitudeDeg - a.longitudeDeg) * DEG2RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Great-circle distance in kilometers between two points. */
export function greatCircleDistanceKm(a: GeoCoordinates, b: GeoCoordinates): number {
  return angularDistanceRad(a, b) * EARTH_RADIUS_KM;
}

/** Point at fraction `f` (0..1) along the great-circle path from `a` to `b`. */
export function greatCircleInterpolate(a: GeoCoordinates, b: GeoCoordinates, f: number): GeoCoordinates {
  const d = angularDistanceRad(a, b);
  if (d < 1e-9) return a;

  const lat1 = a.latitudeDeg * DEG2RAD, lon1 = a.longitudeDeg * DEG2RAD;
  const lat2 = b.latitudeDeg * DEG2RAD, lon2 = b.longitudeDeg * DEG2RAD;

  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);

  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);

  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lon = Math.atan2(y, x);
  return { latitudeDeg: lat * RAD2DEG, longitudeDeg: lon * RAD2DEG };
}

/** Samples `steps + 1` evenly spaced points along the great-circle path, for drawing the route line. */
export function sampleGreatCircle(a: GeoCoordinates, b: GeoCoordinates, steps = 64): GeoCoordinates[] {
  const points: GeoCoordinates[] = [];
  for (let i = 0; i <= steps; i++) points.push(greatCircleInterpolate(a, b, i / steps));
  return points;
}

/** Initial compass bearing (degrees, 0=north, clockwise) from `a` to `b`. */
export function initialBearingDeg(a: GeoCoordinates, b: GeoCoordinates): number {
  const lat1 = a.latitudeDeg * DEG2RAD, lat2 = b.latitudeDeg * DEG2RAD;
  const dLon = (b.longitudeDeg - a.longitudeDeg) * DEG2RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * RAD2DEG + 360) % 360;
}
