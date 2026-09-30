import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { FlightCanvas } from './components/FlightCanvas';
import { ControlsPanel } from './components/ControlsPanel';
import { InfoCard } from './components/InfoCard';
import { loadAirportCatalog, getAirportByIcao } from './core/airportCatalog';
import { loadRouteCatalog } from './core/routeCatalog';
import { useFlightStore } from './state/store';
import type { RenderOutput } from './render/flightRenderer';

export default function App() {
  const [, setOutput] = useState<RenderOutput | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const selectedAirport = useFlightStore((s) => s.selectedAirport);
  const setSelectedAirport = useFlightStore((s) => s.setSelectedAirport);

  useEffect(() => {
    loadAirportCatalog().then(() => loadRouteCatalog());
  }, []);

  function handleSelectByIcao(icao: string) {
    const a = getAirportByIcao(icao);
    if (a) setSelectedAirport(a);
  }

  return (
    <div className="app-root">
      {/* On mobile the map is the only full-screen surface; controls open as a separate
          overlay instead of sharing space with the canvas (which was causing touches meant
          for the map to land on panel inputs and pop the keyboard). On desktop this button is
          hidden and the panel is always visible via CSS. */}
      <button
        type="button"
        className="mobile-controls-toggle"
        onClick={() => setControlsOpen((v) => !v)}
        aria-label="Toggle controls"
      >
        <SlidersHorizontal size={20} />
      </button>

      <div className={`controls-panel-wrap ${controlsOpen ? 'open' : ''}`}>
        <button type="button" className="mobile-controls-close" onClick={() => setControlsOpen(false)} aria-label="Close controls">
          <X size={20} />
        </button>
        <ControlsPanel />
      </div>

      <div className="stage">
        <FlightCanvas onFrame={setOutput} onSelectAirport={handleSelectByIcao} />
        <InfoCard airport={selectedAirport} />
      </div>
    </div>
  );
}