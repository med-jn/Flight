import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';
import { searchAirports, getAirportByIata } from '../core/airportCatalog';
import { getRealDestinationsFrom } from '../core/routeCatalog';
import type { Airport } from '../types/flight';

interface Props {
  origin: Airport | null;
  destination: Airport | null;
  onPickOrigin: (a: Airport) => void;
  onPickDestination: (a: Airport) => void;
  onClearOrigin: () => void;
  onClearDestination: () => void;
}

/**
 * One search bar that walks through picking a route: first search selects the origin, then
 * the SAME box immediately switches to searching for the destination (suggesting real
 * scheduled destinations from that origin before you even type anything). Arrow Up/Down moves
 * through the visible list, Enter confirms — no mouse required.
 */
export function FlightRouteSearch({ origin, destination, onPickOrigin, onPickDestination, onClearOrigin, onClearDestination }: Props) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const stage: 'origin' | 'destination' | 'done' = !origin ? 'origin' : !destination ? 'destination' : 'done';

  const results = useMemo(() => {
    const q = query.trim();
    if (stage === 'origin') return searchAirports(q, 8);
    if (stage === 'destination') {
      if (!q && origin) {
        // Before typing anything: suggest real, currently-scheduled non-stop destinations.
        const real = getRealDestinationsFrom(origin.iata, 8)
          .map((r) => getAirportByIata(r.destinationIata))
          .filter((a): a is Airport => !!a);
        if (real.length > 0) return real;
      }
      return searchAirports(q, 8).filter((a) => a.icao !== origin?.icao);
    }
    return [];
  }, [query, stage, origin]);

  useEffect(() => { setHighlighted(0); }, [results.length, query, stage]);
  useEffect(() => { if (stage !== 'done') inputRef.current?.focus(); }, [stage]);

  function commit(a: Airport) {
    if (stage === 'origin') onPickOrigin(a);
    else if (stage === 'destination') onPickDestination(a);
    setQuery('');
    setHighlighted(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => (h + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => (h - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(results[highlighted]); }
    else if (e.key === 'Escape') { setQuery(''); }
  }

  const placeholder =
    stage === 'origin' ? 'Search origin airport…' : `Search destination from ${origin?.iata}…`;

  return (
    <div className="route-search">
      {(origin || destination) && (
        <div className="route-chips">
          {origin && (
            <span className="route-chip">
              <span className="route-chip-label">FROM</span>{origin.iata}
              <button type="button" onClick={onClearOrigin}><X size={12} /></button>
            </span>
          )}
          {destination && (
            <>
              <ArrowRight size={13} className="route-chip-arrow" />
              <span className="route-chip">
                <span className="route-chip-label">TO</span>{destination.iata}
                <button type="button" onClick={onClearDestination}><X size={12} /></button>
              </span>
            </>
          )}
        </div>
      )}

      {stage !== 'done' && (
        <div className="airport-search">
          <div className="airport-search-input-wrap">
            <Search size={14} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder={placeholder}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          {results.length > 0 && (
            <ul className="airport-search-results">
              {results.map((a, i) => (
                <li key={a.icao}>
                  <button
                    type="button"
                    className={i === highlighted ? 'highlighted' : ''}
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => commit(a)}
                  >
                    <span className="airport-code">{a.iata}</span>
                    <span className="airport-name">{a.name}</span>
                    <span className="airport-city">{a.city}, {a.country}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
