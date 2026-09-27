import type { Airport } from '../types/flight';

interface Props {
  airport: Airport | null;
}

export function InfoCard({ airport }: Props) {
  if (!airport) return null;
  return (
    <div className="info-card" aria-live="polite">
      <div className="info-row">
        <span className="badge badge-airport">✈</span>
        <span className="info-label">{airport.iata} / {airport.icao}</span>
        <span className="info-value">{airport.name}</span>
      </div>
      <div className="info-row">
        <span className="info-label">Location</span>
        <span className="info-value">{airport.city}, {airport.country}</span>
      </div>
      <div className="info-row">
        <span className="info-label">Coordinates</span>
        <span className="info-value">
          {airport.latitudeDeg.toFixed(2)}°, {airport.longitudeDeg.toFixed(2)}°
        </span>
      </div>
    </div>
  );
}
