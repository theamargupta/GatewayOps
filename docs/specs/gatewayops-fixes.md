# Spec — GatewayOps production issue fixes

Source of the issues: `docs/problems.md`. Library docs and the sentence each fix relies on: `docs/DOC-MAP.md`.
How each issue was reproduced (and which do not reproduce on the shipped seed): `docs/reproduction-findings.md`.

## What the fixes do

| # | Behaviour after the fix | Refuses / keeps | Why (the doc it rests on) |
|---|---|---|---|
| 0 | `docker compose up` brings `api` to healthy and starts `web`; the API has a test runner (`npm test`, Vitest 4) | No new runtime dependency | Healthcheck used `curl`, absent from `node:20-alpine`. Vitest 5 needs Node ≥22.12; the image is Node 20 |
| 8 | `GET /metrics/admin/detailed` answers **401** with no/invalid token, **403** for a non-admin JWT, **200** for an admin JWT | Other metrics routes stay public (README: "Authentication: not required (disabled for demo)") | Express 4 routing: route callbacks "behave like middleware" and run in order, so the guard must come **before** the handler, after `authMiddleware` sets `req.user` |
| 2 | `page=1` returns rows 1–10 by `created_at DESC, id DESC`; the last page is non-empty; `total`/`pages` are numbers | `page < 1` or `limit` outside 1–100 → 400 | Offset was `page * limit`; ties need a unique tiebreaker for stable pages |
| 4 | Every filter combines with AND. `statusCode` accepts an exact code (`500`) **or** a class digit `1`–`5` (the UI's "5xx" sends `5`) meaning `[n00, n99]` | Any other value → 400 | Knex `orWhere` adds an OR clause; the UI select sends `2`/`4`/`5` |
| 10 | `from`/`to` given as `YYYY-MM-DD` mean whole days: `created_at >= from 00:00Z AND < (to + 1 day) 00:00Z`. Full ISO timestamps are used as given | `from > to` → 400 | Postgres 15 §9.9: "a date value is assumed to represent midnight" — `BETWEEN d AND d` is zero width |
| 7 | One query for the page (service name by JOIN) + one count, whatever `limit` is; a composite index serves "filter by service, newest first" | No change to the response shape (`service_name` stays) | Per-row `services` lookup measured: 160 lookups for limits 10+50+100 |
| 3 | `/metrics/summary` cache key includes `from`/`to`; TTL is short (60 s) so new rows show within a minute | Cache stays (it protects the DB); no invalidation hooks into writers, because rows are inserted outside the API | Fixed key `metrics:summary` + 3600 s TTL served one answer for every range |
| 9 | KPI cards request the same `from`/`to` as the charts, and the range is in the React Query key | — | TanStack Query v5 query-keys guide: "include any variables you use in your query function that change" |
| 6 | Failed logins = `login_failure` **+** `failed_login`, on both `/auth/stats` and the dashboard's Auth Failures card, from one shared constant | — | `AuthEvent.event_type` and the knex seed both carry the alias |
| 5 | RPM = total requests ÷ (window seconds ÷ 60), no flooring of the minutes; with no range, the window is the data's own span | Window of 0 s → 0, never a divide-by-zero | `Math.floor(90/60) = 1` turns 90 s into 1 min |
| 1 | No code change: `getSummary()` count equals `SELECT COUNT(*)` on every seed we have. Documented as not reproducible, with evidence | Will not add a JOIN/DISTINCT "fix" for a bug that is absent | CONTRIBUTIONS.md describes a `COUNT(DISTINCT) … JOIN` that this code does not contain |

## Tests decide done

- Integration tests (Vitest + supertest) run on the host against the compose Postgres/Redis. Every fixture
  row is tagged (`REPRO_<n>_FIXTURE` in `user_agent`/`endpoint`) and deleted in `afterAll`; the count is asserted 0.
- Each bug: a test that fails on the current code for the reason above, then passes after the fix.
- Gate per phase: `npm test` and `npx tsc --noEmit` in `apps/api` exit 0; web phases also `npm run build` in `apps/web`.
