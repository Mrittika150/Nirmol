# Nirmol — Agreed Hackathon Plan

Agreed 10 Oct 2026. Submission 14 Oct 2026. Team of 3.

**Pitch:** Bangla-first, mobile-first web app that forecasts PM2.5, turns it into personal decisions, and lets citizens report pollution sources. Framed around the winter smog season; covers all of Bangladesh.

## Scope for 14 Oct

| # | Feature | Agreed version |
|---|---|---|
| 1 | Live monitoring | All of Bangladesh. PM2.5 µg/m³ is the main number; US EPA AQI as a labelled secondary value. Every value tagged *Measured* / *Model estimate* / *Demo*, with its age. |
| 2 | Forecast | Own XGBoost model for Dhaka (24h), tested against persistence and CAMS. Elsewhere: CAMS forecast, labelled. No 48h claim. |
| 3 | Personal exposure | Nirmol Exposure Indicator = PM2.5 × hours × activity factor (rest 1.0 / walking 1.5 / cycling or labour 2.5). Sensitive groups (under-12, over-65, respiratory/heart, pregnant) get stricter thresholds, same calculation. Shown as low / moderate / high / very high, never as a health-risk %. |
| 4 | Travel time | Lowest-exposure window inside the user's allowed departure range. Always relative ("lower than other options"), never "safe". |
| 5 | Routes | openrouteservice routes compared by **duration only**; states street-level pollution is unknown. Walk → foot, rickshaw → cycling route (resting factor), bus/CNG/car → driving route; AC car gets a note, no number. |
| 6 | Photo reporting | Categories: waste burning, construction dust, vehicle smoke, industrial smoke, brick kiln, other/unsure. Gemini suggests → user confirms → moderator approves. Strip location metadata from the photo file; warn users about faces/number plates. |
| + | Community map | Approved reports only; filters by category/date/status; report status visible. |
| 7 | Explanations | SHAP on the Dhaka model. Ships only if feature 2's own model ships. |
| 8 | Bangla advisor | Open-ended chat (see rules below). |
| 9–12, 14 | Roadmap slide | Not built. |
| 13 | SOS | Removed. |

### Advisor rules
- Every request includes the app's current facts: location, PM2.5 now, 24h forecast, best travel window, user profile.
- Only answers about air quality, exposure, precautions and plans. Declines unrelated topics.
- Never makes up PM2.5 values or forecasts; only quotes numbers it was given.
- No diagnoses or medicine; says "consult a doctor". Severe symptoms (breathing difficulty, chest pain) → call **999**.
- Accepts Bangla, English, Banglish; replies in the user's chosen app language. Replies ~150 words max.
- 20 messages per user per day. When the limit or quota is hit, show a fixed summary built from the same facts.
- Chat history stays in the browser session only; never stored in the database.

## Stack (all free)

| Need | Choice |
|---|---|
| App + API routes | Next.js on Vercel Hobby |
| Database, photo storage, auth | Supabase free tier — anonymous sign-in by default, optional "Sign in with Google" |
| Forecast job | Python, GitHub Actions hourly (public repo), writes forecasts to Supabase |
| Model training | Google Colab |
| Vision + language AI | Gemini Flash free tier |
| Data | OpenAQ (free key), Open-Meteo weather + air quality (free, non-commercial, attribution required) |
| Routing | openrouteservice (free key) |
| Maps / charts | MapLibre GL + OSM tiles, Recharts |

No separate FastAPI server. Moderators are team members with Supabase logins.

## Data rules
- Keep PM2.5 concentration, AQI, and the Exposure Indicator as separate fields — never interchange.
- Unavailable is not zero.
- Never show historical or demo values as current; always show their date.
- Do not treat the Mendeley "Bangladesh AQI 2000–2025" dataset as measured data until audited; it is likely model output.
- If OpenAQ has no Dhaka station data after March 2025 (US Embassy feed appears stopped), use DoE stations or CAMS for live values, labelled accordingly.

## Forecast go/no-go
**Midday 12 Oct.** If the Dhaka model does not clearly beat persistence and CAMS on a held-out winter, ship the CAMS forecast (labelled) and present the evaluation as research.

## Cut order if behind
1. Route comparison (keep departure-time advice)
2. Own model → CAMS fallback
3. SHAP explanations

Never cut: dashboard, travel-time advice, photo reporting, moderated map, advisor.

## Schedule

| Day | A — ML/data | B — Backend + AI | C — Frontend |
|---|---|---|---|
| 10 Oct (tonight) | OpenAQ key; list Bangladesh stations and date ranges | Supabase project; Gemini + openrouteservice keys | Repo, Next.js, Vercel, Bangla/English text system |
| 11 Oct | Data audit, download history, baselines | Tables, anonymous sign-in, report upload + classification | Onboarding/profile, dashboard with CAMS data |
| 12 Oct | XGBoost train + test; **go/no-go at midday** | Exposure calculation, travel-window API, moderation | Trip planner, report screen, map |
| 13 Oct | SHAP, hourly forecast job | Advisor + safety tests, routing, Google sign-in, rate limits | Connect all screens, mobile polish, loading/error states |
| 14 Oct | Write up test results | Seed demo reports, security check | Demo video, slides |

## Demo
Live deployed site, plus a pre-recorded 3–4 minute backup video. Pre-approved sample reports and photos so the map is never empty. Rehearse 5 tested advisor questions.

Flow: problem (sourced Dhaka statistic) → dashboard + evaluated forecast → change profile, pick departure time → route comparison or honest limitation → upload photo, classify, moderate, show on map → Bangla advisor, test results, roadmap.

## Evaluation to report
- Forecast: MAE/RMSE at 1, 3, 6, 12, 24h vs persistence and CAMS.
- Exposure/travel planner: test profiles produce expected changes; chosen window is the true minimum.
- Photo classifier: a small labelled test set (precision/recall per category), clearly stated as small.
- Advisor: a list of tricky prompts (medical, off-topic, invented numbers) and pass rate.
