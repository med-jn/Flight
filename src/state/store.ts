import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  loadSavedCalibration,
  saveCalibration,
  clearCalibration,
  type MapCalibration,
} from '../core/mapCalibration';
import { clampScale, maxPanFraction } from '../core/zoom';
import { FLIGHT_FADE_MS } from '../core/constants';
import type { Airport, VirtualFlight, LiveFlightState } from '../types/flight';

export const SPEED_MULTIPLIERS = [0, 60, 3600, 86400, 86400 * 7];
export const SPEED_LABELS = ['Paused', '1 min/s', '1 hour/s', '1 day/s', '1 week/s'];
export const SECONDS_PER_DAY = 86400;

// Default view: 70% zoom, centered on the Middle East. Pan is a resolution-independent
// fraction (see computePanForTarget), so this can be baked in as a constant rather than
// computed once a canvas element exists.
const DEFAULT_ZOOM_SCALE = 8.21; // ~70% on the log zoom scale (see core/zoom.ts)
const DEFAULT_PAN = { panX: -0.2475, panY: -0.2475 }; // centered near 27°N, 45°E (Middle East)

export interface LayerToggles {
  land: boolean;
  terminator: boolean;
  meridians: boolean;
  liveFlights: boolean;
  virtualFlights: boolean;
  labels: boolean;
}

export interface CameraTarget {
  lat: number;
  lon: number;
  zoomPercent: number;
}

/** Keeps the camera locked onto pan (radial clamp), so the dome's edge can never be panned
 * into view regardless of zoom or direction — see maxPanFraction in core/zoom.ts for the math. */
function clampPan(panX: number, panY: number, zoomScale: number): { panX: number; panY: number } {
  const maxFraction = maxPanFraction(zoomScale);
  const mag = Math.hypot(panX, panY);
  if (mag <= maxFraction || mag === 0) return { panX, panY };
  const k = maxFraction / mag;
  return { panX: panX * k, panY: panY * k };
}

interface FlightState {
  date: Date;
  isPlaying: boolean;
  speedIndex: number;
  customTimeRateDegPerSec: number | null;

  zoomScale: number;
  panX: number;
  panY: number;
  sceneRotationDeg: number;
  /** A pending "fly to" request the canvas should animate toward, then clear. */
  pendingCameraTarget: CameraTarget | null;
  /** When set, the canvas keeps re-centering on this virtual flight's live position every
   * frame while it's airborne. Cleared automatically on landing, or if the person manually
   * pans/zooms (see FlightCanvas), so it never fights their input. */
  followFlightId: string | null;

  layers: LayerToggles;

  selectedAirport: Airport | null;
  pinnedAirportIcaos: string[];
  virtualFlights: VirtualFlight[];
  liveFlights: LiveFlightState[];

  calibration: MapCalibration | null;
  isCalibrating: boolean;

  setDate: (d: Date) => void;
  stepTime: (deltaSeconds: number) => void;
  togglePlay: () => void;
  play: () => void;
  resetToNow: () => void;
  setSpeedIndex: (i: number) => void;
  setCustomTimeRate: (v: number | null) => void;

  setZoom: (z: number) => void;
  setPan: (dxFraction: number, dyFraction: number) => void;
  /** Directly sets pan + zoom (still clamped) — used by the camera fly-to/follow animation. */
  setView: (panX: number, panY: number, zoomScale: number) => void;
  resetView: () => void;
  setSceneRotation: (deg: number) => void;
  resetSceneRotation: () => void;
  requestFlyTo: (lat: number, lon: number, zoomPercent: number) => void;
  clearPendingCameraTarget: () => void;
  setFollowFlight: (id: string | null) => void;

  toggleLayer: (key: keyof LayerToggles) => void;

  setSelectedAirport: (a: Airport | null) => void;
  pinAirport: (icao: string) => void;
  unpinAirport: (icao: string) => void;
  addVirtualFlight: (f: VirtualFlight) => void;
  removeVirtualFlight: (id: string) => void;
  /** Removes virtual flights whose post-arrival fade window has fully elapsed. */
  pruneExpiredVirtualFlights: () => void;
  setLiveFlights: (flights: LiveFlightState[]) => void;

  startCalibrating: () => void;
  cancelCalibrating: () => void;
  finishCalibrating: (cal: MapCalibration) => void;
  updateCalibration: (patch: Partial<MapCalibration>) => void;
  resetCalibration: () => void;
}

