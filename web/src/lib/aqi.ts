// US EPA AQI for PM2.5 (2024 breakpoints). PM2.5 in µg/m³ stays the main number;
// AQI is shown as a labelled secondary value computed from the hourly concentration.

export type AqiLevel = "good" | "moderate" | "usg" | "unhealthy" | "very_unhealthy" | "hazardous";

const BREAKPOINTS: { cLo: number; cHi: number; iLo: number; iHi: number; level: AqiLevel }[] = [
  { cLo: 0.0, cHi: 9.0, iLo: 0, iHi: 50, level: "good" },
  { cLo: 9.1, cHi: 35.4, iLo: 51, iHi: 100, level: "moderate" },
  { cLo: 35.5, cHi: 55.4, iLo: 101, iHi: 150, level: "usg" },
  { cLo: 55.5, cHi: 125.4, iLo: 151, iHi: 200, level: "unhealthy" },
  { cLo: 125.5, cHi: 225.4, iLo: 201, iHi: 300, level: "very_unhealthy" },
  { cLo: 225.5, cHi: 325.4, iLo: 301, iHi: 500, level: "hazardous" },
];

export function pm25ToAqi(pm25: number): { aqi: number; level: AqiLevel } {
  const c = Math.floor(pm25 * 10) / 10; // EPA truncates to one decimal
  const bp = BREAKPOINTS.find((b) => c <= b.cHi) ?? BREAKPOINTS[BREAKPOINTS.length - 1];
  const capped = Math.min(c, bp.cHi);
  const aqi = Math.round(((bp.iHi - bp.iLo) / (bp.cHi - bp.cLo)) * (capped - bp.cLo) + bp.iLo);
  return { aqi, level: bp.level };
}

export const LEVEL_COLORS: Record<AqiLevel, string> = {
  good: "#22c55e",
  moderate: "#eab308",
  usg: "#f97316",
  unhealthy: "#ef4444",
  very_unhealthy: "#a855f7",
  hazardous: "#7f1d1d",
};
