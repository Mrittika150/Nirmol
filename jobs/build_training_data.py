"""Build the Dhaka training table: measured PM2.5 (US Embassy, via OpenAQ) aligned
hour-by-hour with CAMS PM2.5 and weather from Open-Meteo.

Output: ml/data/dhaka_training.csv  (one row per UTC hour, Aug 2022 - Mar 2025)

Usage (PowerShell):
    $env:OPENAQ_API_KEY="..."
    py jobs/build_training_data.py
"""

import json
import os
import sys
import time
from pathlib import Path

import pandas as pd
import requests

# US Embassy Dhaka (AirNow), reference-grade. Feed stopped 2025-03-24.
EMBASSY_LOCATION_ID = 8415
LAT, LON = 23.796374, 90.424614

# CAMS history on Open-Meteo starts mid-Aug 2022; embassy feed ends 24 Mar 2025.
START, END = "2022-08-15", "2025-03-24"

OPENAQ = "https://api.openaq.org/v3"
WEATHER_VARS = [
    "temperature_2m", "relative_humidity_2m", "dew_point_2m", "precipitation",
    "surface_pressure", "cloud_cover", "wind_speed_10m", "wind_direction_10m",
    "shortwave_radiation",
]
CAMS_VARS = ["pm2_5", "pm10", "carbon_monoxide", "dust"]

OUT = Path(__file__).resolve().parent.parent / "ml" / "data" / "dhaka_training.csv"


RETRY_STATUS = {408, 429, 500, 502, 503, 504}  # timeouts, rate limits, server hiccups
CACHE = Path(__file__).resolve().parent.parent / "ml" / "data" / "openaq_cache"


def openaq_get(path: str, api_key: str, params: dict | None = None) -> dict:
    for attempt in range(6):
        try:
            resp = requests.get(f"{OPENAQ}{path}", headers={"X-API-Key": api_key}, params=params, timeout=90)
        except requests.exceptions.RequestException:
            resp = None
        if resp is not None and resp.status_code not in RETRY_STATUS:
            resp.raise_for_status()
            return resp.json()
        wait = 10 * (attempt + 1)
        print(f"    OpenAQ busy ({resp.status_code if resp is not None else 'network error'}), retrying in {wait}s...")
        time.sleep(wait)
    raise RuntimeError(f"OpenAQ kept failing for {path}. Run the script again; finished months are cached.")


def fetch_measured(api_key: str) -> pd.Series:
    sensors = openaq_get(f"/locations/{EMBASSY_LOCATION_ID}/sensors", api_key)["results"]
    pm25 = next(s for s in sensors if s["parameter"]["name"] == "pm25")
    print(f"Embassy PM2.5 sensor id: {pm25['id']}")
    CACHE.mkdir(parents=True, exist_ok=True)

    rows = []
    # One month per request (<= 744 hours, so a single page). Each month is cached
    # on disk, so if OpenAQ fails part-way a rerun skips the months already saved.
    for month_start in pd.date_range(pd.Timestamp(START).replace(day=1), END, freq="MS"):
        month_end = month_start + pd.offsets.MonthBegin(1)
        cache_file = CACHE / f"{pm25['id']}_{month_start:%Y-%m}.json"
        if cache_file.exists():
            data = json.loads(cache_file.read_text())
            print(f"  {month_start:%Y-%m}: {len(data)} hours (cached)")
        else:
            data = openaq_get(
                f"/sensors/{pm25['id']}/hours",
                api_key,
                {
                    "datetime_from": month_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "datetime_to": month_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "limit": 1000,
                },
            )["results"]
            data = [[r["period"]["datetimeFrom"]["utc"], r["value"]] for r in data]
            cache_file.write_text(json.dumps(data))
            print(f"  {month_start:%Y-%m}: {len(data)} hours")
            time.sleep(1.1)  # stay under 60 requests/minute
        rows += data

    s = pd.Series({pd.Timestamp(t).tz_convert("UTC").tz_localize(None): v for t, v in rows}, name="pm25_measured")
    s = s.sort_index()
    # Drop instrument errors / sentinel values; null means unavailable, never 0.
    return s.where((s > 0) & (s < 1000))


def fetch_open_meteo(url: str, variables: list[str], prefix: str) -> pd.DataFrame:
    resp = requests.get(
        url,
        params={
            "latitude": LAT, "longitude": LON, "start_date": START, "end_date": END,
            "hourly": ",".join(variables), "timezone": "GMT",
        },
        timeout=120,
    )
    resp.raise_for_status()
    hourly = resp.json()["hourly"]
    df = pd.DataFrame(hourly).rename(columns={v: f"{prefix}{v}" for v in variables})
    df["time"] = pd.to_datetime(df["time"])
    return df.set_index("time")


def main() -> None:
    api_key = os.environ.get("OPENAQ_API_KEY")
    if not api_key:
        sys.exit("Set OPENAQ_API_KEY first.")

    print("Downloading embassy PM2.5 from OpenAQ...")
    measured = fetch_measured(api_key)
    print("Downloading CAMS PM2.5 from Open-Meteo...")
    cams = fetch_open_meteo("https://air-quality-api.open-meteo.com/v1/air-quality", CAMS_VARS, "cams_")
    print("Downloading archived weather forecasts from Open-Meteo...")
    weather = fetch_open_meteo("https://historical-forecast-api.open-meteo.com/v1/forecast", WEATHER_VARS, "")

    df = cams.join(weather, how="left").join(measured, how="left")
    df.index.name = "time_utc"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT)

    n = len(df)
    have = df["pm25_measured"].notna().sum()
    winter = df[df.index.month.isin([11, 12, 1, 2])]
    print(f"\nSaved {OUT}")
    print(f"{n} hours, {have} with measured PM2.5 ({have / n:.0%}).")
    print(
        f"Winter means (Nov-Feb): measured {winter['pm25_measured'].mean():.0f} ug/m3, "
        f"CAMS {winter['cams_pm2_5'].mean():.0f} ug/m3."
    )


if __name__ == "__main__":
    main()
