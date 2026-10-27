# Reproduction findings — which of the 10 issues are real (2026-10-27)

Run against the docker compose stack seeded by `docker/postgres/init.sql` (10,000 logs, 1,000 auth events,
200 rate-limit violations). Every fixture row was tagged and deleted afterwards; counts back to 0.

## The seed is not the data the problem statement describes

| Claim in the docs | `init.sql` (what actually loads) | `database/seeds/*.ts` (knex, disabled by `RUN_SEEDS=false`) |
|---|---|---|
| "30 days of realistic traffic" (README) | `NOW() - (10000 - i) seconds` → all 10k logs in the **last 2.8 h** | random over 30 days |
| Failures recorded two ways (#6) | only `login_failure` | ~50/50 `login_failure` / `failed_login` (`04_auth_events.ts:23`) |
| 5xx from Payment Service (#4 example) | Payment's 5xx are only 542/547 | random 500–599 |
| June 2024 data (#10 example) | none | none |

The knex seeds are themselves broken: `03_api_logs.ts:52` indexes a 5-element `services` array with
`random * 100`, so it throws for most rows. That is likely why the demo switched to `init.sql`.

Upstream `Web-Dev-Kombee/GatewayOps` is the same commit (`e72fa9c`) — nothing newer exists to compare against.

## Verdict per issue

| # | Verdict | Evidence (command → result) |
|---|---|---|
| 8 | **Real** | `GET /metrics/admin/detailed`, no token → `200`. Guard is after the handler; `authMiddleware` mounted nowhere |
| 2 | **Real** | `page=1` returns DB rows 11–20; `page=1000` empty; `total` is the string `"10000"` |
| 4 | **Real, two bugs** | `service=payment-service&statusCode=480` → 2,100 rows from Payment **and** User Service (AND gives 0). The UI's "5xx" sends `statusCode=5`, an exact match on 5 |
| 10 | **Real** | `from=to=2026-10-27` → 0; SQL for that UTC day → 10,000 |
| 3 | **Real** | insert 1 row: SQL 10,001, API 10,000; `from=2020-01-01&to=2020-01-02` → 10,000 (one key for all ranges); TTL ~3,460 s |
| 9 | **Real (code)** | `page.tsx:22-28`: summary query has no `from`/`to` and key `['metrics','summary']`; charts have both |
| 6 | **Real once the alias exists** | +250 `failed_login` rows: SQL both names 500, API 250 → **50% missing**. On `init.sql` alone the counts match |
| 7 | **Real at scale** (see below) | statement log: 160 per-row `services` lookups for limits 10+50+100. At 10k/510k rows every call is fast; at **6.01M rows** the report's filtered request takes **1.2–1.4 s** and grows with row count |
| 5 | **Real, opposite direction** | 90 s window, 101 requests: expected 67.33 RPM, API **101** (`floor(1.5)=1`). No range: API 668 vs 40,100 req / 12,000 min ≈ 3.3 |
| 1 | **Not reproducible; no bug in this code** | API 10,000 = SQL 10,000, and 2,281 = 2,281 inside a 1 h range. `CONTRIBUTIONS.md:112-134` describes a `COUNT(DISTINCT id) … JOIN` in `getSummary()` that this code does not contain; the API never inserts rows; no copy of the planted code exists on GitHub; two other candidates' forks found no inflation either. Kept as a regression test; the only defect found was counts returned as strings |

## #7 at scale (isolated database, cleaned up afterwards)

`gatewayops_scale` = a copy of the seed + 6,000,000 rows over 30 days (1.2 GB), shipped schema (5 indexes).
Parallel query off for that DB only: the container's `/dev/shm` is 64 MB (Docker default), which parallel
workers and parallel index vacuum overflow — so these numbers are single-worker, a conservative worst case.

| `GET /logs…` (warm) | original | first fix (JOIN in COUNT) | final |
|---|---|---|---|
| `?service=payment-service&statusCode=500` (the report) | 1.40 s, total 1,262,000 (OR leak) | 0.12 s | **0.12 s**, total 60,000 |
| (none) | 0.13 s | 0.29 s | **0.12 s** |
| `?statusCode=404` | 0.03 s | 0.24 s | **0.02 s** |
| `?page=50000` | 0.85 s | 1.03 s | 0.83 s — OFFSET is linear; keyset paging is a follow-up (API contract change) |

Cause, from `EXPLAIN ANALYZE`: the page query is cheap (0.18 ms, backward scan of the `created_at` index); the
cost is the **COUNT on every request**. The original OR made it a lossy BitmapOr over 1.26M rows (420 ms). A
first version of the fix joined `services` into the COUNT: 326 ms vs **47 ms index-only** without the join, so the
final query counts `api_logs` alone. The report's 8–15 s fits ~10× this row count or slower disks; it was not
reached here.

## Corrections made during the investigation

- A first count of P7 queries used `pg_stat_database.xact_commit` deltas (1, 123, 5 queries). Retracted: that
  counter is flushed lazily, so per-request deltas are meaningless. The statement-log count above replaced it.
- A first P4 test used `statusCode=500`, which no Payment row has; it looked like "status ignored". The 480 test
  shows the real OR leak.
- The scale setup's first error was blamed on the INSERT; the INSERT had committed and `VACUUM` (parallel index
  vacuum, also `/dev/shm`) failed. The rerun inserted a second batch, hence 6M rows rather than 3M.
- Review of the first logs fix found a regression its tests missed: the UI sends `statusCode=` for "All",
  which the new validation rejected with 400. Fixed, with a test of the exact UI request.
