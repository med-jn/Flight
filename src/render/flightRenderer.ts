import type { Airport, VirtualFlight, LiveFlightState, AircraftCategory, GeoCoordinates } from '../types/flight';
import type { LayerToggles } from '../state/store';
import {
  latLonToScreen,
  computeOuterRadiusPx,
  screenBearingToCenterDeg,
  type PolarMapConfig,
  type ProjectedPoint2D,
} from '../core/projection';
import { drawNightShading, getSolarAltitudeDeg } from '../core/terminator';
import { getSubsolarPoint } from '../core/sunPosition';
import { getWorldMapImage, isWorldMapImageLoaded, loadWorldMapImage } from '../core/worldMapImage';
import { sampleGreatCircle, greatCircleInterpolate, initialBearingDeg } from '../core/greatCircle';
import { getAirportByIcao } from '../core/airportCatalog';
import { FLIGHT_FADE_MS } from '../core/constants';

export interface RenderInput {
  date: Date;
  zoomScale: number;
  layers: LayerToggles;
  selectedAirport: Airport | null;
  pinnedAirportIcaos: string[];
  virtualFlights: VirtualFlight[];
  liveFlights: LiveFlightState[];
  sceneRotationDeg?: number;
  panX?: number;
  panY?: number;
}

export interface HitTarget {
  x: number;
  y: number;
  name: string;
  detail: string;
  kind: 'airport' | 'virtual' | 'live';
  refId: string;
}

export interface RenderOutput {
  hitTargets: HitTarget[];
}

const SPACE_COLOR = '#05070d';
const AIRPORT_COLOR = '#0a0a0c';
const AIRPORT_SELECTED_COLOR = '#38bdf8';
const AIRPORT_DOT_RADIUS = 3;
const AIRPORT_DOT_RADIUS_SELECTED = 5;
const LABEL_FONT_PX = 11;
const LINE_WIDTH = 1.5;

/**
 * One straightforward render pass per frame — no caching layer needed anymore. The land is a
 * single pre-baked image (see core/worldMapImage.ts), so drawing it is just one drawImage call
 * regardless of zoom/pan, exactly as cheap as the original photo-based map was.
 */
export function renderFlightMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: RenderInput
): RenderOutput {
  const {
    date, zoomScale, layers, selectedAirport, pinnedAirportIcaos,
    virtualFlights, liveFlights, sceneRotationDeg = 0, panX = 0, panY = 0,
  } = input;

  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadiusPx = computeOuterRadiusPx(width, height, zoomScale);
  const config: PolarMapConfig = { centerX, centerY, outerRadiusPx };
  const panXpx = panX * outerRadiusPx;
  const panYpx = panY * outerRadiusPx;

  const sub = getSubsolarPoint(date);

  ctx.fillStyle = SPACE_COLOR;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, outerRadiusPx, 0, Math.PI * 2);
  ctx.clip();

  ctx.save();
  ctx.translate(panXpx, panYpx);
  ctx.translate(centerX, centerY);
  ctx.rotate((sceneRotationDeg * Math.PI) / 180);
  ctx.translate(-centerX, -centerY);

  if (layers.land) {
    loadWorldMapImage();
    if (isWorldMapImageLoaded()) drawWorldMapImage(ctx, config);
  }

  if (layers.terminator) {
    drawNightShading(ctx, sub.lat, sub.lon, config);
  }

  if (layers.meridians) drawMeridians(ctx, config, layers.labels);

  const hitTargets: HitTarget[] = [];

  if (layers.virtualFlights) {
    virtualFlights.forEach((f) => drawVirtualFlight(ctx, f, date, sub, config, hitTargets));
  }
  if (layers.liveFlights) {
    liveFlights.forEach((f) => drawLiveFlight(ctx, f, sub, config, hitTargets));
  }

  const airportsToShow = new Set(pinnedAirportIcaos);
  if (selectedAirport) airportsToShow.add(selectedAirport.icao);
  drawAirports(ctx, airportsToShow, selectedAirport, config, layers.labels, hitTargets);

  ctx.restore();
  ctx.restore();

  return {
    hitTargets: applySceneTransformToTargets(hitTargets, centerX, centerY, sceneRotationDeg, panXpx, panYpx),
  };
}

/** The pre-baked map was generated with the pole exactly at the image's center and its radius
 * exactly half its width (see build-world-map.mjs) — so placing it is just this, no
 * calibration data needed at all. */
function drawWorldMapImage(ctx: CanvasRenderingContext2D, config: PolarMapConfig) {
  const img = getWorldMapImage();
  if (!img) return;
  const size = config.outerRadiusPx * 2;
  ctx.drawImage(img, config.centerX - config.outerRadiusPx, config.centerY - config.outerRadiusPx, size, size);
}

