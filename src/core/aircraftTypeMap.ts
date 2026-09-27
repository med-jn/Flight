import type { AircraftCategory } from '../types/flight';

// Maps common OpenFlights/IATA equipment codes to our visual category. Not exhaustive —
// falls back to 'narrowbody' (the most common real-world case) for anything unrecognized.
const WIDEBODY_CODES = new Set([
  '744', '748', '74H', '772', '773', '777', '778', '779', '787', '788', '789',
  '330', '332', '333', '338', '339', '340', '342', '343', '345', '346', '359', '35K', '380',
]);
const REGIONAL_CODES = new Set([
  'AT7', 'AT4', 'AT5', 'ATR', 'DH8', 'DH4', 'CRJ', 'CR2', 'CR7', 'CR9', 'E70', 'E75', 'E90',
  'E95', 'ER4', 'SF3', 'F50', 'D38',
]);
const CARGO_AIRLINE_ICAO = new Set(['FDX', 'UPS', 'GTI', 'CLX', 'ABW', 'BCS', 'CKS']);

export function equipmentCodeToCategory(code: string | undefined, airlineIcao?: string): AircraftCategory {
  if (airlineIcao && CARGO_AIRLINE_ICAO.has(airlineIcao)) return 'cargo';
  if (!code) return 'narrowbody';
  const c = code.trim().toUpperCase();
  if (WIDEBODY_CODES.has(c)) return 'widebody';
  if (REGIONAL_CODES.has(c)) return 'regional';
  return 'narrowbody';
}