export const useFlightStore = create<FlightState>()(
  persist(
    (set, get) => ({
      date: new Date(),
      isPlaying: true,
      speedIndex: 1,
      customTimeRateDegPerSec: null,

      zoomScale: DEFAULT_ZOOM_SCALE,
      panX: DEFAULT_PAN.panX,
      panY: DEFAULT_PAN.panY,
      sceneRotationDeg: 0,
      pendingCameraTarget: null,
      followFlightId: null,

      layers: {
        land: true,
        terminator: true,
        meridians: false,
        liveFlights: false, // deferred — not implemented yet
        virtualFlights: true,
        labels: true,
      },

      selectedAirport: null,
      pinnedAirportIcaos: [],
      virtualFlights: [],
      liveFlights: [],

      calibration: loadSavedCalibration(),
      isCalibrating: false,

      setDate: (d) => set({ date: d }),
      stepTime: (deltaSeconds) => {
        const { date, speedIndex } = get();
        const added = deltaSeconds * SPEED_MULTIPLIERS[speedIndex] * 1000;
        if (added !== 0) set({ date: new Date(date.getTime() + added) });
      },
      togglePlay: () =>
        set((s) => {
          if (s.customTimeRateDegPerSec !== null) {
            return { customTimeRateDegPerSec: null, isPlaying: false };
          }
          const next = !s.isPlaying;
          return { isPlaying: next, speedIndex: next && s.speedIndex === 0 ? 2 : s.speedIndex };
        }),
      play: () =>
        set((s) => ({
          isPlaying: true,
          customTimeRateDegPerSec: null,
          speedIndex: s.speedIndex === 0 ? 2 : s.speedIndex,
        })),
      resetToNow: () => set({ date: new Date() }),
      setSpeedIndex: (i) => set({ speedIndex: i }),
      setCustomTimeRate: (v) =>
        set((s) => ({ customTimeRateDegPerSec: v, isPlaying: v !== null ? false : s.isPlaying })),

      setZoom: (z) => {
        const clamped = clampScale(z);
        const { panX, panY } = get();
        set({ zoomScale: clamped, ...clampPan(panX, panY, clamped) });
      },
      setPan: (dxFraction, dyFraction) =>
        set((s) => clampPan(s.panX + dxFraction, s.panY + dyFraction, s.zoomScale)),
      setView: (panX, panY, zoomScale) => {
        const clampedZoom = clampScale(zoomScale);
        set({ zoomScale: clampedZoom, ...clampPan(panX, panY, clampedZoom) });
      },
      resetView: () => set({ panX: DEFAULT_PAN.panX, panY: DEFAULT_PAN.panY, zoomScale: DEFAULT_ZOOM_SCALE }),
      setSceneRotation: (deg) => {
        let d = deg % 360;
        if (d < 0) d += 360;
        set({ sceneRotationDeg: d });
      },
      resetSceneRotation: () => set({ sceneRotationDeg: 0 }),
      requestFlyTo: (lat, lon, zoomPercent) => set({ pendingCameraTarget: { lat, lon, zoomPercent } }),
      clearPendingCameraTarget: () => set({ pendingCameraTarget: null }),
      setFollowFlight: (id) => set({ followFlightId: id }),

      toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),

      setSelectedAirport: (a) => set({ selectedAirport: a }),
      pinAirport: (icao) =>
        set((s) => (s.pinnedAirportIcaos.includes(icao)
          ? s
          : { pinnedAirportIcaos: [...s.pinnedAirportIcaos, icao] })),
      unpinAirport: (icao) =>
        set((s) => ({ pinnedAirportIcaos: s.pinnedAirportIcaos.filter((c) => c !== icao) })),
      addVirtualFlight: (f) => set((s) => ({ virtualFlights: [...s.virtualFlights, f] })),
      removeVirtualFlight: (id) =>
        set((s) => ({
          virtualFlights: s.virtualFlights.filter((f) => f.id !== id),
          followFlightId: s.followFlightId === id ? null : s.followFlightId,
        })),
      pruneExpiredVirtualFlights: () => {
        const now = get().date.getTime();
        set((s) => {
          const kept = s.virtualFlights.filter((f) => {
            const arr = new Date(f.arrivalTime).getTime();
            return now - arr < FLIGHT_FADE_MS;
          });
          const stillThere = kept.some((f) => f.id === s.followFlightId);
          return { virtualFlights: kept, followFlightId: stillThere ? s.followFlightId : null };
        });
      },
      setLiveFlights: (flights) => set({ liveFlights: flights }),

      startCalibrating: () => set({ isCalibrating: true }),
      cancelCalibrating: () => set({ isCalibrating: false }),
      finishCalibrating: (cal) => {
        saveCalibration(cal);
        set({ calibration: cal, isCalibrating: false });
      },
      updateCalibration: (patch) =>
        set((s) => {
          if (!s.calibration) return {};
          const next = { ...s.calibration, ...patch };
          saveCalibration(next);
          return { calibration: next };
        }),
      resetCalibration: () => {
        clearCalibration();
        set({ calibration: null });
      },
    }),
    {
      name: 'flight-clock-settings',
      version: 4,
      migrate: (persisted: any) => {
        if (persisted && !Array.isArray(persisted.pinnedAirportIcaos)) persisted.pinnedAirportIcaos = [];
        return persisted;
      },
      partialize: (s) => ({
        zoomScale: s.zoomScale,
        panX: s.panX,
        panY: s.panY,
        layers: s.layers,
        sceneRotationDeg: s.sceneRotationDeg,
        speedIndex: s.speedIndex,
        virtualFlights: s.virtualFlights,
        pinnedAirportIcaos: s.pinnedAirportIcaos,
      }),
    }
  )
);