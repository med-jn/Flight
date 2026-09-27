const DEG2RAD = Math.PI / 180;

function dayOfYearUTC(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86400000) + 1;
}

export function getSunDeclinationDeg(date: Date): number {
  const n = dayOfYearUTC(date);
  return 23.44 * Math.sin(DEG2RAD * (360 / 365) * (n - 81));
}

export function getEquationOfTimeMinutes(date: Date): number {
  const n = dayOfYearUTC(date);
  const B = DEG2RAD * (360 / 364) * (n - 81);
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

export function getSubsolarPoint(date: Date): { lat: number; lon: number } {
  const lat = getSunDeclinationDeg(date);
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const eotHours = getEquationOfTimeMinutes(date) / 60;
  const solarTimeHours = utcHours + eotHours;
  const lon = normalizeLon(-(solarTimeHours - 12) * 15);
  return { lat, lon };
}

function normalizeLon(lon: number): number {
  return (((lon + 180) % 360) + 360) % 360 - 180;
}
