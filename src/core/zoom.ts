// At MIN scale, the dome's radius is now DELIBERATELY a bit larger than the exact
// corner-covering radius (which would be 1.0) — a pure 1.0 gives ZERO pan slack at minimum
// zoom (any pan at all would expose a corner), which felt like panning was completely broken.
// 1.2 trades a little bit of "extra dome you'll never really see" for real, usable pan room
// even at the most zoomed-out setting.
export const ZOOM_MIN_SCALE = 1.2;
export const ZOOM_MAX_SCALE = 20;

const RATIO = ZOOM_MAX_SCALE / ZOOM_MIN_SCALE;
const LOG_RATIO = Math.log(RATIO);

export function scaleToPercent(scale: number): number {
  const clamped = Math.min(ZOOM_MAX_SCALE, Math.max(ZOOM_MIN_SCALE, scale));
  return (Math.log(clamped / ZOOM_MIN_SCALE) / LOG_RATIO) * 100;
}

export function percentToScale(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return ZOOM_MIN_SCALE * Math.pow(RATIO, clamped / 100);
}

export function clampScale(scale: number): number {
  return Math.min(ZOOM_MAX_SCALE, Math.max(ZOOM_MIN_SCALE, scale));
}

/** Maximum allowed pan magnitude (fraction of outer radius) at a given zoom — see the
 * explanation in the previous version; unchanged math, just a more forgiving MIN above. */
export function maxPanFraction(zoomScale: number): number {
  return Math.max(0, 1 - 1 / zoomScale);
}