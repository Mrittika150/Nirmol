# Nirmol — Agreed Hackathon Plan

Agreed 10 Oct 2026; updated 13 Oct. Submission **18 Oct 2026** (extended from 14 Oct). Team of 3. Claude writes the code; the team handles accounts, testing, photos, Bangla wording, slides and the demo.

**Pitch:** Bangla-first, mobile-first web app that forecasts PM2.5, turns it into personal decisions, and lets citizens report pollution sources. Framed around the winter smog season; covers all of Bangladesh.

## Scope for 14 Oct

| # | Feature | Agreed version |
|---|---|---|
| 1 | Live monitoring | All of Bangladesh. PM2.5 µg/m³ is the main number; US EPA AQI as a labelled secondary value. Every value tagged *Measured* / *Model estimate* / *Demo*, with its age. |
| 2 | Forecast | Own XGBoost **CAMS-correction model** for Dhaka (24h): predicts the US Embassy's measured PM2.5 from the CAMS forecast + weather forecast + calendar, so it runs live. Train Aug 2022–Oct 2024, held-out test Nov 2024–Mar 2025. Compared with raw CAMS and (offline only) persistence. Elsewhere: raw CAMS with a note that global models often underestimate winter pollution in Bangladesh (only if the data confirms it). No 48h claim. Pipeline: `jobs/build_training_data.py` → `ml/train_forecast.py` → `docs/model_evaluation.md`. |
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
- Confirmed by audit: the US Embassy feed (OpenAQ location 8415) stopped 24 Mar 2025. No DoE stations on OpenAQ. Live measurements come only from ~9 AirGradient low-cost sensors (7 in Dhaka, Gazipur, Khulna).
- Dhaka's main live number: "Model estimate – CAMS corrected by Nirmol". AirGradient sensors appear as "Low-cost sensor" map dots only if they reported in the last 3 hours.

## Forecast go/no-go
**End of 14 Oct.** If the Dhaka model does not clearly beat persistence and CAMS on a held-out winter, ship the CAMS forecast (labelled) and present the evaluation as research.

## Cut order if behind
1. Route comparison (keep departure-time advice)
2. Own model → CAMS fallback
3. SHAP explanations

Never cut: dashboard, travel-time advice, photo reporting, moderated map, advisor.

## Schedule

Done by 13 Oct: repo on GitHub, station audit, Supabase project, training pipeline scripts.

| Day | Claude builds | Team does |
|---|---|---|
| 13 Oct | Dashboard (live CAMS for any location, AQI, weather, 24h chart, source labels) | Finish Supabase setup; get Gemini + openrouteservice keys; run data download + training; Vercel deploy |
| 14 Oct | Hourly forecast job; onboarding/profile; exposure calculation; travel-time planner | Review results in `docs/model_evaluation.md`; **go/no-go**; photograph pollution sources |
| 15 Oct | Photo reporting + Gemini classification; moderation screen; community map | Test reporting on phones; check Bangla wording |
| 16 Oct | Bangla advisor chat + safety tests; route comparison; Google sign-in | Test the advisor with tricky questions; write pitch statistic + slides |
| 17 Oct | Integration fixes, mobile polish, seed demo data | Full testing on phones; rehearse demo |
| 18 Oct | Freeze | Record demo video; submit |

## Demo
Live deployed site, plus a pre-recorded 3–4 minute backup video. Pre-approved sample reports and photos so the map is never empty. Rehearse 5 tested advisor questions.

Flow: problem (sourced Dhaka statistic) → dashboard + evaluated forecast → change profile, pick departure time → route comparison or honest limitation → upload photo, classify, moderate, show on map → Bangla advisor, test results, roadmap.

## Evaluation to report
- Forecast: MAE/RMSE at 1, 3, 6, 12, 24h vs persistence and CAMS.
- Exposure/travel planner: test profiles produce expected changes; chosen window is the true minimum.
- Photo classifier: a small labelled test set (precision/recall per category), clearly stated as small.
- Advisor: a list of tricky prompts (medical, off-topic, invented numbers) and pass rate.
