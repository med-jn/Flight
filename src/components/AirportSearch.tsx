import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchAirports } from '../core/airportCatalog';
import type { Airport } from '../types/flight';

interface Props {
  placeholder?: string;
  onSelect: (airport: Airport) => void;
}

/** A search box with full keyboard navigation: type to filter, Arrow Up/Down to move through
 * the visible results, Enter to confirm the highlighted one, Escape to clear. */
export function AirportSearch({ placeholder = 'Search airport, city or IATA/ICAO code…', onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const results = useMemo(() => searchAirports(query, 8), [query]);

  useEffect(() => { setHighlighted(0); }, [query]);

  function commit(a: Airport) {
    onSelect(a);
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

  return (
    <div className="airport-search">
      <div className="airport-search-input-wrap">
        <Search size={14} />
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button type="button" className="icon-btn" onClick={() => setQuery('')} title="Clear">
            <X size={14} />
          </button>
        )}
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
  );
}
