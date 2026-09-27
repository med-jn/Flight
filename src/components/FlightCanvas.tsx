import { useEffect, useRef, useState } from 'react';
import { useFlightStore, SECONDS_PER_DAY } from '../state/store';
import { renderFlightMap, getVirtualFlightCurrentPosition, type RenderOutput, type HitTarget } from '../render/flightRenderer';
import { computeOuterRadiusPx, computePanForTarget } from '../core/projection';
import { percentToScale, clampScale } from '../core/zoom';

interface Props {
  onFrame?: (output: RenderOutput) => void;
  onSelectAirport?: (icao: string) => void;
}

const HIT_RADIUS_PX = 14;
const TAP_MAX_DURATION_MS = 350;
const TAP_MAX_MOVEMENT_PX = 6;
const CAMERA_ANIM_MS = 700;
const KEY_PAN_STEP = 0.06;

// Momentum (fling) panning: after releasing a fast drag, the map keeps gliding and decays,
// like a native map app. Velocities are tracked in screen pixels/ms during the drag.
const MOMENTUM_MIN_VELOCITY = 0.03; // px/ms below this, a release doesn't start any glide
const MOMENTUM_STOP_VELOCITY = 0.01; // px/ms below this, an ongoing glide is considered stopped
const MOMENTUM_FRICTION = 2.6; // higher = stops sooner

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface CameraAnim {
  active: boolean;
  from: { panX: number; panY: number; zoom: number };
  to: { panX: number; panY: number; zoom: number };
  start: number;
}

