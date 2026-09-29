import { useEffect, useMemo, useState } from 'react';
import {
  Play, Pause, Plus, Minus, RotateCcw, Globe2, Contrast, Route, Radar, Tag, Trash2,
  PlaneTakeoff, MapPin, X, ShieldAlert, BadgeCheck, Crosshair, LandPlot,
} from 'lucide-react';
import { useFlightStore, SPEED_LABELS, type LayerToggles } from '../state/store';
import { AirportSearch } from './AirportSearch';
import { FlightRouteSearch } from './FlightRouteSearch';
import { getAirportByIcao } from '../core/airportCatalog';
import { greatCircleDistanceKm } from '../core/greatCircle';
import { isRealRoute, getRealDestinationsFrom } from '../core/routeCatalog';
import { AIRCRAFT_RANGE_KM, isRouteFeasible, suggestFeasibleCategory } from '../core/aircraftRange';
import { suggestAlternates, suggestNearbyAirports } from '../core/alternateAirports';
import { estimateTypicalDurationHours } from '../core/constants';
import { scaleToPercent } from '../core/zoom';
import { AIRCRAFT_CATEGORY_LABELS, type Airport, type AircraftCategory } from '../types/flight';

type TabKey = 'layers' | 'airports' | 'flights';

const LAYER_ICONS: Record<keyof LayerToggles, typeof Globe2> = {
  land: Globe2, terminator: Contrast, meridians: Route, liveFlights: Radar,
  virtualFlights: PlaneTakeoff, labels: Tag,
};

const LAYER_TITLES: Record<keyof LayerToggles, string> = {
  land: 'Map', terminator: 'Day / night', meridians: 'Meridians',
  liveFlights: 'Live flights (soon)', virtualFlights: 'Virtual flights', labels: 'Labels',
};

