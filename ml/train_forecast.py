"""Train and evaluate the Nirmol Dhaka PM2.5 model (CAMS correction / MOS).

The model predicts the US Embassy's measured PM2.5 from inputs that are
available live: the CAMS forecast for that hour, the weather forecast, and
calendar features. No past measurements are used as inputs, because no
reference station reports live any more.

Train: Aug 2022 - Oct 2024.  Test (held out): Nov 2024 - Mar 2025 (winter).

Outputs:
    ml/artifacts/nirmol_xgb_v1_{p10,p50,p90}.json   models (median + 80% interval)
    ml/artifacts/nirmol_xgb_v1_meta.json            features, metrics, importance
    docs/model_evaluation.md                        human-readable results

Usage:  py ml/train_forecast.py
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ml" / "data" / "dhaka_training.csv"
ARTIFACTS = ROOT / "ml" / "artifacts"
REPORT = ROOT / "docs" / "model_evaluation.md"

TEST_START = "2024-11-01"
CALIB_START = "2023-11-01"  # interval calibration period: Nov 2023 - Oct 2024
WINTER_MONTHS = [11, 12, 1, 2]
PERSISTENCE_HOURS = [1, 3, 6, 12, 24]
QUANTILES = {"p10": 0.1, "p50": 0.5, "p90": 0.9}
PARAMS = dict(n_estimators=600, learning_rate=0.03, max_depth=5, subsample=0.8, colsample_bytree=0.8, min_child_weight=5)


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Feature engineering shared with the live job (jobs/refresh_forecast.py).

    `df` must have a UTC DatetimeIndex and the CAMS + weather columns.
    Only uses CAMS/weather values, which exist live as forecasts.
    """
    out = pd.DataFrame(index=df.index)
    local = df.index + pd.Timedelta(hours=6)  # Asia/Dhaka, no DST
    out["hour"] = local.hour
    out["month_sin"] = np.sin(2 * np.pi * local.month / 12)
    out["month_cos"] = np.cos(2 * np.pi * local.month / 12)
    out["weekend"] = local.dayofweek.isin([4, 5]).astype(int)  # Friday-Saturday in Bangladesh
    out["is_winter"] = local.month.isin(WINTER_MONTHS).astype(int)

    for col in ["cams_pm2_5", "cams_pm10", "cams_carbon_monoxide", "cams_dust"]:
        out[col] = df[col]
    out["cams_pm2_5_log"] = np.log1p(df["cams_pm2_5"])
    out["cams_pm2_5_mean24"] = df["cams_pm2_5"].rolling(24, min_periods=6).mean()

    for col in ["temperature_2m", "relative_humidity_2m", "dew_point_2m", "precipitation",
                "surface_pressure", "cloud_cover", "wind_speed_10m", "shortwave_radiation"]:
        out[col] = df[col]
    rad = np.deg2rad(df["wind_direction_10m"])
    out["wind_u"] = -df["wind_speed_10m"] * np.sin(rad)
    out["wind_v"] = -df["wind_speed_10m"] * np.cos(rad)
    out["rain_24h"] = df["precipitation"].rolling(24, min_periods=1).sum()
    out["pressure_change_24h"] = df["surface_pressure"].diff(24)
    out["wind_mean_12h"] = df["wind_speed_10m"].rolling(12, min_periods=3).mean()
    return out


def scores(y: pd.Series, pred: pd.Series) -> dict:
    ok = y.notna() & pred.notna()
    err = pred[ok] - y[ok]
    return {"mae": float(err.abs().mean()), "rmse": float(np.sqrt((err ** 2).mean())), "bias": float(err.mean()), "n": int(ok.sum())}


