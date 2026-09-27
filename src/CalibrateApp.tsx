import { useEffect } from 'react';
import { useFlightStore } from './state/store';
import { MapCalibrator } from './components/MapCalibrator';

export default function CalibrateApp() {
  const isCalibrating = useFlightStore((s) => s.isCalibrating);
  const startCalibrating = useFlightStore((s) => s.startCalibrating);

  useEffect(() => { startCalibrating(); }, [startCalibrating]);

  if (!isCalibrating) {
    return <div className="calibrate-closed">Calibration tool closed. Reload this page to start a new calibration.</div>;
  }
  return <MapCalibrator />;
}