export function FlightCanvas({ onFrame, onSelectAirport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>(0);
  const hitTargetsRef = useRef<HitTarget[]>([]);
  const cameraAnimRef = useRef<CameraAnim>({ active: false, from: { panX: 0, panY: 0, zoom: 1 }, to: { panX: 0, panY: 0, zoom: 1 }, start: 0 });

  const pendingZoomFactorRef = useRef(1);
  const pendingPanDeltaRef = useRef({ x: 0, y: 0 });
  const momentumRef = useRef({ vx: 0, vy: 0 }); // screen px/ms

  const [tooltip, setTooltip] = useState<HitTarget | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function loop(timestamp: number) {
      if (!lastTimestampRef.current) lastTimestampRef.current = timestamp;
      const deltaSeconds = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;

      const rect = canvas!.getBoundingClientRect();
      const s0 = useFlightStore.getState();

      if (s0.pendingCameraTarget && !cameraAnimRef.current.active) {
        const target = s0.pendingCameraTarget;
        const { panX, panY } = computePanForTarget(target.lat, target.lon);
        cameraAnimRef.current = {
          active: true,
          from: { panX: s0.panX, panY: s0.panY, zoom: s0.zoomScale },
          to: { panX, panY, zoom: percentToScale(target.zoomPercent) },
          start: timestamp,
        };
        s0.clearPendingCameraTarget();
      }

      if (cameraAnimRef.current.active) {
        const anim = cameraAnimRef.current;
        const t = Math.min(1, (timestamp - anim.start) / CAMERA_ANIM_MS);
        const eased = easeOutCubic(t);
        useFlightStore.getState().setView(
          lerp(anim.from.panX, anim.to.panX, eased),
          lerp(anim.from.panY, anim.to.panY, eased),
          lerp(anim.from.zoom, anim.to.zoom, eased)
        );
        if (t >= 1) anim.active = false;
      } else {
        const manualPanRequested = pendingPanDeltaRef.current.x !== 0 || pendingPanDeltaRef.current.y !== 0;
        const manualZoomRequested = pendingZoomFactorRef.current !== 1;
        const momentumMagnitude = Math.hypot(momentumRef.current.vx, momentumRef.current.vy);

        if (manualPanRequested || manualZoomRequested) {
          momentumRef.current = { vx: 0, vy: 0 }; // fresh input always wins over any leftover glide
          if (useFlightStore.getState().followFlightId) useFlightStore.getState().setFollowFlight(null);

          if (manualZoomRequested) {
            const s = useFlightStore.getState();
            s.setZoom(clampScale(s.zoomScale * pendingZoomFactorRef.current));
            pendingZoomFactorRef.current = 1;
          }
          if (manualPanRequested) {
            const s = useFlightStore.getState();
            s.setPan(pendingPanDeltaRef.current.x, pendingPanDeltaRef.current.y);
            pendingPanDeltaRef.current = { x: 0, y: 0 };
          }
        } else if (momentumMagnitude > MOMENTUM_STOP_VELOCITY) {
          if (useFlightStore.getState().followFlightId) useFlightStore.getState().setFollowFlight(null);
          const s = useFlightStore.getState();
          const radius = computeOuterRadiusPx(rect.width, rect.height, s.zoomScale);
          const dxPx = momentumRef.current.vx * (deltaSeconds * 1000);
          const dyPx = momentumRef.current.vy * (deltaSeconds * 1000);
          s.setPan(dxPx / radius, dyPx / radius);
          const decay = Math.exp(-MOMENTUM_FRICTION * deltaSeconds);
          momentumRef.current.vx *= decay;
          momentumRef.current.vy *= decay;
        } else {
          momentumRef.current = { vx: 0, vy: 0 };
          const followId = useFlightStore.getState().followFlightId;
          if (followId) {
            const flight = useFlightStore.getState().virtualFlights.find((f) => f.id === followId);
            const pos = flight ? getVirtualFlightCurrentPosition(flight, useFlightStore.getState().date) : null;
            if (pos) {
              const { panX, panY } = computePanForTarget(pos.latitudeDeg, pos.longitudeDeg);
              const s = useFlightStore.getState();
              s.setView(panX, panY, s.zoomScale);
            } else {
              useFlightStore.getState().setFollowFlight(null);
            }
          }
        }
      }

      const state = useFlightStore.getState();
      if (state.customTimeRateDegPerSec !== null) {
        const simSecondsPerRealSecond = (state.customTimeRateDegPerSec / 360) * SECONDS_PER_DAY;
        state.setDate(new Date(state.date.getTime() + simSecondsPerRealSecond * deltaSeconds * 1000));
      } else if (state.isPlaying) {
        state.stepTime(deltaSeconds);
      }
      state.pruneExpiredVirtualFlights();

      const current = useFlightStore.getState();
      const output = renderFlightMap(ctx!, rect.width, rect.height, {
        date: current.date,
        zoomScale: current.zoomScale,
        layers: current.layers,
        selectedAirport: current.selectedAirport,
        pinnedAirportIcaos: current.pinnedAirportIcaos,
        virtualFlights: current.virtualFlights,
        liveFlights: current.liveFlights,
        sceneRotationDeg: current.sceneRotationDeg,
        panX: current.panX,
        panY: current.panY,
      });
      hitTargetsRef.current = output.hitTargets;
      onFrame?.(output);

      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const activePointers = new Map<number, { x: number; y: number }>();
    let lastPinchDist = 0;
    let lastMidpoint = { x: 0, y: 0 };
    let dragStartTime = 0;
    let dragStartClientX = 0;
    let dragStartClientY = 0;
    let dragTotalMovementPx = 0;
    // Recent single-finger move samples, used to compute a release velocity for momentum.
    let velocitySamples: { vx: number; vy: number }[] = [];
    let lastMoveTime = 0;

    function findNearestTarget(clientX: number, clientY: number): HitTarget | null {
      const rect = canvas!.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      let nearest: HitTarget | null = null;
      let nearestDist = HIT_RADIUS_PX;
      for (const t of hitTargetsRef.current) {
        const d = Math.hypot(t.x - localX, t.y - localY);
        if (d < nearestDist) { nearest = t; nearestDist = d; }
      }
      return nearest;
    }

    function pinchDistance(): number {
      const pts = [...activePointers.values()];
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
    function pinchMidpoint(): { x: number; y: number } {
      const pts = [...activePointers.values()];
      if (pts.length < 2) return { x: 0, y: 0 };
      return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }

    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      canvas!.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.pointerType !== 'mouse') setTooltip(findNearestTarget(e.clientX, e.clientY));

      if (activePointers.size === 1) {
        dragStartTime = performance.now();
        dragStartClientX = e.clientX;
        dragStartClientY = e.clientY;
        dragTotalMovementPx = 0;
        lastMidpoint = { x: e.clientX, y: e.clientY };
        velocitySamples = [];
        lastMoveTime = dragStartTime;
        momentumRef.current = { vx: 0, vy: 0 }; // a new touch always stops any ongoing glide
      } else if (activePointers.size === 2) {
        lastPinchDist = pinchDistance();
        lastMidpoint = pinchMidpoint();
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!activePointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') setTooltip(findNearestTarget(e.clientX, e.clientY));
        return;
      }
      e.preventDefault();
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const rect = canvas!.getBoundingClientRect();
      const radius = computeOuterRadiusPx(rect.width, rect.height, useFlightStore.getState().zoomScale);

      if (activePointers.size >= 2) {
        const dist = pinchDistance();
        if (lastPinchDist > 0 && dist > 0) pendingZoomFactorRef.current *= dist / lastPinchDist;
        lastPinchDist = dist;
        const mid = pinchMidpoint();
        pendingPanDeltaRef.current.x += (mid.x - lastMidpoint.x) / radius;
        pendingPanDeltaRef.current.y += (mid.y - lastMidpoint.y) / radius;
        lastMidpoint = mid;
        return;
      }

      const dxPx = e.clientX - lastMidpoint.x;
      const dyPx = e.clientY - lastMidpoint.y;
      dragTotalMovementPx = Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY);
      pendingPanDeltaRef.current.x += dxPx / radius;
      pendingPanDeltaRef.current.y += dyPx / radius;

      const now = performance.now();
      const dt = now - lastMoveTime;
      if (dt > 0) {
        velocitySamples.push({ vx: dxPx / dt, vy: dyPx / dt });
        if (velocitySamples.length > 5) velocitySamples.shift();
      }
      lastMoveTime = now;
      lastMidpoint = { x: e.clientX, y: e.clientY };
    }

    function onPointerUp(e: PointerEvent) {
      try { canvas!.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      activePointers.delete(e.pointerId);
      if (e.pointerType !== 'mouse') setTooltip(null);

      const durationMs = performance.now() - dragStartTime;
      const isTap = durationMs < TAP_MAX_DURATION_MS && dragTotalMovementPx < TAP_MAX_MOVEMENT_PX;
      if (isTap && activePointers.size === 0) {
        const target = findNearestTarget(e.clientX, e.clientY);
        if (target?.kind === 'airport') onSelectAirport?.(target.refId);
      }

      if (!isTap && activePointers.size === 0 && velocitySamples.length > 0) {
        const avgVx = velocitySamples.reduce((s, v) => s + v.vx, 0) / velocitySamples.length;
        const avgVy = velocitySamples.reduce((s, v) => s + v.vy, 0) / velocitySamples.length;
        if (Math.hypot(avgVx, avgVy) > MOMENTUM_MIN_VELOCITY) {
          momentumRef.current = { vx: avgVx, vy: avgVy };
        }
      }

      if (activePointers.size === 1) {
        const [remaining] = activePointers.values();
        lastMidpoint = remaining;
      } else if (activePointers.size === 0) {
        lastPinchDist = 0;
      }
    }

    function onPointerLeave() { setTooltip(null); }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      momentumRef.current = { vx: 0, vy: 0 };
      pendingZoomFactorRef.current *= e.deltaY > 0 ? 0.9 : 1.1;
    }

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      switch (e.key) {
        case 'ArrowLeft': pendingPanDeltaRef.current.x -= KEY_PAN_STEP; break;
        case 'ArrowRight': pendingPanDeltaRef.current.x += KEY_PAN_STEP; break;
        case 'ArrowUp': pendingPanDeltaRef.current.y -= KEY_PAN_STEP; break;
        case 'ArrowDown': pendingPanDeltaRef.current.y += KEY_PAN_STEP; break;
        case '+': case '=': pendingZoomFactorRef.current *= 1.12; break;
        case '-': pendingZoomFactorRef.current *= 0.88; break;
        default: return;
      }
      e.preventDefault();
    }

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onSelectAirport]);

  return (
    <div className="flight-canvas-wrap">
      <canvas ref={canvasRef} className="flight-canvas" tabIndex={0} />
      {tooltip && (
        <div className="hover-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div className="hover-tooltip-name">{tooltip.name}</div>
          <div className="hover-tooltip-detail">{tooltip.detail}</div>
        </div>
      )}
    </div>
  );
}