export function ControlsPanel() {
  const [tab, setTab] = useState<TabKey>('flights');

  // ---- Store state (grouped by concern, not by tab, since a couple of pieces are used in
  // the always-visible toolbar regardless of which tab is open) ----
  const zoomScale = useFlightStore((s) => s.zoomScale);
  const setZoom = useFlightStore((s) => s.setZoom);
  const resetView = useFlightStore((s) => s.resetView);
  const isPlaying = useFlightStore((s) => s.isPlaying);
  const togglePlay = useFlightStore((s) => s.togglePlay);
  const play = useFlightStore((s) => s.play);
  const speedIndex = useFlightStore((s) => s.speedIndex);
  const setSpeedIndex = useFlightStore((s) => s.setSpeedIndex);
  const resetToNow = useFlightStore((s) => s.resetToNow);

  const layers = useFlightStore((s) => s.layers);
  const toggleLayer = useFlightStore((s) => s.toggleLayer);

  const pinnedAirportIcaos = useFlightStore((s) => s.pinnedAirportIcaos);
  const pinAirport = useFlightStore((s) => s.pinAirport);
  const unpinAirport = useFlightStore((s) => s.unpinAirport);
  const setSelectedAirport = useFlightStore((s) => s.setSelectedAirport);
  const requestFlyTo = useFlightStore((s) => s.requestFlyTo);

  const virtualFlights = useFlightStore((s) => s.virtualFlights);
  const addVirtualFlight = useFlightStore((s) => s.addVirtualFlight);
  const removeVirtualFlight = useFlightStore((s) => s.removeVirtualFlight);
  const followFlightId = useFlightStore((s) => s.followFlightId);
  const setFollowFlight = useFlightStore((s) => s.setFollowFlight);

  // ---- Local "launch a flight" form state ----
  const [origin, setOrigin] = useState<Airport | null>(null);
  const [destination, setDestination] = useState<Airport | null>(null);
  const [departure, setDeparture] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  const [aircraftType, setAircraftType] = useState<AircraftCategory>('narrowbody');
  const [alternateIcaos, setAlternateIcaos] = useState<string[]>([]);

  const distanceKm = useMemo(
    () => (origin && destination
      ? greatCircleDistanceKm(
          { latitudeDeg: origin.latitudeDeg, longitudeDeg: origin.longitudeDeg },
          { latitudeDeg: destination.latitudeDeg, longitudeDeg: destination.longitudeDeg }
        )
      : null),
    [origin, destination]
  );

  const realRoute = origin && destination ? isRealRoute(origin.iata, destination.iata) : false;
  const feasible = distanceKm !== null ? isRouteFeasible(distanceKm, aircraftType) : true;

  useEffect(() => {
    if (!origin || !destination) {
      setAlternateIcaos([]);
      setDuration(null);
      return;
    }
    const d = greatCircleDistanceKm(
      { latitudeDeg: origin.latitudeDeg, longitudeDeg: origin.longitudeDeg },
      { latitudeDeg: destination.latitudeDeg, longitudeDeg: destination.longitudeDeg }
    );
    const match = getRealDestinationsFrom(origin.iata).find((r) => r.destinationIata === destination.iata);
    setAircraftType(match ? match.aircraftType : suggestFeasibleCategory(d));
    setDuration(estimateTypicalDurationHours(d));
    const altCount = Math.min(3, Math.max(1, Math.round(d / 3000)));
    setAlternateIcaos(suggestAlternates(origin, destination, altCount).map((a) => a.icao));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.icao, destination?.icao]);

  const nearbyAirports = useMemo(
    () => (origin && destination ? suggestNearbyAirports(origin, destination, 8) : []),
    [origin?.icao, destination?.icao]
  );

  function handleAddAlternate(icao: string) {
    setAlternateIcaos((prev) => (prev.includes(icao) ? prev : [...prev, icao]));
  }

  function focusAirport(a: Airport) {
    setSelectedAirport(a);
    requestFlyTo(a.latitudeDeg, a.longitudeDeg, 100);
  }

  const canLaunch = !!origin && !!destination && feasible && alternateIcaos.length > 0 && duration != null;

  function handleLaunch() {
    if (!origin || !destination || !canLaunch || duration == null) return;
    const dep = departure ? new Date(departure) : new Date(useFlightStore.getState().date);
    const arr = new Date(dep.getTime() + duration * 3600 * 1000);
    const id = crypto.randomUUID();
    addVirtualFlight({
      id,
      originIcao: origin.icao,
      destinationIcao: destination.icao,
      departureTime: dep.toISOString(),
      arrivalTime: arr.toISOString(),
      callsign: `${origin.iata}${destination.iata}`,
      aircraftType,
      distanceKm: distanceKm ?? 0,
      alternateIcaos,
      isRealRoute: realRoute,
    });
    pinAirport(origin.icao);
    pinAirport(destination.icao);
    alternateIcaos.forEach(pinAirport);
    if (!departure) play();
    setFollowFlight(id);
    requestFlyTo(origin.latitudeDeg, origin.longitudeDeg, 85);

    setOrigin(null);
    setDestination(null);
    setDeparture('');
    setDuration(null);
    setAlternateIcaos([]);
  }

  return (
    <div className="controls-panel">
      {/* Always visible, regardless of tab — these apply to the map itself at any time. */}
      <div className="panel-toolbar">
        <div className="toolbar-group">
          <button type="button" className="icon-btn" onClick={() => setZoom(zoomScale * 0.85)}>
            <Minus size={15} />
          </button>
          <span className="toolbar-value">{Math.round(scaleToPercent(zoomScale))}%</span>
          <button type="button" className="icon-btn" onClick={() => setZoom(zoomScale * 1.15)}>
            <Plus size={15} />
          </button>
          <button type="button" className="icon-btn" onClick={resetView} title="Reset view">
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="toolbar-group">
          <button type="button" className="icon-btn" onClick={togglePlay}>
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <select value={speedIndex} onChange={(e) => setSpeedIndex(Number(e.target.value))}>
            {SPEED_LABELS.map((label, i) => (
              <option key={label} value={i}>{label}</option>
            ))}
          </select>
          <button type="button" className="text-btn" onClick={resetToNow}>Now</button>
        </div>
      </div>

      <nav className="panel-tabs">
        <button type="button" className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}>
          <Globe2 size={15} /> Layers
        </button>
        <button type="button" className={tab === 'airports' ? 'active' : ''} onClick={() => setTab('airports')}>
          <MapPin size={15} /> Airports
        </button>
        <button type="button" className={tab === 'flights' ? 'active' : ''} onClick={() => setTab('flights')}>
          <PlaneTakeoff size={15} /> Flights
          {virtualFlights.length > 0 && <span className="tab-count">{virtualFlights.length}</span>}
        </button>
      </nav>

      <div className="panel-body">
        {tab === 'layers' && (
          <section className="panel-section">
            <div className="layer-grid">
              {(Object.keys(layers) as (keyof LayerToggles)[]).map((key) => {
                const Icon = LAYER_ICONS[key];
                const disabled = key === 'liveFlights';
                return (
                  <button
                    key={key} type="button" disabled={disabled}
                    className={`layer-btn ${layers[key] ? 'active' : ''}`}
                    onClick={() => toggleLayer(key)}
                    title={disabled ? 'Live flight tracking is not implemented yet' : LAYER_TITLES[key]}
                  >
                    <Icon size={16} />
                    <span>{LAYER_TITLES[key]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'airports' && (
          <section className="panel-section">
            <h2>Find an airport</h2>
            <AirportSearch
              placeholder="Search any airport to pin it on the map…"
              onSelect={(a) => { pinAirport(a.icao); focusAirport(a); }}
            />
            {pinnedAirportIcaos.length === 0 ? (
              <p className="empty-hint">No airports pinned yet — search above to add one. It'll stay on the map.</p>
            ) : (
              <ul className="flight-list">
                {pinnedAirportIcaos.map((icao) => {
                  const a = getAirportByIcao(icao);
                  return (
                    <li key={icao}>
                      <span><MapPin size={12} style={{ marginRight: 4 }} />{a ? `${a.iata} — ${a.name}` : icao}</span>
                      <button type="button" className="icon-btn" onClick={() => unpinAirport(icao)} title="Unpin">
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {tab === 'flights' && (
          <>
            <section className="panel-section">
              <h2>Launch a virtual flight</h2>
              <p className="hint-line">Type to search, ↑↓ to move, Enter to pick — origin first, then destination.</p>
              <FlightRouteSearch
                origin={origin}
                destination={destination}
                onPickOrigin={(a) => { setOrigin(a); focusAirport(a); }}
                onPickDestination={(a) => { setDestination(a); focusAirport(a); }}
                onClearOrigin={() => { setOrigin(null); setDestination(null); }}
                onClearDestination={() => setDestination(null)}
              />

              {origin && destination && distanceKm !== null && (
                <div className={`route-badge ${realRoute ? 'real' : 'estimated'}`}>
                  <BadgeCheck size={13} />
                  {realRoute ? 'Real scheduled non-stop route' : 'No scheduled route — estimated'}
                  <span className="route-distance">{Math.round(distanceKm)} km</span>
                </div>
              )}

              {origin && destination && (
                <div className="flight-config-card">
                  <label className="field">
                    Aircraft
                    <select value={aircraftType} onChange={(e) => setAircraftType(e.target.value as AircraftCategory)}>
                      {Object.entries(AIRCRAFT_CATEGORY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label} (max {AIRCRAFT_RANGE_KM[value as AircraftCategory].toLocaleString()} km)
                        </option>
                      ))}
                    </select>
                  </label>

                  {!feasible && distanceKm !== null && (
                    <div className="warning-banner">
                      <ShieldAlert size={14} />
                      {Math.round(distanceKm)} km exceeds this aircraft's {AIRCRAFT_RANGE_KM[aircraftType].toLocaleString()} km
                      range — can't be flown non-stop. Pick a longer-range aircraft or a closer destination.
                    </div>
                  )}

                  <div className="field-row">
                    <label className="field">
                      Departure
                      <input type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)} placeholder="Now" />
                    </label>
                    <label className="field">
                      Duration (h)
                      <input
                        type="number" min={0.5} step={0.5} value={duration ?? ''}
                        onChange={(e) => setDuration(Number(e.target.value))}
                      />
                    </label>
                  </div>

                  <div className="field">
                    <span className="field-label-row"><LandPlot size={12} /> Diversion airports — nearest-first</span>
                    {alternateIcaos.length > 0 ? (
                      <ul className="flight-list compact">
                        {alternateIcaos.map((icao) => {
                          const a = getAirportByIcao(icao);
                          return (
                            <li key={icao}>
                              <span>{a ? `${a.iata} — ${a.name}` : icao}</span>
                              <button
                                type="button" className="icon-btn"
                                onClick={() => setAlternateIcaos((prev) => prev.filter((c) => c !== icao))}
                              >
                                <X size={14} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="warning-banner">
                        <ShieldAlert size={14} /> No international airport found nearby to serve as an alternate.
                      </div>
                    )}
                    {nearbyAirports.filter((a) => !alternateIcaos.includes(a.icao)).length > 0 && (
                      <div className="chip-row">
                        {nearbyAirports.filter((a) => !alternateIcaos.includes(a.icao)).map((a) => (
                          <button key={a.icao} type="button" className="chip" title={a.name} onClick={() => handleAddAlternate(a.icao)}>
                            + {a.iata}
                          </button>
                        ))}
                      </div>
                    )}
                    <AirportSearch placeholder="Search a transit/stopover airport…" onSelect={(a) => handleAddAlternate(a.icao)} />
                  </div>

                  <button type="button" className="primary-btn" disabled={!canLaunch} onClick={handleLaunch}>
                    <PlaneTakeoff size={14} /> Launch flight
                  </button>
                </div>
              )}
            </section>

            {virtualFlights.length > 0 && (
              <section className="panel-section">
                <h2>Your virtual flights</h2>
                <ul className="flight-list">
                  {virtualFlights.map((f) => {
                    const isFollowing = followFlightId === f.id;
                    return (
                      <li key={f.id}>
                        <span>{f.callsign} · {f.originIcao} → {f.destinationIcao}</span>
                        <span className="flight-item-actions">
                          <button
                            type="button"
                            className={`icon-btn ${isFollowing ? 'active' : ''}`}
                            title={isFollowing ? 'Stop following' : 'Follow with camera'}
                            onClick={() => setFollowFlight(isFollowing ? null : f.id)}
                          >
                            <Crosshair size={14} />
                          </button>
                          <button type="button" className="icon-btn" onClick={() => removeVirtualFlight(f.id)}>
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}