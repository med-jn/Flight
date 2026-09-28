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

// Real, professionally-designed top-down aircraft silhouettes from the FlightAware/dump1090
// project (open source, MIT/BSD-style license, widely reused across the ADS-B community —
// e.g. tar1090, VirtualRadar). Each has two layered paths: a main silhouette fill and a
// darker detail/shading path drawn on top, exactly as the source SVGs intend.
interface AircraftShape { width: number; height: number; fillPath: string; detailPath: string; }

const AIRCRAFT_SHAPES: Record<AircraftCategory, AircraftShape> = {
  narrowbody: {
    width: 25, height: 26,
    fillPath: 'M12.51,25.75c-.26,0-.74-.71-.86-1.41l-3.33.86L8,25.29l.08-1.41.11-.07c1.13-.68,2.68-1.64,3.2-2-.37-1.06-.51-3.92-.43-8.52v0L8,13.31C5.37,14.12,1.2,15.39,1,15.5a.5.5,0,0,1-.21,0,.52.52,0,0,1-.49-.45,1,1,0,0,1,.52-1l1.74-.91c1.36-.71,3.22-1.69,4.66-2.43a4,4,0,0,1,0-.52c0-.69,0-1,0-1.14l.25-.13H7.16A1.07,1.07,0,0,1,8.24,7.73,1.12,1.12,0,0,1,9.06,8a1.46,1.46,0,0,1,.26.87L9.08,9h.25c0,.14,0,.31,0,.58l1.52-.84c0-1.48,0-7.06,1.1-8.25a.74.74,0,0,1,1.13,0c1.15,1.19,1.13,6.78,1.1,8.25l1.52.84c0-.32,0-.48,0-.58l.25-.13H15.7A1.46,1.46,0,0,1,16,8a1.11,1.11,0,0,1,.82-.28,1.06,1.06,0,0,1,1.08,1.16V9c0,.19,0,.48,0,1.17a4,4,0,0,1,0,.52c1.75.9,4.4,2.29,5.67,3l.73.38a.9.9,0,0,1,.5,1,.55.55,0,0,1-.5.47h0l-.11,0c-.28-.11-4.81-1.49-7.16-2.2H14.06v0c.09,4.6-.06,7.46-.43,8.52.52.33,2.07,1.29,3.2,2l.11.07L17,25.29l-.33-.09-3.33-.86c-.12.7-.6,1.41-.86,1.41h0Z',
    detailPath: 'M12.51.5C13.93.5,14,7,13.93,8.91c.3.16,1.64.91,2,1.1,0-.6,0-.85,0-1s0-.09,0-.13a1.18,1.18,0,0,1,.19-.7A.88.88,0,0,1,16.78,8h0a.82.82,0,0,1,.83.91s0,.07,0,.13,0,.44,0,1.17a3.21,3.21,0,0,1-.06.66c2.33,1.19,6.51,3.39,6.56,3.42.59.3.4,1,.11,1h-.07c-.37-.14-7.18-2.21-7.18-2.21l-3.18,0c0,.22.22,7.56-.48,8.91,0,0,2,1.26,3.39,2.08l.06.93L13.15,24a2.14,2.14,0,0,1-.64,1.47A2.14,2.14,0,0,1,11.87,24L8.26,25,8.31,24c1.38-.82,3.39-2.08,3.39-2.08-.7-1.35-.48-8.69-.48-8.91L8,13.06S1.17,15.13.86,15.27l-.11,0c-.32,0-.43-.73.14-1S5.13,12,7.46,10.85a3.21,3.21,0,0,1-.06-.66c0-.73,0-1,0-1.17s0-.09,0-.13A.82.82,0,0,1,8.24,8h0a.88.88,0,0,1,.65.21,1.18,1.18,0,0,1,.19.7s0,.07,0,.13,0,.39,0,1c.36-.19,1.71-.94,2-1.1C11.05,7,11.09.5,12.51.5m0-.5a1,1,0,0,0-.74.34c-1.16,1.2-1.2,6.3-1.18,8.28L10,8.93l-.46.25V8.91a1.68,1.68,0,0,0-.33-1.06,1.34,1.34,0,0,0-1-.36,1.31,1.31,0,0,0-1.33,1.4V9h0v0c0,.16,0,.46,0,1.14,0,.13,0,.26,0,.38l-4.5,2.35-1.74.91A1.2,1.2,0,0,0,0,15.15a.77.77,0,0,0,.73.64.74.74,0,0,0,.31-.07c.29-.12,4.35-1.35,7-2.17l2.6,0c-.1,5.54.17,7.46.38,8.2-.64.4-2,1.25-3,1.86l-.22.13,0,.26-.06.93,0,.81.7-.31,3.06-.79c.19.67.63,1.35,1,1.35s.86-.68,1-1.35l3.06.79.7.31,0-.81L17.2,24l0-.26L17,23.6c-1-.61-2.4-1.47-3-1.86.21-.74.48-2.66.38-8.2l2.6,0c2.72.83,6.81,2.07,7.07,2.18a.68.68,0,0,0,.25,0,.79.79,0,0,0,.74-.67,1.15,1.15,0,0,0-.63-1.29l-.71-.37c-1.23-.65-3.78-2-5.53-2.88,0-.12,0-.25,0-.38,0-.67,0-1,0-1.14h0V8.92a1.32,1.32,0,0,0-1.32-1.44,1.35,1.35,0,0,0-1,.36,1.67,1.67,0,0,0-.33,1V9h0v.22L15,8.93l-.57-.32c0-2,0-7.08-1.18-8.28A1,1,0,0,0,12.51,0Z',
  },
  widebody: {
    width: 28, height: 29,
    fillPath: 'M9,28.35c0-.16-.17-1,.23-1.36.65-.59,2.82-2.38,3.4-2.86-.51-1.33-.59-5.15-.57-8.22L10,16,.25,19v-.34a1.78,1.78,0,0,1,.82-1.5l7.78-5.07a4.87,4.87,0,0,1-.51-3l0-.22.23,0h2.26l0,.22a8.32,8.32,0,0,1,0,1.81l1.21-.81c0-6.79.18-9.58,1.91-9.87,1.7.14,2,3,2,9.85L17.3,11a8.3,8.3,0,0,1,0-1.8l0-.22h2.51v.24a4.87,4.87,0,0,1-.51,3l7.66,5a1.77,1.77,0,0,1,.8,1.5V19L18,16l-2-.06c0,3.06-.06,6.88-.57,8.21a28.87,28.87,0,0,1,3.5,3A2,2,0,0,1,19,28.34l-.05.31L14.6,26.71c-.14,1.85-.41,1.85-.6,1.85s-.47,0-.6-1.84L9,28.66Z',
    detailPath: 'M14,.5c1.43.13,1.69,3,1.69,9.73l2.06,1.39a5.43,5.43,0,0,1-.24-2.39h2s.26,2.07-.62,3c0,0,7.84,5.12,7.9,5.15a1.54,1.54,0,0,1,.68,1.28l-9.46-3-2.35-.08c0,.23.13,7.12-.62,8.54a34.46,34.46,0,0,1,3.59,3.08,1.86,1.86,0,0,1,.1,1l-4.39-2c-.07,1.16-.21,2-.38,2s-.31-.81-.38-2l-4.4,2s-.17-.84.16-1.13c.74-.67,3.54-3,3.54-3-.75-1.43-.62-8.31-.62-8.54L10,15.73l-9.46,3a1.54,1.54,0,0,1,.68-1.28c.06,0,8-5.24,8-5.24-.88-1-.62-3-.62-3h2a5.43,5.43,0,0,1-.24,2.39l1.91-1.28c0-6.74.17-9.5,1.7-9.76M14,0h-.06C12,.33,11.81,3,11.8,10l-.66.44a9.35,9.35,0,0,0,0-1.33l0-.45h-3v.49A5.4,5.4,0,0,0,8.52,12L.93,17A2.06,2.06,0,0,0,0,18.69v.68l.64-.2L10,16.23l1.77-.06c0,4.05.15,6.7.53,7.88-.73.6-2.67,2.21-3.28,2.76a1.82,1.82,0,0,0-.31,1.59l.12.6.56-.24,3.76-1.67c.14,1.43.39,1.72.82,1.72s.68-.29.82-1.73l3.75,1.67.58.25.11-.62A2.23,2.23,0,0,0,19.09,27a25.35,25.35,0,0,0-3.42-3c.37-1.19.55-3.83.52-7.87l1.77.06,9.39,2.94.64.2v-.68A2,2,0,0,0,27,17l-7.42-4.84A5.45,5.45,0,0,0,20,9.21l0-.45-.45,0H17.06l0,.45a9.35,9.35,0,0,0,0,1.33L16.18,10c0-7.21-.34-9.81-2.14-10Z',
  },
  regional: {
    width: 19, height: 16,
    fillPath: 'M9.5,15.75c-.21,0-.34-.17-.41-.51l-2.88.23v-.27c0-.78,0-1.11.28-1.13L9,13.1c-.31-1.86-.55-5-.59-5.55l-.08-.09H6.08L.25,6.54v-1A.43.43,0,0,1,.67,5l3.75-.27L5,4.45V3.53H4.73V2.7a.35.35,0,0,1,.34-.35h.07c.12-.52.26-.83.54-.83s.42.31.53.83h.07a.35.35,0,0,1,.34.35v.83H6.36v1l2-.08C8.42.81,9.09.25,9.49.25s1.09.55,1.12,4.21l2,.08v-1h-.25V2.7a.35.35,0,0,1,.34-.35h.07c.12-.52.26-.83.53-.83s.42.31.54.83h.07a.35.35,0,0,1,.34.35v.83H14v.92l.57.32L18.32,5a.42.42,0,0,1,.43.46v1L13,7.46H10.71l-.08.09c0,.56-.27,3.68-.59,5.55l2.46,1c.28,0,.28.35.28,1.13v.27l-2.88-.23C9.84,15.58,9.71,15.75,9.5,15.75Z',
    detailPath: 'M9.51.5c.08,0,.86.11.86,4.2l2.51.1V3.28h-.26V2.7a.1.1,0,0,1,.09-.1H13c.08-.4.2-.83.33-.83s.26.43.34.83h.27a.1.1,0,0,1,.09.1v.57h-.25V4.6h0l.75.42,3.79.28h0c.06,0,.17,0,.17.22v.82l-5.58.89H10.6l-.21.24s-.26,3.8-.63,5.81l2.71,1.05h0s.06.08.06.88L9.7,15s0,.53-.2.53S9.3,15,9.3,15l-2.84.22c0-.8,0-.88.06-.88h0l2.71-1.05c-.36-2-.63-5.81-.63-5.81L8.4,7.21H6.08L.49,6.33V5.51c0-.19.11-.22.17-.22h0L4.49,5l.75-.42V3.28H5V2.7a.1.1,0,0,1,.09-.1h.27c.08-.4.2-.83.34-.83s.25.43.33.83h.27a.1.1,0,0,1,.09.1v.57H6.12V4.8l2.51-.1c0-4.09.78-4.2.86-4.2h0m0-.5h0c-.22,0-.61.14-.9.89a10.72,10.72,0,0,0-.43,3.33l-1.53.06v-.5h.25V2.7a.6.6,0,0,0-.46-.59c-.11-.42-.3-.85-.73-.85s-.63.43-.73.85a.6.6,0,0,0-.46.59V3.78h.25V4.3l-.4.22L.71,4.79h0A.67.67,0,0,0,0,5.51V6.76l.42.07L6,7.71H8.14c.06.8.27,3.44.55,5.22l-2.23.87H6.31L6.17,14c-.16.16-.2.32-.2,1.24v.54l.53,0,2.41-.19a.6.6,0,0,0,1.19,0l2.41.19.53,0v-.54c0-.76,0-1.33-.47-1.38l-2.24-.87c.28-1.78.49-4.42.55-5.22H13l5.58-.89L19,6.76V5.51a.67.67,0,0,0-.67-.72h-.05l-3.63-.27-.4-.22V3.78h.25V2.7a.6.6,0,0,0-.46-.59c-.11-.42-.3-.85-.73-.85s-.62.43-.73.85a.6.6,0,0,0-.46.59V3.78h.25v.5l-1.53-.06C10.81,1.45,10.37,0,9.53,0h0Z',
  },
  private: {
    width: 18, height: 24,
    fillPath: 'M9.44,23c-.1.6-.35.6-.44.6s-.34,0-.44-.6l-3,.67V22.6A.54.54,0,0,1,6,22.05l2.38-1.12L8,19.33H6.69l0-.2a8.23,8.23,0,0,1-.14-3.85l.06-.18H7.73V13.19h-2L.26,14.29v-.93c0-.28.07-.46.22-.53l7.25-3.6V3.85A4.47,4.47,0,0,1,8.83.49L9,.34l.17.15a4.47,4.47,0,0,1,1.1,3.36V9.23l7.25,3.6c.14.07.22.25.22.53v.93l-5.51-1.1h-2V15.1h1.17l.06.18a8.24,8.24,0,0,1-.15,3.84l0,.2H10l-.36,1.6,2.43,1.14a.52.52,0,0,1,.35.53v1.08Z',
    detailPath: 'M9,.68a4.25,4.25,0,0,1,1,3.16V9.39l7.4,3.67s.07,0,.07.3V14l-5.2-1H10v2.42h1.24a8,8,0,0,1-.15,3.72H9.79l-.45,2L12,22.3a.28.28,0,0,1,.2.3v.76l-3-.66s0,.66-.21.66-.21-.66-.21-.66l-3,.66V22.6a.28.28,0,0,1,.2-.3l2.62-1.23-.45-2H6.9a8,8,0,0,1-.15-3.72H8V12.93H5.71L.52,14v-.62c0-.26.07-.3.07-.3L8,9.39V3.85A4.25,4.25,0,0,1,9,.68M9,0,8.66.3A4.73,4.73,0,0,0,7.47,3.85V9.07L.36,12.6c-.16.08-.36.28-.36.76V14.6l.62-.12,5.15-1h1.7v1.4H6.36l-.11.36a8.49,8.49,0,0,0,.14,4l.09.4H7.79l.27,1.2-2.21,1a.79.79,0,0,0-.53.78V24l.63-.14,2.42-.54c.12.37.33.55.63.55s.51-.19.63-.55l2.42.54.63.14V22.6a.79.79,0,0,0-.53-.78l-2.21-1,.27-1.2h1.31l.09-.4a8.49,8.49,0,0,0,.14-4l-.11-.36H10.53v-1.4h1.7l5.15,1,.62.12V13.36c0-.48-.2-.68-.36-.76L10.53,9.07V3.85A4.73,4.73,0,0,0,9.34.3L9,0Z',
  },
  cargo: {
    width: 28, height: 30,
    fillPath: 'M14,29.62c-.23,0-.52-.16-.71-1.33L8.82,29.58V28l3.56-3.52c-.41-1.51-.4-7.57-.4-9.11L8.46,16.59,1.27,20.76l-1,1.68,0-.91c0-2.28.23-2.45.3-2.52s.59-.51,3.5-3.09A10.47,10.47,0,0,1,4,13l0-.22.23,0H6.16v.23a11.63,11.63,0,0,1,0,1.26c.74-.68,1.36-1.28,1.69-1.61a9.54,9.54,0,0,1-.16-3.15l0-.22.23-.05H9.87v.23a11.49,11.49,0,0,1,0,1.31l.87-.84c.67-.66,1.06-1,1.27-1.19,0-6.24.53-8.46,2-8.46,1.23,0,2,1.42,2,8.46.21.17.59.53,1.27,1.19l.88.85a11.45,11.45,0,0,1,0-1.32V9.19h2.18v.24a9.53,9.53,0,0,1-.15,3.18c.33.32.95.93,1.69,1.61a11.5,11.5,0,0,1,0-1.27v-.23H24V13a10.49,10.49,0,0,1-.1,3L27.4,19c.09.09.28.26.32,2.54l0,.91-1-1.68L19.5,16.57,16,15.34c0,1.53.07,7.49-.39,9.11L19.18,28v1.61l-4.46-1.29C14.52,29.46,14.23,29.62,14,29.62Z',
    detailPath: 'M14,.49c1.08,0,1.75,1.61,1.75,8.34.27.14,2.06,2,2.73,2.54a9,9,0,0,1-.11-1.94h1.7a9.4,9.4,0,0,1-.19,3.25c.37.37,1.26,1.24,2.3,2.17a9.25,9.25,0,0,1-.1-1.89h1.7A10.3,10.3,0,0,1,23.66,16c1.81,1.61,3.57,3.16,3.6,3.18a11.25,11.25,0,0,1,.22,2.35l-.57-1-7.28-4.22L15.76,15s.15,8-.41,9.52l3.59,3.55v1.18L14.51,28c-.11.85-.3,1.4-.51,1.4s-.4-.55-.51-1.39L9.06,29.26V28.07l3.59-3.55c-.51-1.28-.43-9.52-.43-9.52L8.37,16.36,1.1,20.58l-.57,1a11.25,11.25,0,0,1,.22-2.35S2.53,17.61,4.35,16a10.32,10.32,0,0,1-.12-3h1.7a9.29,9.29,0,0,1-.1,1.88c1-.93,1.93-1.8,2.3-2.17a9.43,9.43,0,0,1-.19-3.24h1.7a9,9,0,0,1-.11,1.93C10.21,10.8,12,9,12.25,8.83c0-6.73.62-8.34,1.75-8.34M14,0c-1.65,0-2.23,2.17-2.24,8.59-.22.19-.57.52-1.19,1.13l-.43.42c0-.4,0-.7,0-.73l0-.46H7.45v.49a10.3,10.3,0,0,0,.12,3.11c-.27.26-.67.65-1.15,1.1,0-.38,0-.67,0-.7l0-.46H3.74v.49a11.18,11.18,0,0,0,.07,2.88L.49,18.76h0l-.06.06c-.14.13-.33.31-.38,2.69l0,1.83.94-1.56.51-.84L8.58,16.8l3.16-1.12a65.92,65.92,0,0,0,.37,8.69L8.72,27.72l-.15.14V30l.65-.28,3.87-1.11c.18.88.46,1.26.9,1.26s.73-.39.91-1.27l3.86,1.12.65.28V27.87l-.15-.14-3.38-3.35a58.1,58.1,0,0,0,.36-8.69l3.16,1.11,7.13,4.14.51.84L28,23.35l0-1.83c0-2.38-.24-2.56-.38-2.69l-.06-.06h0L24.2,15.84A11.19,11.19,0,0,0,24.27,13v-.49H21.61l0,.46s0,.32,0,.7c-.48-.45-.88-.84-1.15-1.1a10.29,10.29,0,0,0,.13-3.1V8.94H17.9l0,.46s0,.33,0,.74l-.44-.43c-.62-.61-1-.94-1.19-1.13C16.23,2.25,15.63,0,14,0Z',
  },
};

