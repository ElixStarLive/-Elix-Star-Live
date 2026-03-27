# Load Testing Suite — Elix Star Live

Prove with real data whether the app can handle **40,000 concurrent users**.

## Prerequisites

### 1. Install k6

```bash
# macOS
brew install k6

# Windows
choco install k6
# or
winget install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker
docker pull grafana/k6
```

### 2. Deploy the Server

- Deploy to your Hetzner/production server
- Ensure Valkey/Redis is running
- Ensure PostgreSQL (Neon) is accessible
- Make sure the server is reachable from your load-test machine

### 3. Create a Test Account (optional)

Register a user on the app for HTTP tests, or let the scripts auto-create users.

---

## Quick Start

### Run all tests (Linux/macOS):
```bash
chmod +x loadtest/test-all.sh

BASE_URL=http://YOUR_SERVER:8080 \
WS_URL=ws://YOUR_SERVER:8080 \
./loadtest/test-all.sh
```

### Run all tests (Windows PowerShell):
```powershell
$env:BASE_URL="http://YOUR_SERVER:8080"
$env:WS_URL="ws://YOUR_SERVER:8080"
.\loadtest\test-all.ps1
```

### Run a single test:
```bash
k6 run --env BASE_URL=http://YOUR_SERVER:8080 \
       --env WS_URL=ws://YOUR_SERVER:8080     \
       loadtest/test1-ws-concurrency.js
```

---

## Test Scenarios

| # | Test | File | What it proves |
|---|------|------|----------------|
| 1 | WebSocket Concurrency | `test1-ws-concurrency.js` | Can the server hold 40K concurrent WS connections |
| 2 | Single Live Room | `test2-live-room.js` | Can 10K users be in one room with correct viewer counts |
| 3 | Chat Stress | `test3-chat-stress.js` | Can chat handle 500 msgs/sec without drops |
| 4 | Gift Burst | `test4-gift-burst.js` | No duplicate transactions, no missed gift events |
| 5 | Feed/API HTTP | `test5-feed-api.js` | HTTP endpoint latency under load (p50/p95/p99) |
| 6 | Reconnection Storm | `test6-reconnect.js` | Users rejoin correctly after disconnect waves |

---

## Metrics Collected

Each test reports:

- **ws_connect_success** — % of WebSocket connections that succeeded
- **ws_connect_duration** — time to establish WS connection
- **ws_disconnects** — unexpected disconnections
- **chat_latency_ms** — message round-trip time
- **gift_latency_ms** — gift event delivery time
- **feed_latency_ms** — HTTP feed response time (p50/p95/p99)
- **profile_latency_ms** — HTTP profile response time
- **reconnect_latency_ms** — time to reconnect after disconnect
- **duplicate_gift_events** — gift dedup failures
- **ghost_state_detected** — rooms with stale state after reconnect
- **http_success_rate** — % of HTTP requests that succeeded
- Custom counters for messages sent/received

---

## Interpreting Results

### Pass/Fail Thresholds (built into each test)

| Metric | Threshold | Meaning |
|--------|-----------|---------|
| ws_connect_success | >95% | At least 95% of WS connections must succeed |
| ws_connect_duration p95 | <2000ms | 95% of connections establish within 2s |
| chat_latency p95 | <500ms | Chat messages delivered within 500ms |
| feed_latency p95 | <500ms | Feed API responds within 500ms |
| http_success_rate | >99% | Less than 1% HTTP errors |
| duplicate_gift_events | <10 | Nearly zero gift dedup failures |
| ghost_state_detected | <20 | Nearly zero ghost state after reconnect |

### How to read the final verdict

After running all tests, check each `*-summary.json`:

```json
{
  "metrics": {
    "ws_connect_success": { "rate": 0.97 },
    "ws_connect_duration": { "p(95)": 1200 },
    ...
  },
  "thresholds": {
    "ws_connect_success": { "ok": true },
    ...
  }
}
```

- If ALL thresholds show `"ok": true` at the 40K level → **40K PROVEN**
- If thresholds fail at some level → **MAX IS X** (the last stable level)
- If tests cannot complete → **SYSTEM FAILS AT X USERS**

---

## Running at 40K Scale

**You CANNOT run 40K concurrent WebSocket connections from a single laptop.**

### Option A: Multiple k6 machines (recommended)

