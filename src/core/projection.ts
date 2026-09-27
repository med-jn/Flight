/**
 * Azimuthal equidistant projection centered on the North Pole/Pole Star, as if the viewer
 * hovered in space directly above the pole looking down at the whole globe.
 * Radius scales linearly with colatitude: r = (colatitude/180) x outerRadius.
 */
export interface PolarMapConfig {
  centerX: number;
  centerY: number;
  outerRadiusPx: number;
}

export interface ProjectedPoint2D {
  x: number;
  y: number;
  visible: boolean;
}

const DEG2RAD = Math.PI / 180;

const GREENWICH_DOWN_OFFSET_DEG = 180;

/**
 * The dome radius is measured against the viewport's HALF-DIAGONAL, not its smaller
 * dimension. This is the fix for the map's circular edge showing up as black voids on wide
 * screens or when panning: since every corner of a rectangle is exactly half-diagonal away
 * from its center, a circle of this radius always fully covers the rectangle when centered —
 * regardless of aspect ratio. zoomScale is a direct multiplier on top of that: at
 * ZOOM_MIN_SCALE (see core/zoom.ts) the circle just barely reaches all four corners, so the
 * map always fills the screen edge-to-edge with no visible boundary.
 */
export function computeOuterRadiusPx(width: number, height: number, zoomScale: number): number {
  return (Math.hypot(width, height) / 2) * zoomScale;
}

/**
 * Projects (latitude, longitude) to a screen point — used for land, meridians, airports and
 * flight paths alike, so every layer stays perfectly aligned.
 */
export function latLonToScreen(
  latDeg: number,
  lonDeg: number,
  config: PolarMapConfig
): ProjectedPoint2D {
  const colatitudeDeg = 90 - latDeg;
  const r = (colatitudeDeg / 180) * config.outerRadiusPx;
  const lonRad = (lonDeg + GREENWICH_DOWN_OFFSET_DEG) * DEG2RAD;
  const x = config.centerX - r * Math.sin(lonRad);
  const y = config.centerY - r * Math.cos(lonRad);
  return { x, y, visible: r <= config.outerRadiusPx * 1.001 };
}

/**
 * The on-screen compass heading (degrees, clockwise, 0 = up) of "true north" as seen from a
 * given projected point. On this polar azimuthal-equidistant projection, meridians are
 * straight lines through the center, so "north" from any point is exactly the direction
 * toward the center — this is what lets us orient aircraft icons correctly.
 */
export function screenBearingToCenterDeg(p: ProjectedPoint2D, config: PolarMapConfig): number {
  const dx = config.centerX - p.x;
  const dy = config.centerY - p.y;
  return normalizeDeg(Math.atan2(dx, -dy) * (180 / Math.PI));
}

/**
 * The pan fraction (panX, panY as used by the store/renderer) that brings a given
 * (lat, lon) to the exact center of the viewport, at zero scene rotation. This works out to
 * be resolution-independent — the same fraction centers the point on any canvas size — which
 * is why it can be computed here directly with a unit-radius config, without knowing the
 * actual canvas dimensions.
 */
export function computePanForTarget(latDeg: number, lonDeg: number): { panX: number; panY: number } {
  const p = latLonToScreen(latDeg, lonDeg, { centerX: 0, centerY: 0, outerRadiusPx: 1 });
  return { panX: -p.x, panY: -p.y };
}

function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}