function drawMeridians(ctx: CanvasRenderingContext2D, config: PolarMapConfig, showLabels: boolean) {
  const count = 12;
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = LINE_WIDTH;
  for (let i = 0; i < count; i++) {
    const lon = (360 / count) * i - 180;
    ctx.beginPath();
    for (let colat = 0; colat <= 180; colat += 4) {
      const p = latLonToScreen(90 - colat, lon, config);
      if (colat === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    if (showLabels) {
      const edge = latLonToScreen(0, lon, config);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.font = `${LABEL_FONT_PX}px system-ui, sans-serif`;
      ctx.fillText(`${lon}°`, edge.x + 3, edge.y - 3);
    }
  }
  ctx.restore();
}

export function getVirtualFlightCurrentPosition(flight: VirtualFlight, date: Date): GeoCoordinates | null {
  const origin = getAirportByIcao(flight.originIcao);
  const dest = getAirportByIcao(flight.destinationIcao);
  if (!origin || !dest) return null;

  const dep = new Date(flight.departureTime).getTime();
  const arr = new Date(flight.arrivalTime).getTime();
  const now = date.getTime();
  if (now < dep || now > arr || arr <= dep) return null;

  const f = (now - dep) / (arr - dep);
  return greatCircleInterpolate(
    { latitudeDeg: origin.latitudeDeg, longitudeDeg: origin.longitudeDeg },
    { latitudeDeg: dest.latitudeDeg, longitudeDeg: dest.longitudeDeg },
    f
  );
}

function drawAirports(
  ctx: CanvasRenderingContext2D, icaosToShow: Set<string>, selected: Airport | null,
  config: PolarMapConfig, showLabels: boolean, hitTargets: HitTarget[]
) {
  ctx.save();
  icaosToShow.forEach((icao) => {
    const a = getAirportByIcao(icao);
    if (!a) return;
    const p = latLonToScreen(a.latitudeDeg, a.longitudeDeg, config);
    if (!p.visible) return;

    const isSelected = selected?.icao === a.icao;
    const r = isSelected ? AIRPORT_DOT_RADIUS_SELECTED : AIRPORT_DOT_RADIUS;
    ctx.fillStyle = isSelected ? AIRPORT_SELECTED_COLOR : AIRPORT_COLOR;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (isSelected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (showLabels) {
      ctx.fillStyle = isSelected ? AIRPORT_SELECTED_COLOR : 'rgba(226, 232, 240, 0.85)';
      ctx.font = `${LABEL_FONT_PX}px system-ui, sans-serif`;
      ctx.fillText(a.iata, p.x + 6, p.y - 5);
    }
    hitTargets.push({
      x: p.x, y: p.y, name: `${a.iata} — ${a.name}`, detail: `${a.city}, ${a.country}`,
      kind: 'airport', refId: a.icao,
    });
  });
  ctx.restore();
}

function computeNightFactor(lat: number, lon: number, sub: { lat: number; lon: number }): number {
  const alt = getSolarAltitudeDeg(lat, lon, sub.lat, sub.lon);
  if (alt >= 0) return 0;
  if (alt <= -10) return 1;
  return -alt / 10;
}

function drawVirtualFlight(
  ctx: CanvasRenderingContext2D, flight: VirtualFlight, date: Date, sub: { lat: number; lon: number },
  config: PolarMapConfig, hitTargets: HitTarget[]
) {
  const origin = getAirportByIcao(flight.originIcao);
  const dest = getAirportByIcao(flight.destinationIcao);
  if (!origin || !dest) return;

  const a = { latitudeDeg: origin.latitudeDeg, longitudeDeg: origin.longitudeDeg };
  const b = { latitudeDeg: dest.latitudeDeg, longitudeDeg: dest.longitudeDeg };

  const dep = new Date(flight.departureTime).getTime();
  const arr = new Date(flight.arrivalTime).getTime();
  const now = date.getTime();
  if (now < dep) return;

  const timeSinceArrival = now - arr;
  const fadeAlpha = timeSinceArrival <= 0 ? 1 : Math.max(0, 1 - timeSinceArrival / FLIGHT_FADE_MS);
  if (fadeAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = fadeAlpha;

  const path = sampleGreatCircle(a, b, 72);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
  ctx.lineWidth = LINE_WIDTH;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  path.forEach((pt, i) => {
    const p = latLonToScreen(pt.latitudeDeg, pt.longitudeDeg, config);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  if (timeSinceArrival <= 0) {
    const f = Math.min(1, Math.max(0, (now - dep) / (arr - dep)));
    const pos = greatCircleInterpolate(a, b, f);
    const p = latLonToScreen(pos.latitudeDeg, pos.longitudeDeg, config);
    if (p.visible) {
      const lookaheadPos = greatCircleInterpolate(a, b, Math.min(1, f + 0.002));
      const bearing = initialBearingDeg(pos, lookaheadPos);
      const nightFactor = computeNightFactor(pos.latitudeDeg, pos.longitudeDeg, sub);
      drawAircraftIcon(ctx, p, bearing, config, 1, flight.aircraftType, nightFactor);
      hitTargets.push({
        x: p.x, y: p.y,
        name: flight.callsign ?? `${origin.iata} → ${dest.iata}`,
        detail: `${flight.aircraftType} · ${Math.round(f * 100)}% of the way`,
        kind: 'virtual', refId: flight.id,
      });
    }
  } else {
    const p = latLonToScreen(dest.latitudeDeg, dest.longitudeDeg, config);
    if (p.visible) {
      const shrink = 1 - 0.4 * Math.min(1, timeSinceArrival / FLIGHT_FADE_MS);
      const nightFactor = computeNightFactor(dest.latitudeDeg, dest.longitudeDeg, sub);
      drawAircraftIcon(ctx, p, 0, config, shrink, flight.aircraftType, nightFactor);
    }
  }

  ctx.restore();
}

function drawLiveFlight(
  ctx: CanvasRenderingContext2D, flight: LiveFlightState, sub: { lat: number; lon: number },
  config: PolarMapConfig, hitTargets: HitTarget[]
) {
  const p = latLonToScreen(flight.latitudeDeg, flight.longitudeDeg, config);
  if (!p.visible) return;
  const nightFactor = computeNightFactor(flight.latitudeDeg, flight.longitudeDeg, sub);
  drawAircraftIcon(ctx, p, flight.headingDeg ?? 0, config, 1, 'narrowbody', nightFactor);
  hitTargets.push({
    x: p.x, y: p.y,
    name: flight.callsign?.trim() || flight.icao24.toUpperCase(),
    detail: flight.onGround ? 'On ground' : `${Math.round((flight.altitudeM ?? 0) * 3.281)} ft`,
    kind: 'live', refId: flight.icao24,
  });
}

interface AircraftProfile { sizeScale: number; wingScale: number; color: string; }

const AIRCRAFT_PROFILES: Record<AircraftCategory, AircraftProfile> = {
  narrowbody: { sizeScale: 1.0, wingScale: 1.0, color: '#38bdf8' },
  widebody: { sizeScale: 1.3, wingScale: 1.25, color: '#818cf8' },
  regional: { sizeScale: 0.75, wingScale: 0.85, color: '#34d399' },
  private: { sizeScale: 0.6, wingScale: 0.6, color: '#f472b6' },
  cargo: { sizeScale: 1.15, wingScale: 1.05, color: '#f59e0b' },
};

function buildPlanePath(wingScale: number): [number, number][] {
  const rightSide: [number, number][] = [
    [1, -6], [1, -2], [7 * wingScale, 1], [1.6, 2], [1.6, 6], [3.2 * wingScale, 8.5], [0.8, 7.2],
  ];
  const leftSide: [number, number][] = rightSide.slice().reverse().map(([x, y]) => [-x, y]);
  return [[0, -10], ...rightSide, [0, 9], ...leftSide];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mixColor(hex: string, towardHex: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(towardHex);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * A small "glowing" light point. Deliberately NOT using ctx.shadowBlur here — that property
 * renders inconsistently (and can smear into long streaks) under rotation transforms on some
 * browsers/GPUs, which is exactly the elongated red/green bar artifact reported. Two flat
 * circles (a faint wide halo + a solid core) fake the same glow look cheaply and reliably.
 */
function drawGlowDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number, radius = 1.1) {
  const a = Math.min(1, Math.max(0, alpha));
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = a * 0.3;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const AIRCRAFT_BASE_SCALE = 1.9;

function drawAircraftIcon(
  ctx: CanvasRenderingContext2D, p: ProjectedPoint2D, headingDeg: number,
  config: PolarMapConfig, extraScale: number, category: AircraftCategory, nightFactor = 0
) {
  const profile = AIRCRAFT_PROFILES[category];
  const localNorthDeg = screenBearingToCenterDeg(p, config);
  const rotationDeg = localNorthDeg + headingDeg;
  const scale = AIRCRAFT_BASE_SCALE * profile.sizeScale * extraScale;
  const path = buildPlanePath(profile.wingScale);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.scale(scale, scale);

  ctx.fillStyle = nightFactor > 0 ? mixColor(profile.color, '#12131a', nightFactor * 0.5) : profile.color;
  ctx.beginPath();
  path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(5, 7, 13, 0.6)';
  ctx.lineWidth = 0.4;
  ctx.stroke();

  if (nightFactor > 0.03) {
    const wingTipX = 7 * profile.wingScale;
    drawGlowDot(ctx, -wingTipX, 1, '#ff3b3b', nightFactor);
    drawGlowDot(ctx, wingTipX, 1, '#22c55e', nightFactor);
    drawGlowDot(ctx, 0, 9, '#f8fafc', nightFactor * 0.9, 0.8);

    const blinkPhase = (Date.now() % 1100) / 1100;
    if (blinkPhase < 0.12) drawGlowDot(ctx, 0, 1.5, '#ffffff', nightFactor, 1.5);
  }

  ctx.restore();
}

function applySceneTransformToTargets(
  targets: HitTarget[], cx: number, cy: number, rotationDeg: number, panXpx: number, panYpx: number
): HitTarget[] {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return targets.map((t) => {
    const dx = t.x - cx;
    const dy = t.y - cy;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return { ...t, x: cx + rx + panXpx, y: cy + ry + panYpx };
  });
}