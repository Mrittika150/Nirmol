# Nirmol

Bangla-first air-quality forecasting, personal exposure guidance and citizen pollution reporting for Bangladesh.

The agreed scope, stack and schedule are in [docs/plan.md](docs/plan.md).

## Layout

```
web/                    Next.js app (UI + API routes: reports, advisor, trips)
jobs/                   Python scripts run by GitHub Actions (ingestion, hourly forecast)
ml/                     Data audit, notebooks, trained model artifacts
supabase/migrations/    Database schema
.github/workflows/      Scheduled forecast job
```

## Setup

1. Copy `.env.example` to `web/.env.local` and fill in the keys.
2. Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor. Enable **Anonymous sign-ins** and the **Google** provider under Authentication. Create a private `report-photos` storage bucket.
3. `cd web && npm install && npm run dev`
4. Data audit: `pip install -r jobs/requirements.txt && python jobs/audit_openaq_stations.py`

## Data attribution

Weather and air-quality model data from [Open-Meteo](https://open-meteo.com/) (CC BY 4.0). Station data via [OpenAQ](https://openaq.org/). Routing by [openrouteservice](https://openrouteservice.org/). Map data © OpenStreetMap contributors.
