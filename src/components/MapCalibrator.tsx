import { useRef, useState } from 'react';
import { X, Check, RotateCcw, Copy, ClipboardCheck } from 'lucide-react';
import { useFlightStore } from '../state/store';
import { exportCalibrationAsCode, type PixelPoint, type MapCalibration } from '../core/mapCalibration';

type StepKey = 'poleP' | 'cancerP' | 'equatorP' | 'capricornP' | 'greenwichP';

const STEPS: { key: StepKey; title: string; hint: string; color: string }[] = [
  { key: 'poleP', title: 'North Pole', hint: 'Click exactly on the North Pole in the image', color: '#38bdf8' },
  { key: 'cancerP', title: 'Tropic of Cancer', hint: 'Click any point exactly on the Tropic of Cancer', color: '#facc15' },
  { key: 'equatorP', title: 'Equator', hint: 'Click any point exactly on the equator', color: '#4ade80' },
  { key: 'capricornP', title: 'Tropic of Capricorn', hint: 'Click any point exactly on the Tropic of Capricorn', color: '#fb923c' },
  { key: 'greenwichP', title: 'Greenwich meridian', hint: 'Click any point on the 0° meridian, between the pole and the edge', color: '#f472b6' },
];

const IMAGE_SRC = `${import.meta.env.BASE_URL}images/earth.jpeg`;

export function MapCalibrator() {
  const cancelCalibrating = useFlightStore((s) => s.cancelCalibrating);
  const finishCalibrating = useFlightStore((s) => s.finishCalibrating);
  const existing = useFlightStore((s) => s.calibration);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [points, setPoints] = useState<Partial<Record<StepKey, PixelPoint>>>({});
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [copied, setCopied] = useState(false);

  const currentStep = STEPS[stepIndex];
  const done = stepIndex >= STEPS.length;

  function handleImageLoad() {
    const img = imgRef.current;
    if (img) setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (done) return;
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || naturalSize.w === 0) return;

    const containerRect = container.getBoundingClientRect();
    const scale = Math.min(containerRect.width / naturalSize.w, containerRect.height / naturalSize.h);
    const displayedW = naturalSize.w * scale;
    const displayedH = naturalSize.h * scale;
    const offsetX = (containerRect.width - displayedW) / 2;
    const offsetY = (containerRect.height - displayedH) / 2;

    const clickX = e.clientX - containerRect.left - offsetX;
    const clickY = e.clientY - containerRect.top - offsetY;
    if (clickX < 0 || clickY < 0 || clickX > displayedW || clickY > displayedH) return;

    const naturalX = clickX / scale;
    const naturalY = clickY / scale;

    setPoints((p) => ({ ...p, [currentStep.key]: { x: naturalX, y: naturalY } }));
    setStepIndex((i) => i + 1);
  }

  function toDisplayPoint(p: PixelPoint) {
    const container = containerRef.current;
    if (!container || naturalSize.w === 0) return { x: 0, y: 0 };
    const containerRect = container.getBoundingClientRect();
    const scale = Math.min(containerRect.width / naturalSize.w, containerRect.height / naturalSize.h);
    const displayedW = naturalSize.w * scale;
    const displayedH = naturalSize.h * scale;
    const offsetX = (containerRect.width - displayedW) / 2;
    const offsetY = (containerRect.height - displayedH) / 2;
    return { x: offsetX + p.x * scale, y: offsetY + p.y * scale };
  }

  function buildCalibration(): MapCalibration | null {
    if (!points.poleP || !points.cancerP || !points.equatorP || !points.capricornP || !points.greenwichP) {
      return null;
    }
    return {
      imageNaturalWidth: naturalSize.w,
      imageNaturalHeight: naturalSize.h,
      poleP: points.poleP,
      cancerP: points.cancerP,
      equatorP: points.equatorP,
      capricornP: points.capricornP,
      greenwichP: points.greenwichP,
      mirrored: existing?.mirrored ?? false,
      rotationNudgeDeg: existing?.rotationNudgeDeg ?? 0,
    };
  }

  function handleConfirm() {
    const cal = buildCalibration();
    if (cal) finishCalibrating(cal);
  }

  function handleCopy() {
    const cal = buildCalibration() ?? existing;
    if (!cal) return;
    const text = exportCalibrationAsCode(cal);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        },
        () => window.prompt('Copy this text manually and send it to your developer:', text)
      );
    } else {
      window.prompt('Copy this text manually and send it to your developer:', text);
    }
  }

  function restart() {
    setPoints({});
    setStepIndex(0);
  }

  const canCopy = done || !!existing;

  return (
    <div className="calibrator-overlay">
      <div className="calibrator-header">
        <div className="calibrator-title">
          {done ? 'Review the points, then confirm' : `Step ${stepIndex + 1} of ${STEPS.length}: ${currentStep.title}`}
        </div>
        <div className="calibrator-actions">
          {canCopy && (
            <button
              type="button" className="icon-btn"
              title="Copy calibration data (to make it the permanent default)"
              onClick={handleCopy}
            >
              {copied ? <ClipboardCheck size={18} /> : <Copy size={18} />}
            </button>
          )}
          <button type="button" className="icon-btn" title="Start over" onClick={restart}>
            <RotateCcw size={18} />
          </button>
          {done && (
            <button type="button" className="icon-btn active" title="Confirm (this device only)" onClick={handleConfirm}>
              <Check size={18} />
            </button>
          )}
          <button type="button" className="icon-btn" title="Cancel" onClick={cancelCalibrating}>
            <X size={18} />
          </button>
        </div>
      </div>

      {!done && <div className="calibrator-hint">{currentStep.hint}</div>}
      {done && (
        <div className="calibrator-hint">
          Press the copy icon 📋 above and send the text to your developer so it becomes the
          permanent default everyone sees, or the ✓ icon to save it on this device only for a
          quick test.
        </div>
      )}

      <div className="calibrator-canvas" ref={containerRef} onClick={handleClick}>
        <img ref={imgRef} src={IMAGE_SRC} alt="Earth map" onLoad={handleImageLoad} draggable={false} />
        {STEPS.map(({ key, color }) => {
          const p = points[key];
          if (!p) return null;
          const dp = toDisplayPoint(p);
          return (
            <div
              key={key}
              className="calibrator-marker"
              style={{ left: dp.x, top: dp.y, borderColor: color, background: `${color}55` }}
            />
          );
        })}
      </div>
    </div>
  );
}
