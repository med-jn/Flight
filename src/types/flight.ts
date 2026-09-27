export type Degrees = number;

export interface ProjectedPoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface GeoCoordinates {
  latitudeDeg: Degrees;
  longitudeDeg: Degrees;
}

export type AirportSize = 'large_airport' | 'medium_airport' | 'small_airport';

export interface Airport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  latitudeDeg: Degrees;
  longitudeDeg: Degrees;
  elevationFt?: number;
  type: AirportSize;
}

export type AircraftCategory = 'narrowbody' | 'widebody' | 'regional' | 'private' | 'cargo';

export const AIRCRAFT_CATEGORY_LABELS: Record<AircraftCategory, string> = {
  narrowbody: 'Narrow-body jet',
  widebody: 'Wide-body jet',
  regional: 'Regional turboprop',
  private: 'Private jet',
  cargo: 'Cargo freighter',
};

export interface VirtualFlight {
  id: string;
  originIcao: string;
  destinationIcao: string;
  departureTime: string; // ISO 8601
  arrivalTime: string; // ISO 8601
  callsign?: string;
  aircraftType: AircraftCategory;
  distanceKm: number;
  /** ICAO codes of designated diversion/emergency airports for this flight — required, never
   * empty, so every flight has real contingency coverage along its route. */
  alternateIcaos: string[];
  /** Whether this exact origin-destination pair matches a real, currently-scheduled non-stop
   * route in the OpenFlights dataset (vs. a plausible-but-unscheduled pairing). */
  isRealRoute: boolean;
}

export interface LiveFlightState {
  icao24: string;
  callsign?: string;
  originCountry?: string;
  latitudeDeg: Degrees;
  longitudeDeg: Degrees;
  headingDeg?: Degrees;
  altitudeM?: number;
  velocityMs?: number;
  onGround: boolean;
  lastContact: number;
}
