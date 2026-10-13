"use client";

import { useCallback, useEffect, useState } from "react";
import type { AirReport } from "@/lib/air";
import { LEVEL_COLORS, pm25ToAqi } from "@/lib/aqi";
import { useI18n } from "@/lib/i18n";
import { PLACES, inBangladesh, nearestPlace } from "@/lib/places";
import { ForecastChart } from "./ForecastChart";

type Loc = { lat: number; lon: number; placeId: string | null };
const DEFAULT: Loc = { lat: PLACES[0].lat, lon: PLACES[0].lon, placeId: "dhaka" };

export function Dashboard() {
  const { t, lang, setLang, num } = useI18n();
  const [loc, setLoc] = useState<Loc>(DEFAULT);
  const [report, setReport] = useState<AirReport | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("nirmol.loc") ?? "null");
      if (saved && inBangladesh(saved.lat, saved.lon)) setLoc(saved);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/air?lat=${loc.lat}&lon=${loc.lon}`);
      if (!res.ok) throw new Error();
      setReport(await res.json());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [loc]);

  useEffect(() => {
    load();
  }, [load]);

  const chooseLoc = (next: Loc) => {
    setLoc(next);
    try {
      localStorage.setItem("nirmol.loc", JSON.stringify(next));
    } catch {}
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setLocMsg(t.locationDenied);
    setLocMsg(t.locating);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        if (!inBangladesh(lat, lon)) return setLocMsg(t.locationDenied);
        setLocMsg(null);
        chooseLoc({ lat, lon, placeId: null });
      },
      () => setLocMsg(t.locationDenied),
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  const placeName = loc.placeId
    ? PLACES.find((p) => p.id === loc.placeId)!.name[lang]
    : `${t.myLocation} · ${nearestPlace(loc.lat, loc.lon).name[lang]}`;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-16 pt-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{lang === "bn" ? "নির্মল" : "Nirmol"}</h1>
          <p className="text-sm text-[var(--muted)]">{t.tagline}</p>
        </div>
        <button
          onClick={() => setLang(lang === "bn" ? "en" : "bn")}
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-medium"
          aria-label="Switch language"
        >
          {lang === "bn" ? "English" : "বাংলা"}
        </button>
      </header>

      <section className="flex flex-wrap items-center gap-2">
        <select
          value={loc.placeId ?? ""}
          onChange={(e) => {
            const p = PLACES.find((x) => x.id === e.target.value);
            if (p) chooseLoc({ lat: p.lat, lon: p.lon, placeId: p.id });
          }}
          className="min-h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-base"
          aria-label="Place"
        >
          {!loc.placeId && <option value="">{placeName}</option>}
          {PLACES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name[lang]}
            </option>
          ))}
        </select>
        <button onClick={useMyLocation} className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white">
          📍 {t.useMyLocation}
        </button>
        {locMsg && <p className="w-full text-sm text-[var(--muted)]">{locMsg}</p>}
      </section>

      {status === "error" && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-center">
          <p>{t.error}</p>
          <button onClick={load} className="mt-3 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">
            {t.retry}
          </button>
        </div>
      )}

      {status === "loading" && !report && <Skeleton />}

      {report && status !== "error" && <Report report={report} showSource={showSource} setShowSource={setShowSource} />}

      <section className="grid grid-cols-2 gap-3">
        {[t.planTrip, t.reportPollution].map((label) => (
          <button
            key={label}
            disabled
            className="min-h-14 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-semibold opacity-70"
          >
            {label}
            <span className="block text-xs font-normal text-[var(--muted)]">{t.comingSoon}</span>
          </button>
        ))}
      </section>

      <footer className="text-xs leading-relaxed text-[var(--muted)]">
        {t.notMedical} Data: CAMS via{" "}
        <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        (CC BY 4.0). {num(new Date().getFullYear())}
      </footer>
    </main>
  );

  function Report({
    report,
    showSource,
    setShowSource,
  }: {
    report: AirReport;
    showSource: boolean;
    setShowSource: (v: boolean) => void;
  }) {
    const pm = report.now.pm25;
    const aqi = pm == null ? null : pm25ToAqi(pm);
    const color = aqi ? LEVEL_COLORS[aqi.level] : "var(--muted)";
    const ageMin = Math.max(0, Math.round((Date.now() - new Date(report.now.time).getTime()) / 60000));
    const age = ageMin < 90 ? t.minutesAgo(ageMin) : t.hoursAgo(Math.round(ageMin / 60));

    const valid = report.forecast.filter((p) => p.pm25 != null) as { time: string; pm25: number }[];
    const peak = valid.reduce((a, b) => (b.pm25 > a.pm25 ? b : a), valid[0]);
    const low = valid.reduce((a, b) => (b.pm25 < a.pm25 ? b : a), valid[0]);
    const hour = (iso: string) =>
      new Date(iso).toLocaleTimeString(lang === "bn" ? "bn-BD" : "en-GB", { hour: "numeric", minute: "2-digit", hour12: lang !== "bn", timeZone: "Asia/Dhaka" });

    return (
      <>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--muted)]">
                {placeName} · {t.pm25Now}
              </p>
              <p className="mt-1 text-5xl font-bold tabular-nums" style={{ color }}>
                {pm == null ? t.unavailable : num(Math.round(pm))}
                {pm != null && <span className="ml-1 text-base font-medium text-[var(--muted)]">µg/m³</span>}
              </p>
            </div>
            {aqi && (
              <div className="text-right">
                <span className="inline-block rounded-full px-3 py-1 text-sm font-semibold text-white" style={{ background: color }}>
                  {t.levels[aqi.level]}
                </span>
                <p className="mt-2 text-xs text-[var(--muted)]">{t.aqiLabel}</p>
                <p className="text-lg font-semibold tabular-nums">{num(aqi.aqi)}</p>
              </div>
            )}
          </div>

          {aqi && <p className="mt-4 rounded-xl bg-[var(--soft)] p-3 text-sm leading-relaxed">{t.advice[aqi.level]}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-[var(--border)] px-2.5 py-1 font-medium">
              {report.now.source === "nirmol" ? t.sourceNirmol : t.sourceCams}
            </span>
            <span className="text-[var(--muted)]">
              {t.updated} {age}
            </span>
            <button onClick={() => setShowSource(!showSource)} className="text-[var(--accent)] underline">
              {t.whatIsThis}
            </button>
          </div>
          {showSource && <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{t.sourceExplain}</p>}
          {report.forecastSource === "cams" && (
            <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed">{t.camsWarning}</p>
          )}
        </section>

        <section className="grid grid-cols-3 gap-3 text-center">
          <Stat label={t.temperature} value={report.weather.temperature} unit="°C" />
          <Stat label={t.humidity} value={report.weather.humidity} unit="%" />
          <Stat label={t.wind} value={report.weather.windSpeed} unit="km/h" />
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-1 font-semibold">{t.forecastTitle}</h2>
          {valid.length > 0 && (
            <p className="mb-2 text-xs text-[var(--muted)]">
              {t.peak}: {num(Math.round(peak.pm25))} µg/m³ ({hour(peak.time)}) · {t.lowest}: {num(Math.round(low.pm25))} µg/m³ (
              {hour(low.time)})
            </p>
          )}
          <ForecastChart points={report.forecast} />
        </section>
      </>
    );
  }

  function Stat({ label, value, unit }: { label: string; value: number | null; unit: string }) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {value == null ? "—" : num(Math.round(value))}
          <span className="ml-0.5 text-xs font-normal text-[var(--muted)]">{unit}</span>
        </p>
      </div>
    );
  }
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="h-48 animate-pulse rounded-2xl bg-[var(--soft)]" />
      <div className="h-20 animate-pulse rounded-2xl bg-[var(--soft)]" />
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--soft)]" />
    </div>
  );
}