// On-screen height (px) at extraScale=1 for a narrowbody; other categories scale relative to
// their real proportions via SIZE_MULTIPLIER, and this ignores zoomScale entirely (fixed
// screen size, matching the rest of the app's markers).
const BASE_ICON_HEIGHT_PX = 34;
const SIZE_MULTIPLIER: Record<AircraftCategory, number> = {
  narrowbody: 1.0, widebody: 1.3, regional: 0.85, private: 0.7, cargo: 1.2,
};

const DAY_COLOR = '#f4f5f7';
const NIGHT_COLOR = '#8b929c';
const DETAIL_DAY_COLOR = '#3a3f47';
const DETAIL_NIGHT_COLOR = '#22252b';

const path2DCache = new Map<string, Path2D>();
function getPath2D(d: string): Path2D {
  let p = path2DCache.get(d);
  if (!p) { p = new Path2D(d); path2DCache.set(d, p); }
  return p;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Linearly blends `hex` toward `towardHex` by t (0 = hex, 1 = towardHex). */
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
 * browsers/GPUs. Two flat circles (a faint wide halo + a solid core) fake the same glow look
 * cheaply and reliably.
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

function drawAircraftIcon(
  ctx: CanvasRenderingContext2D, p: ProjectedPoint2D, headingDeg: number,
  config: PolarMapConfig, extraScale: number, category: AircraftCategory, nightFactor = 0
) {
  const shape = AIRCRAFT_SHAPES[category];
  const localNorthDeg = screenBearingToCenterDeg(p, config);
  const rotationDeg = localNorthDeg + headingDeg;
  const targetHeight = BASE_ICON_HEIGHT_PX * SIZE_MULTIPLIER[category] * extraScale;
  const svgScale = targetHeight / shape.height;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.scale(svgScale, svgScale);
  ctx.translate(-shape.width / 2, -shape.height / 2);

  ctx.fillStyle = mixColor(DAY_COLOR, NIGHT_COLOR, nightFactor);
  ctx.fill(getPath2D(shape.fillPath));
  ctx.fillStyle = mixColor(DETAIL_DAY_COLOR, DETAIL_NIGHT_COLOR, nightFactor);
  ctx.fill(getPath2D(shape.detailPath));

  if (nightFactor > 0.03) {
    const r = 1.1 / svgScale;
    drawGlowDot(ctx, shape.width * 0.08, shape.height * 0.42, '#ff3b3b', nightFactor, r);
    drawGlowDot(ctx, shape.width * 0.92, shape.height * 0.42, '#22c55e', nightFactor, r);
    drawGlowDot(ctx, shape.width * 0.5, shape.height * 0.96, '#f8fafc', nightFactor * 0.9, r * 0.8);
    const blinkPhase = (Date.now() % 1100) / 1100;
    if (blinkPhase < 0.12) drawGlowDot(ctx, shape.width * 0.5, shape.height * 0.3, '#ffffff', nightFactor, r * 1.4);
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