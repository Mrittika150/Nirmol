"""Hourly job: produce the Nirmol 24h PM2.5 forecast for Dhaka and save it to Supabase.

Fetches the live CAMS + weather forecast from Open-Meteo, runs the trained
CAMS-correction model (median + calibrated 80% range), attaches the top factors
behind each hour (SHAP), and writes one forecast_runs row + 25 forecast_points.

Usage:
    py jobs/refresh_forecast.py --dry-run      # print only, no database
    py jobs/refresh_forecast.py                # needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import xgboost as xgb

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml"))
from train_forecast import add_features  # noqa: E402  (same features as training)

ARTIFACTS = ROOT / "ml" / "artifacts"
MODEL = "nirmol-xgb-v1"
LAT, LON = 23.796374, 90.424614  # US Embassy site the model was trained on
HOURS = 25
KEEP_DAYS = 3

CAMS_VARS = ["pm2_5", "pm10", "carbon_monoxide", "dust"]
WEATHER_VARS = [
    "temperature_2m", "relative_humidity_2m", "dew_point_2m", "precipitation",
    "surface_pressure", "cloud_cover", "wind_speed_10m", "wind_direction_10m",
    "shortwave_radiation",
]


def open_meteo(url: str, variables: list[str], prefix: str) -> pd.DataFrame:
    # past_days=2 so the 24h rolling features have history behind the first forecast hour.
    resp = requests.get(
        url,
        params={"latitude": LAT, "longitude": LON, "hourly": ",".join(variables),
                "past_days": 2, "forecast_days": 3, "timezone": "GMT"},
        timeout=60,
    )
    resp.raise_for_status()
    df = pd.DataFrame(resp.json()["hourly"]).rename(columns={v: f"{prefix}{v}" for v in variables})
    df["time"] = pd.to_datetime(df["time"])
    return df.set_index("time")


def load_models() -> tuple[dict[str, xgb.XGBRegressor], dict]:
    models = {}
    for name in ("p10", "p50", "p90"):
        m = xgb.XGBRegressor()
        m.load_model(ARTIFACTS / f"nirmol_xgb_v1_{name}.json")
        models[name] = m
    meta = json.loads((ARTIFACTS / "nirmol_xgb_v1_meta.json").read_text())
    return models, meta


def build_forecast() -> tuple[pd.DataFrame, dict]:
    models, meta = load_models()
    raw = open_meteo("https://air-quality-api.open-meteo.com/v1/air-quality", CAMS_VARS, "cams_").join(
        open_meteo("https://api.open-meteo.com/v1/forecast", WEATHER_VARS, ""), how="inner"
    )
    X = add_features(raw)[meta["features"]]

    now = pd.Timestamp.now(tz="UTC").tz_localize(None).floor("h")
    X = X[(X.index >= now) & X.notna().all(axis=1)].head(HOURS)
    if len(X) < 12:
        raise RuntimeError(f"Only {len(X)} usable forecast hours from Open-Meteo; not saving.")

    adjust = meta.get("interval_log_adjust", 0.0)
    p50 = models["p50"].predict(X)
    out = pd.DataFrame(index=X.index)
    out["pm25"] = np.expm1(p50)
    out["low"] = np.expm1(np.minimum(models["p10"].predict(X) - adjust, p50))
    out["high"] = np.expm1(np.maximum(models["p90"].predict(X) + adjust, p50))
    out["cams"] = raw.loc[X.index, "cams_pm2_5"]

    # Per-hour explanation: the 3 features that pushed this hour's prediction most.
    contribs = models["p50"].get_booster().predict(xgb.DMatrix(X), pred_contribs=True)[:, :-1]
    factors = []
    for row_c, (_, row_x) in zip(contribs, X.iterrows()):
        top = np.argsort(-np.abs(row_c))[:3]
        factors.append([
            {"feature": meta["features"][i], "value": round(float(row_x.iloc[i]), 2), "effect": round(float(row_c[i]), 3)}
            for i in top
        ])
    out["factors"] = factors
    return out, meta


def save(forecast: pd.DataFrame, meta: dict) -> None:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    run = requests.post(
        f"{url}/rest/v1/forecast_runs",
        headers={**headers, "Prefer": "return=representation"},
        json={
            "model": MODEL,
            "area": "dhaka",
            "metrics": {
                "test_mae": meta["metrics_test"]["nirmol_model"]["mae"],
                "cams_test_mae": meta["metrics_test"]["raw_cams"]["mae"],
                "interval_coverage": meta["interval_p10_p90_coverage"],
                "trained_at": meta["trained_at"],
            },
        },
        timeout=30,
    )
    run.raise_for_status()
    run_id = run.json()[0]["id"]

    points = [
        {
            "run_id": run_id,
            "valid_at": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "pm25_ugm3": round(float(r.pm25), 1),
            "pm25_low": round(float(r.low), 1),
            "pm25_high": round(float(r.high), 1),
            "top_factors": {"factors": r.factors, "cams_pm25": round(float(r.cams), 1)},
        }
        for t, r in forecast.iterrows()
    ]
    requests.post(f"{url}/rest/v1/forecast_points", headers=headers, json=points, timeout=30).raise_for_status()

    # Old runs are not needed by the app; points are removed by ON DELETE CASCADE.
    cutoff = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    requests.delete(f"{url}/rest/v1/forecast_runs?issued_at=lt.{cutoff}", headers=headers, timeout=30).raise_for_status()
    print(f"Saved run {run_id} with {len(points)} hours.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="print the forecast without saving")
    args = parser.parse_args()

    forecast, meta = build_forecast()
    dhaka = forecast.index + pd.Timedelta(hours=6)
    print(f"{'Dhaka time':<17} {'Nirmol':>7} {'range':>11} {'CAMS':>6}  top factor")
    for t, r in zip(dhaka, forecast.itertuples()):
        f = r.factors[0]
        print(f"{t:%a %H:%M}{'':<7} {r.pm25:7.0f} {r.low:5.0f}-{r.high:<5.0f} {r.cams:6.0f}  {f['feature']} ({f['effect']:+.2f})")
    if not args.dry_run:
        save(forecast, meta)


if __name__ == "__main__":
    main()
