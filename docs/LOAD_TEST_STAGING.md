# Staged load testing (backend observability)

Use **staged virtual users** before attempting ~40k VUs. The load generator host can OOM or be SIGKILL’d under extreme parallelism — watch `dmesg`, k6 `--summary-export`, and **free RAM** on the runner.

## Recommended stages (max VUs per stage, hold ~60s each)

1. 2500  
2. 5000  
3. 7500  
4. 10000  
5. 12500  
6. 15000  

Pause between stages to let pools and Valkey settle. **Do not** treat a partial run (e.g. ~28.5k / 40k before the process died) as a capacity number.

## Pool + cache sampling (no extra DB ping)

`GET /api/metrics?light=1` (or `?pool_only=1`) with `Authorization: Bearer <METRICS_SECRET>` returns:

- `pg_pool.waiting`, `pg_pool.total`, `pg_pool.idle`
- `cache_layer` — raw counters for feed / streams / catalog / profiles list
- `cache_hit_rates` — derived ratios (per **Node worker**; aggregate across instances in Coolify if clustered)
- `slow_requests` — counts of responses over `LOG_SLOW_HTTP_MS` (wall) and `LOG_SLOW_DB_MS` (Postgres time in request)

**Full** `GET /api/metrics` still runs dependency pings (`SELECT 1` + Valkey) — avoid polling it every second under load; use **`light=1`** during stages.

Example:

```bash
curl -sS -H "Authorization: Bearer $METRICS_SECRET" \
  "https://your-api/api/metrics?light=1" | jq '.pg_pool, .cache_hit_rates, .slow_requests'
```

## Logs: `dbQueries` / `dbMs` on slow paths

- Set `LOG_DB_STATS=1` for verbose per-request logs (spiky volume), **or**
- Rely on `slow_requests` + default `http_request` logs when sampled / slow heuristics match.

Tune thresholds:

- `LOG_SLOW_HTTP_MS` (default `2000`) — increments `slow_requests.wall_ms_threshold`
- `LOG_SLOW_DB_MS` (default `200`) — increments `slow_requests.db_ms_threshold`

## Health checks vs load

- `/health` and `/api/health` sit **before** `/api` rate limits but still cost **one DB `SELECT 1`** per cache miss.
- **`HEALTH_CACHE_TTL_MS`** (default `12000`, max `300000`) — lengthen during tests to cut probe load.
- **`HEALTH_LIGHT=1`** — skips `getVideoCountAsync()` (cheaper body).
- **`HEALTH_SKIP_VALKEY_PING=1`** — skips Valkey PING on health refresh only; **Valkey may be degraded without detection** — use only in controlled test windows.

## Hot paths (audit summary)

| Endpoint | Behavior under load |
|----------|----------------------|
| **`GET /api/feed/foryou`** | Valkey page cache keyed by epoch + `(page,limit)`; miss runs one bounded `FORYOU_SQL` (JOIN + `LIMIT`/`OFFSET`). |
| **`GET /api/live/streams`** | Valkey HTTP cache + ETag; miss may call **LiveKit list rooms** + Valkey `HGETALL` batch, or **DB fallback** if LiveKit fails. TTL: **`LIVE_STREAMS_CACHE_TTL_MS`** (default 14s, max 120s). |

## k6 runner host

If k6 is **SIGKILL**’d, check **RAM**, **ulimit**, and **systemd/OOM killer**. Reduce VUs or use `rps` caps / longer ramp. Running k6 on the **same** 16GB box as the app competes for CPU/RAM with the workload under test — prefer a separate generator machine.
