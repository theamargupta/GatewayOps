# DOC-MAP — GatewayOps

The address book for "read the docs first". Versions are what is **installed in the running containers**
(2026-10-27), not the `package.json` ranges. There is **no lockfile** in `apps/api` or `apps/web`, so every
`docker compose build` re-resolves the caret ranges — a version here can drift on the next build.
Web versions marked `~` were resolved with `npm view <range>` because the standalone Next image ships no
`node_modules`.

| Thing + installed version | context7 ID (pinned where indexed) | The one page that matters | What it already cost |
|---|---|---|---|
| Express **4.22.3** | `/expressjs/express/v4.22.1` (nearest indexed), `/websites/expressjs` | [4.x routing → Route handlers](https://expressjs.com/en/4x/guide/routing/): callbacks "behave like middleware" and run **in order** | P8: `roleGuard` placed *after* the handler never runs; `authMiddleware` is never mounted |
| Knex **2.5.1** | `/knex/knex` (no version pins) | [query-builder → where / orWhere / whereBetween](https://knexjs.org/guide/query-builder.html#where) — group ORs in a callback | P4 `orWhere` turned AND into OR; P10 `whereBetween` on bare dates |
| pg (node-postgres) **8.23.1** | `/brianc/node-postgres` | [features/types](https://node-postgres.com/features/types): int8 (`COUNT`, `SUM`) comes back as a **string** | Every count in the API is a string (`"total":"10000"`); arithmetic works only by JS coercion |
| PostgreSQL **15.19** | `/websites/postgresql/15` | [9.9 Date/Time](https://www.postgresql.org/docs/15/functions-datetime.html): "a date value is assumed to represent midnight" | P10: `from=to=YYYY-MM-DD` is a zero-width range |
| node-redis **4.7.1** | `/redis/node-redis` (no v4 pin) | v4 API: `setEx`, `get`, `del`, `scanIterator` | P3: one cache key for every date range, 1 h TTL, never invalidated |
| Next.js **14.2.35** | `/vercel/next.js/v14.3.0-canary.87` (nearest 14.x) | App Router + `output: 'standalone'` | Runner image has no `node_modules`; versions cannot be read from the container |
| TanStack Query **~5.105** | `/tanstack/query/v5.90.3` | [guides/query-keys → Variable Dependencies](https://tanstack.com/query/v5/docs/framework/react/guides/query-keys) | P9: summary key `['metrics','summary']` omits the date range |
| Tailwind **~3.4.19** | `/tailwindlabs/tailwindcss.com` | v3 docs — **this repo is v3**, `tailwind.config.js` exists | DOC-MAP-COMMON says "v4 everywhere"; it is wrong for this repo |
| Zod **3.25.76** | `/colinhacks/zod` (v3 syntax) | v3 API — used only in `config/env.ts`, `errorHandler.ts` | — |
| Docker: `node:20-alpine`, Compose v5.6.1 on Colima | — | [Compose healthcheck](https://docs.docker.com/reference/compose-file/services/#healthcheck) | Healthcheck calls `curl`, which alpine lacks → api "unhealthy", web never starts |

## Repo facts that are not in any library doc

- **Two seed paths, and the docs describe the one that is off.** `docker/postgres/init.sql` runs on first boot;
  `database/seeds/*.ts` (knex) is disabled (`RUN_SEEDS=false`). README's "30 days, business hours" and the
  `failed_login` alias exist only in the knex seeds. See `docs/reproduction-findings.md`.
- Test runner: none exists yet. Vitest (`/vitest-dev/vitest`) is the plan; pin the version when it is added.
