"""List every OpenAQ PM2.5 location in Bangladesh with its date range.

Answers the first data-audit questions: which stations exist, who runs them,
and whether they still report. Writes ml/data/openaq_bd_stations.csv.

Usage:
    set OPENAQ_API_KEY=...      (PowerShell: $env:OPENAQ_API_KEY="...")
    python jobs/audit_openaq_stations.py
"""

import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

API = "https://api.openaq.org/v3/locations"
PM25_PARAMETER_ID = 2
OUT = Path(__file__).resolve().parent.parent / "ml" / "data" / "openaq_bd_stations.csv"


def fetch_locations(api_key: str) -> list[dict]:
    locations, page = [], 1
    while True:
        resp = requests.get(
            API,
            headers={"X-API-Key": api_key},
            params={"iso": "BD", "parameters_id": PM25_PARAMETER_ID, "limit": 1000, "page": page},
            timeout=30,
        )
        resp.raise_for_status()
        batch = resp.json()["results"]
        locations.extend(batch)
        if len(batch) < 1000:
            return locations
        page += 1


def utc(field: dict | None) -> str:
    return (field or {}).get("utc") or ""


def main() -> None:
    api_key = os.environ.get("OPENAQ_API_KEY")
    if not api_key:
        sys.exit("Set OPENAQ_API_KEY first (free key from https://explore.openaq.org/register).")

    rows = []
    for loc in fetch_locations(api_key):
        coords = loc.get("coordinates") or {}
        rows.append({
            "id": loc["id"],
            "name": loc.get("name"),
            "locality": loc.get("locality"),
            "provider": (loc.get("provider") or {}).get("name"),
            "is_reference_monitor": loc.get("isMonitor"),
            "lat": coords.get("latitude"),
            "lon": coords.get("longitude"),
            "first": utc(loc.get("datetimeFirst")),
            "last": utc(loc.get("datetimeLast")),
        })

    rows.sort(key=lambda r: r["last"], reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ["id"])
        writer.writeheader()
        writer.writerows(rows)

    now = datetime.now(timezone.utc)
    active = [r for r in rows if r["last"] and (now - datetime.fromisoformat(r["last"].replace("Z", "+00:00"))).days <= 7]
    print(f"{len(rows)} PM2.5 locations in Bangladesh, {len(active)} reported in the last 7 days.")
    print(f"{'last report':<22} {'first report':<22} {'monitor':<8} name / provider")
    for r in rows[:40]:
        print(f"{r['last'][:19]:<22} {r['first'][:19]:<22} {str(r['is_reference_monitor']):<8} {r['name']} / {r['provider']}")
    print(f"\nFull list: {OUT}")


if __name__ == "__main__":
    main()