Run the same test split across 4 machines, each handling 10K:

```bash
# Machine 1 (handles VUs 0–25%)
k6 run --execution-segment "0:1/4" \
       --env BASE_URL=http://YOUR_SERVER:8080 \
       --env WS_URL=ws://YOUR_SERVER:8080 \
       loadtest/test1-ws-concurrency.js

# Machine 2 (handles VUs 25–50%)
k6 run --execution-segment "1/4:2/4" ...

# Machine 3 (handles VUs 50–75%)
k6 run --execution-segment "2/4:3/4" ...

# Machine 4 (handles VUs 75–100%)
k6 run --execution-segment "3/4:1" ...
```

### Option B: k6 Cloud

```bash
k6 cloud loadtest/test1-ws-concurrency.js
```

k6 Cloud distributes load automatically across regions.

### Option C: Docker on a beefy VM

Spin up a large VM (16+ cores, 32GB+ RAM) just for load generation:

```bash
docker run --rm -i \
  -e BASE_URL=http://YOUR_SERVER:8080 \
  -e WS_URL=ws://YOUR_SERVER:8080 \
  -v $(pwd)/loadtest:/loadtest \
  grafana/k6 run /loadtest/test1-ws-concurrency.js
```

---

## Server-Side Monitoring

While tests run, monitor the server:

```bash
# CPU and memory per process
htop

# WebSocket connection count
ss -s | grep estab

# Open file descriptors (each WS = 1 fd)
cat /proc/sys/fs/file-nr

# PostgreSQL active connections
psql -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Valkey/Redis info
redis-cli INFO clients
redis-cli INFO memory
redis-cli INFO stats

# Node.js process memory (if using PM2)
pm2 monit
```

### Tuning the OS for 40K connections

On the **server**, set these before testing:

```bash
# Increase file descriptor limit
ulimit -n 100000

# Or permanently in /etc/security/limits.conf:
# * soft nofile 100000
# * hard nofile 100000

# Increase TCP/socket buffers
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_max_syn_backlog=65535
sysctl -w net.core.netdev_max_backlog=65535
sysctl -w fs.file-max=200000
```

On the **load-test machine**, also increase limits:
```bash
ulimit -n 100000
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
```

---

## Scaling the Test Targets

If 40K is too aggressive for your first run, start smaller:

### Smoke test (verify everything works)
Edit stage targets to: 10 → 50 → 100 → 100 → 0

### Small scale (1K)
Edit stage targets to: 100 → 500 → 1000 → 1000 → 0

### Medium scale (10K)
Edit stage targets to: 1000 → 5000 → 10000 → 10000 → 0

### Full scale (40K)
Use the defaults in the test files.

---

## Results Directory

After running, find results in `loadtest/results/<timestamp>/`:

```
results/
  20260327_120000/
    01-ws-concurrency.json          # Raw metrics (importable to Grafana)
    01-ws-concurrency-summary.json  # Summary with pass/fail
    01-ws-concurrency.log           # Console output
    02-live-room.json
    02-live-room-summary.json
    02-live-room.log
    ...
```

---

## Final Verdict Template

After running all tests, fill in:

```
LOAD TEST RESULTS — Elix Star Live
Date: ___
Server: ___ (cores / RAM / workers)

Test 1 — WS Concurrency:
  Max stable connections: ___
  Degradation started at: ___
  Failure at: ___
  Verdict: PASS / FAIL at 40K

Test 2 — Live Room:
  Max users in single room: ___
  Viewer count accuracy: ___
  Verdict: PASS / FAIL

Test 3 — Chat Stress:
  Max throughput: ___ msg/sec
  p95 latency: ___ ms
  Drop rate: ___%
  Verdict: PASS / FAIL

Test 4 — Gift Burst:
  Duplicates: ___
  Missed events: ___
  Verdict: PASS / FAIL

Test 5 — Feed/API:
  p50: ___ ms / p95: ___ ms / p99: ___ ms
  Error rate: ___%
  Verdict: PASS / FAIL

Test 6 — Reconnection:
  Success rate: ___%
  Ghost state: ___
  Verdict: PASS / FAIL

OVERALL VERDICT:
  [ ] 40K PROVEN
  [ ] 40K NOT REACHED — MAX IS ___
  [ ] SYSTEM FAILS AT ___ USERS
```
