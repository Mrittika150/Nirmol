-- Nirmol initial schema. Run in the Supabase SQL editor (or `supabase db push`).
-- Concentration, AQI and the Nirmol Exposure Indicator are kept in separate fields on purpose.

create extension if not exists postgis;

create type data_kind as enum ('measured', 'model_estimate', 'demo');
create type report_category as enum (
  'waste_burning', 'construction_dust', 'vehicle_smoke', 'industrial_smoke', 'brick_kiln', 'other'
);
create type report_status as enum ('submitted', 'approved', 'rejected', 'forwarded', 'resolved');

-- One row per auth user (anonymous or Google). No health data is required.
create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  language text not null default 'bn' check (language in ('bn', 'en')),
  age_group text check (age_group in ('child', 'adult', 'elderly')),
  sensitivities text[] not null default '{}',   -- e.g. {'respiratory','heart','pregnant'}; optional, user-deletable
  transport text check (transport in ('walk', 'rickshaw', 'bus', 'cng', 'car')),
  outdoor_hours numeric(4,1),
  activity_level text check (activity_level in ('rest', 'walking', 'heavy')),
  home_area geography(point, 4326),
  is_moderator boolean not null default false,
  updated_at timestamptz not null default now()
);

create table stations (
  id text primary key,                          -- e.g. 'openaq:1234'
  name text not null,
  provider text,
  kind data_kind not null,
  location geography(point, 4326) not null
);

create table air_readings (
  station_id text not null references stations on delete cascade,
  observed_at timestamptz not null,
  pm25_ugm3 numeric(7,2),                       -- null = unavailable, never 0
  source text not null,
  primary key (station_id, observed_at)
);

create table forecast_runs (
  id bigint generated always as identity primary key,
  model text not null,                          -- 'nirmol-xgb-v1' or 'cams'
  area text not null,                           -- 'dhaka', or a grid/district key
  issued_at timestamptz not null default now(),
  metrics jsonb                                  -- evaluation summary shipped with the model
);

create table forecast_points (
  run_id bigint not null references forecast_runs on delete cascade,
  valid_at timestamptz not null,
  pm25_ugm3 numeric(7,2) not null,
  pm25_low numeric(7,2),
  pm25_high numeric(7,2),
  top_factors jsonb,                             -- SHAP summary, own model only
  primary key (run_id, valid_at)
);

create table pollution_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid references auth.users on delete set null,
  category report_category not null,           -- confirmed by the user
  ai_category report_category,                 -- Gemini suggestion
  ai_evidence text,
  description text,
  photo_path text not null,                     -- Supabase Storage path, metadata stripped
  location geography(point, 4326) not null,
  public_location geography(point, 4326) not null, -- reduced precision for the map
  status report_status not null default 'submitted',
  created_at timestamptz not null default now()
);
create index on pollution_reports using gist (public_location);

create table report_reviews (
  id bigint generated always as identity primary key,
  report_id uuid not null references pollution_reports on delete cascade,
  reviewer uuid not null references auth.users,
  from_status report_status not null,
  to_status report_status not null,
  note text,
  created_at timestamptz not null default now()
);

create table advisor_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  messages int not null default 0,              -- counts only; chat text is never stored
  primary key (user_id, day)
);

-- Row-level security
alter table profiles enable row level security;
alter table pollution_reports enable row level security;
alter table report_reviews enable row level security;
alter table advisor_usage enable row level security;
alter table stations enable row level security;
alter table air_readings enable row level security;
alter table forecast_runs enable row level security;
alter table forecast_points enable row level security;

create function is_moderator() returns boolean language sql stable security definer as $$
  select coalesce((select is_moderator from profiles where user_id = auth.uid()), false)
$$;

create policy "own profile" on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_moderator = false);

create policy "public data readable" on stations for select using (true);
create policy "public readings readable" on air_readings for select using (true);
create policy "public runs readable" on forecast_runs for select using (true);
create policy "public points readable" on forecast_points for select using (true);

create policy "submit own report" on pollution_reports for insert with check (reporter = auth.uid() and status = 'submitted');
create policy "see own reports" on pollution_reports for select using (reporter = auth.uid());
create policy "moderators see all" on pollution_reports for select using (is_moderator());
create policy "moderators update" on pollution_reports for update using (is_moderator());
create policy "moderators review" on report_reviews for all using (is_moderator()) with check (is_moderator());

create policy "own usage" on advisor_usage for select using (user_id = auth.uid());

-- Public map: approved/forwarded/resolved reports with reduced-precision location and no reporter.
create view public_reports with (security_invoker = false) as
  select id, category, description, photo_path, public_location, status, created_at
  from pollution_reports
  where status in ('approved', 'forwarded', 'resolved');
grant select on public_reports to anon, authenticated;