def main() -> None:
    raw = pd.read_csv(DATA, parse_dates=["time_utc"], index_col="time_utc")
    X_all = add_features(raw)
    y_all = raw["pm25_measured"]
    features = list(X_all.columns)

    has_y = y_all.notna()
    train = has_y & (raw.index < TEST_START)
    test = has_y & (raw.index >= TEST_START)
    print(f"Train hours: {train.sum()}, test hours: {test.sum()}")

    # Calibrate the 80% interval (conformalized quantile regression): fit the p10/p90
    # models on data before the 2023-24 winter, measure how far real values fall
    # outside the band from Nov 2023 to Oct 2024, and widen the final band by that much.
    fit_early = train & (raw.index < CALIB_START)
    calib = train & (raw.index >= CALIB_START)
    log_y = np.log1p(y_all)
    early = {}
    for name in ("p10", "p90"):
        m = xgb.XGBRegressor(objective="reg:quantileerror", quantile_alpha=QUANTILES[name], **PARAMS)
        m.fit(X_all[fit_early], log_y[fit_early])
        early[name] = m.predict(X_all[calib])
    outside = np.maximum(early["p10"] - log_y[calib], log_y[calib] - early["p90"])
    n = len(outside)
    interval_adjust = float(np.quantile(outside, min(1.0, 0.8 * (n + 1) / n)))
    print(f"Interval adjustment (log scale): {interval_adjust:+.3f}")

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    log_preds = {}
    for name, q in QUANTILES.items():
        model = xgb.XGBRegressor(objective="reg:quantileerror", quantile_alpha=q, **PARAMS)
        model.fit(X_all[train], log_y[train])
        log_preds[name] = model.predict(X_all[test])
        model.save_model(ARTIFACTS / f"nirmol_xgb_v1_{name}.json")
        if name == "p50":
            median_model = model
    idx = X_all[test].index
    p50 = log_preds["p50"]
    preds = {
        "p50": pd.Series(np.expm1(p50), index=idx),
        "p10": pd.Series(np.expm1(np.minimum(log_preds["p10"] - interval_adjust, p50)), index=idx),
        "p90": pd.Series(np.expm1(np.maximum(log_preds["p90"] + interval_adjust, p50)), index=idx),
    }

    y = y_all[test]
    winter = y.index.month.isin(WINTER_MONTHS)

    results = {
        "nirmol_model": scores(y, preds["p50"]),
        "raw_cams": scores(y, raw.loc[test, "cams_pm2_5"]),
    }
    # Persistence is only possible offline: live, no reference station reports.
    for h in PERSISTENCE_HOURS:
        results[f"persistence_{h}h_offline_only"] = scores(y, y_all.shift(h)[test])
    winter_results = {
        "nirmol_model": scores(y[winter], preds["p50"][winter]),
        "raw_cams": scores(y[winter], raw.loc[test, "cams_pm2_5"][winter]),
    }
    inside = (y >= preds["p10"]) & (y <= preds["p90"])
    coverage = float(inside.mean())

    # Global feature importance from XGBoost's built-in SHAP values.
    contribs = median_model.get_booster().predict(xgb.DMatrix(X_all[test]), pred_contribs=True)[:, :-1]
    importance = dict(sorted(zip(features, np.abs(contribs).mean(axis=0).round(4).tolist()), key=lambda kv: -kv[1]))

    winter_all = raw[raw.index.month.isin(WINTER_MONTHS)]
    cams_bias = {
        "winter_mean_measured": float(winter_all["pm25_measured"].mean()),
        "winter_mean_cams_same_hours": float(winter_all.loc[winter_all["pm25_measured"].notna(), "cams_pm2_5"].mean()),
    }

    meta = {
        "model": "nirmol-xgb-v1",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "target": "US Embassy Dhaka hourly PM2.5 (ug/m3), log1p-transformed",
        "train_period": [str(raw.index[train].min()), str(raw.index[train].max())],
        "test_period": [str(raw.index[test].min()), str(raw.index[test].max())],
        "features": features,
        "metrics_test": results,
        "metrics_test_winter": winter_results,
        "interval_p10_p90_coverage": coverage,
        "interval_log_adjust": interval_adjust,
        "cams_winter_bias": cams_bias,
        "shap_importance": importance,
    }
    (ARTIFACTS / "nirmol_xgb_v1_meta.json").write_text(json.dumps(meta, indent=2))
    write_report(meta)

    m, c = results["nirmol_model"], results["raw_cams"]
    gain = 1 - m["mae"] / c["mae"]
    print(f"\nTest MAE  Nirmol {m['mae']:.1f}  vs raw CAMS {c['mae']:.1f}  ({gain:+.0%} better)")
    print(f"80% interval coverage: {coverage:.0%} (ideal 80%)")
    print(f"Winter mean measured {cams_bias['winter_mean_measured']:.0f} vs CAMS {cams_bias['winter_mean_cams_same_hours']:.0f}")
    print(f"Report: {REPORT}")


def write_report(meta: dict) -> None:
    def table(res: dict) -> str:
        rows = ["| Method | MAE | RMSE | Bias | Hours |", "|---|---|---|---|---|"]
        rows += [f"| {k} | {v['mae']:.1f} | {v['rmse']:.1f} | {v['bias']:+.1f} | {v['n']} |" for k, v in res.items()]
        return "\n".join(rows)

    top = list(meta["shap_importance"].items())[:8]
    bias = meta["cams_winter_bias"]
    REPORT.write_text(f"""# Nirmol forecast model evaluation

Generated by `ml/train_forecast.py` at {meta['trained_at']}.

**Approach:** CAMS correction (model output statistics). XGBoost predicts the US Embassy's
measured PM2.5 from the CAMS PM2.5 forecast, weather and calendar features. All inputs exist
live, so the same model runs in production. Units: µg/m³.

- Train: {meta['train_period'][0]} → {meta['train_period'][1]}
- Test (held out): {meta['test_period'][0]} → {meta['test_period'][1]}

## Test results (all test hours)

{table(meta['metrics_test'])}

## Test results (winter hours only, Nov–Feb)

{table(meta['metrics_test_winter'])}

**80% prediction interval coverage:** {meta['interval_p10_p90_coverage']:.0%} (ideal: 80%).

## CAMS bias in Dhaka winters (all years)

Measured mean {bias['winter_mean_measured']:.0f} µg/m³ vs CAMS {bias['winter_mean_cams_same_hours']:.0f} µg/m³ over the same hours.

## What drives the model (mean |SHAP|, log scale)

{chr(10).join(f"{i + 1}. `{k}` — {v}" for i, (k, v) in enumerate(top))}

## Caveats

- Persistence baselines need live measurements, which no longer exist (embassy feed stopped
  March 2025). They are shown for comparison only.
- Historical CAMS values from Open-Meteo are close to analysis, not 24 h-ahead forecasts, so
  live accuracy at longer lead times will be somewhat worse than these scores.
- Trained on one site in Baridhara. Not validated for other parts of Bangladesh.
""", encoding="utf-8")


if __name__ == "__main__":
    main()
