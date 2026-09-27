import { useEffect, useState } from 'react';
import { FlightCanvas } from './components/FlightCanvas';
import { ControlsPanel } from './components/ControlsPanel';
import { InfoCard } from './components/InfoCard';
import { loadAirportCatalog, getAirportByIcao } from './core/airportCatalog';
import { loadRouteCatalog } from './core/routeCatalog';
import { loadEarthImage } from './core/earthImage';
import { useFlightStore } from './state/store';
import type { RenderOutput } from './render/flightRenderer';

export default function App() {
  const [, setOutput] = useState<RenderOutput | null>(null);
  const selectedAirport = useFlightStore((s) => s.selectedAirport);
  const setSelectedAirport = useFlightStore((s) => s.setSelectedAirport);

  useEffect(() => {
    loadAirportCatalog().then(() => loadRouteCatalog());
    loadEarthImage();
  }, []);

  function handleSelectByIcao(icao: string) {
    const a = getAirportByIcao(icao);
    if (a) setSelectedAirport(a);
  }

  return (
    <div className="app-root">
      <ControlsPanel />
      <div className="stage">
        <FlightCanvas onFrame={setOutput} onSelectAirport={handleSelectByIcao} />
        <InfoCard airport={selectedAirport} />
      </div>
    </div>
  );
}
