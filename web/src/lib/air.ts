// Server-side air-quality data layer. Every value carries its source so the UI can
// label it Measured / Model estimate / Demo. Missing values are null, never 0.

import { inDhakaModelArea } from "./places";

export type DataKind = "measured" | "model_estimate" | "demo";
export type ForecastSource = "nirmol" | "cams";

export type ForecastPoint = { time: string; pm25: number | null; low?: number | null; high?: number | null };

export type AirReport = {
  lat: number;
  lon: number;
  now: { pm25: number | null; time: string; kind: DataKind; source: ForecastSource };
  weather: { temperature: number | null; humidity: number | null; windSpeed: number | null; time: string };
  forecast: ForecastPoint[];
  forecastSource: ForecastSource;
  inDhakaModelArea: boolean;
  fetchedAt: string;
};

const REVALIDATE_SECONDS = 900;
const NIRMOL_MAX_AGE_HOURS = 3;

type OpenMeteoAir = {
  current: { time: string; pm2_5: number | null };
  hourly: { time: string[]; pm2_5: (number | null)[] };
};
type OpenMeteoWeather = {
  current: { time: string; temperature_2m: number | null; relative_humidity_2m: number | null; wind_speed_10m: number | null };
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

/** Latest Nirmol (CAMS-corrected) Dhaka forecast written by jobs/refresh_forecast.py, if fresh. */
async function latestNirmolForecast(): Promise<ForecastPoint[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const runs = await fetch(
      `${url}/rest/v1/forecast_runs?model=like.nirmol-*&area=eq.dhaka&order=issued_at.desc&limit=1`,
      { headers, next: { revalidate: 300 } },
    ).then((r) => (r.ok ? r.json() : []));
    const run = runs[0];
    if (!run) return null;
    const ageHours = (Date.now() - new Date(run.issued_at).getTime()) / 3.6e6;
    if (ageHours > NIRMOL_MAX_AGE_HOURS) return null;
    const points: { valid_at: string; pm25_ugm3: number; pm25_low: number | null; pm25_high: number | null }[] =
      await fetch(`${url}/rest/v1/forecast_points?run_id=eq.${run.id}&order=valid_at.asc`, {
        headers,
        next: { revalidate: 300 },
      }).then((r) => (r.ok ? r.json() : []));
    if (!points.length) return null;
    return points.map((p) => ({ time: p.valid_at, pm25: p.pm25_ugm3, low: p.pm25_low, high: p.pm25_high }));
  } catch {
    return null;
  }
}

export async function getAirReport(lat: number, lon: number): Promise<AirReport> {
  const q = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&timezone=GMT`;
  const [air, weather] = await Promise.all([
    getJson<OpenMeteoAir>(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=pm2_5&hourly=pm2_5&forecast_days=2`),
    getJson<OpenMeteoWeather>(
      `https://api.open-meteo.com/v1/forecast?${q}&current=temperature_2m,relative_humidity_2m,wind_speed_10m`,
    ),
  ]);

  const nowMs = Date.now();
  const iso = (t: string) => `${t}:00Z`; // Open-Meteo GMT times have no zone suffix
  const camsForecast: ForecastPoint[] = air.hourly.time
    .map((t, i) => ({ time: iso(t), pm25: air.hourly.pm2_5[i] }))
    .filter((p) => new Date(p.time).getTime() >= nowMs - 3.6e6)
    .slice(0, 25);

  const dhaka = inDhakaModelArea(lat, lon);
  const nirmol = dhaka ? await latestNirmolForecast() : null;
  const upcoming = nirmol?.filter((p) => new Date(p.time).getTime() >= nowMs - 3.6e6).slice(0, 25);
  const useNirmol = Boolean(upcoming && upcoming.length >= 12);

  const forecast = useNirmol ? upcoming! : camsForecast;
  const now = useNirmol
    ? { pm25: forecast[0].pm25, time: forecast[0].time, kind: "model_estimate" as const, source: "nirmol" as const }
    : { pm25: air.current.pm2_5, time: iso(air.current.time), kind: "model_estimate" as const, source: "cams" as const };

  return {
    lat,
    lon,
    now,
    weather: {
      temperature: weather.current.temperature_2m,
      humidity: weather.current.relative_humidity_2m,
      windSpeed: weather.current.wind_speed_10m,
      time: iso(weather.current.time),
    },
    forecast,
    forecastSource: useNirmol ? "nirmol" : "cams",
    inDhakaModelArea: dhaka,
    fetchedAt: new Date().toISOString(),
  };
}
