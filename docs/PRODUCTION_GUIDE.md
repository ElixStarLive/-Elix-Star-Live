# Elix Star Live — Production Guide

## Architecture

```
Client App (mobile / web)
  → Hetzner Load Balancer (TCP passthrough :80/:443)
    → Server 1: Traefik (TLS termination) → Node.js x16 workers
    → Server 2: Traefik (TLS termination) → Node.js x16 workers
      → Valkey (on Server 1, shared by both servers)
      → Neon Postgres (external, shared by both servers)
```

Servers: 2x Hetzner (16 core, 30GB RAM, Ubuntu 24.04)
Load balancer IP: 46.225.33.56
Domain: elixstarlive.co.uk → points to LB IP

## Critical Rules

1. **NEVER** manually recreate or replace the `coolify-proxy` container.
   Coolify manages Traefik. Manual replacement breaks routing, ACME certs, and Docker service discovery.
2. Only use Traefik dynamic config files in `/data/coolify/proxy/dynamic/`.
3. Only restart proxy via Coolify dashboard: Servers → [server] → Proxy → Restart Proxy.
4. **NEVER** expose secrets in client code or commit `.env` files.

---

## Infrastructure Changes Required

### 1. Hetzner Load Balancer Upgrade

The current LB tier is **lb11** with a 10,000 simultaneous connection cap.
At 20k+ VUs, the LB physically cannot accept all connections.

**Action:** In Hetzner Cloud Console → Load Balancers → select the LB → Resize:
- For 20k target: upgrade to **lb21** (25,000 connections)
- For 40k target: upgrade to **lb31** (50,000 connections)

LB configuration:
- Protocol: TCP passthrough on ports 80 and 443
- Algorithm: Round Robin (or Least Connections)
- Sticky sessions: Enable for WebSocket support (cookie-based)
- Health check: TCP on port 443, interval 15s, timeout 10s, retries 3
- Both servers added as targets

### 2. Traefik GOMAXPROCS

Traefik's Go runtime may not use all CPU cores inside Docker.
Set `GOMAXPROCS` on both servers.

**Action:** In Coolify → each Server → Proxy settings, add environment variable:
```
GOMAXPROCS=16
```
Then restart proxy via Coolify dashboard.

### 3. Traefik Dynamic Config (EACH server)

```bash
mkdir -p /data/coolify/proxy/dynamic
cat > /data/coolify/proxy/dynamic/high-concurrency.yml << 'EOF'
http:
  serversTransports:
    highconcurrency:
      maxIdleConnsPerHost: 1000
      forwardingTimeouts:
        dialTimeout: "30s"
        responseHeaderTimeout: "60s"
        idleConnTimeout: "90s"
EOF
```

Traefik auto-reloads this file. No container restart needed.

### 4. Attach Traefik Transport to App Service

In Coolify → App → Edit Labels, add:
```
traefik.http.services.<service-name>.loadbalancer.serversTransport=highconcurrency@file
```
Find `<service-name>` in the existing Traefik labels for the app.

### 5. Container File Descriptor Limits

In Coolify → App → Docker Compose or Advanced settings, set:
```json
"ulimits": { "nofile": { "soft": 1000000, "hard": 1000000 } }
```

---

## Kernel Tuning (EACH server, as root)

Run `bash scripts/linux-production-tuning.sh` on each server, or apply manually:

```bash
sysctl -w fs.file-max=1000000
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_max_syn_backlog=65535
sysctl -w net.netfilter.nf_conntrack_max=1000000
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sysctl -w net.ipv4.tcp_tw_reuse=1
sysctl -w net.ipv4.tcp_fin_timeout=15
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
sysctl -w net.core.netdev_max_backlog=65535
sysctl -w net.ipv4.tcp_keepalive_time=300
sysctl -w net.ipv4.tcp_keepalive_intvl=30
sysctl -w net.ipv4.tcp_keepalive_probes=5
```

Make permanent: copy to `/etc/sysctl.d/99-elix.conf` and run `sysctl --system`.

Verify:

| Check | Command | Expected |
|-------|---------|----------|
| file-max | `cat /proc/sys/fs/file-max` | 1000000 |
| somaxconn | `sysctl -n net.core.somaxconn` | 65535 |
| syn_backlog | `sysctl -n net.ipv4.tcp_max_syn_backlog` | 65535 |
| port range | `sysctl -n net.ipv4.ip_local_port_range` | 1024 65535 |

---

## Coolify Environment Variables

Set on BOTH app instances (Runtime):

```
WEB_CONCURRENCY=16
HEALTH_CACHE_TTL_MS=30000
FEED_FORYOU_CACHE_TTL_MS=120000
LIVE_STREAMS_CACHE_TTL_MS=30000
CATALOG_VALKEY_TTL_MS=120000
BACKPRESSURE_LAG_MS=500
MAX_WS_CONNECTIONS=10000
LOADTEST_BYPASS_SECRET=<your-secret>
```

Set only on ONE instance (Server 1):
```
ELIX_JOB_WORKER=1
```

Do NOT set `HEALTH_LIGHT=1` in production — only during load testing.

---

## Load Testing

### Step 1: Prepare k6 Load Generator Machine

```bash
ulimit -n 500000
sysctl -w fs.file-max=1000000
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_tw_reuse=1
```

### Step 2: Bypass-LB Test (MUST DO FIRST)

Test directly against one server's IP to prove the app works independently
of the LB. This isolates whether failures are app vs infrastructure.

```bash
k6 run scripts/k6-bypass-lb.js \
  --env SERVER_IP=<server-1-public-ip> \
  --env BYPASS_KEY='<loadtest-secret>' \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-bypass-$(date +%s).log
```

This ramps 100 → 500 → 1k → 2k → 5k → 8k → 10k with holds.
The `Host` header is set automatically so Traefik routes correctly.

If this PASSES: the app is fine, and the problem is in the LB or between LB and servers.
If this FAILS: the bottleneck is in Traefik or the app itself on this server.

### Step 3: Full Staged Test (through LB)

```bash
k6 run scripts/k6-staged-500-to-40k.js \
  --env BASE_URL=https://elixstarlive.co.uk \
  --env BYPASS_KEY='<loadtest-secret>' \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-full-$(date +%s).log
```

For a faster ~5 min run:
```bash
k6 run scripts/k6-staged-500-to-40k.js \
  --env BASE_URL=https://elixstarlive.co.uk \
  --env BYPASS_KEY='<loadtest-secret>' \
  --env FAST=1 \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-fast-$(date +%s).log
```

### Step 4: Monitor During Test (EACH app server, second SSH session)

```bash
watch -n 5 'echo "$(date)"; ss -s; docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -5'
```

### Step 5: Record Results

For each VU stage, record:

| VU Level | Status | http_req_failed | p95 latency | Traefik CPU | Node CPU | Bottleneck |
|----------|--------|-----------------|-------------|-------------|----------|------------|
| 500 | PASS/FAIL | % | ms | % | % | |
| 1k | | | | | | |
| 2k | | | | | | |
| 5k | | | | | | |
| 8k | | | | | | |
| 10k | | | | | | |
| 15k | | | | | | |
| 20k | | | | | | |

---

## Server Code Summary

| Component | Config | Notes |
|-----------|--------|-------|
| Node.js cluster | `WEB_CONCURRENCY` workers (default: CPU count) | Round-robin scheduling, exponential backoff on crash |
| HTTP server | Port 8080, backlog 8192 | keepAlive 65s, headers 66s, request timeout 120s |
| Postgres pool | ~80 total connections across all workers | Cluster-aware auto-sizing via `DEFAULT_POOL_PER_WORKER` |
| Valkey | Single ioredis connection per worker | Auto-pipelining enabled, 5s connect/command timeout |
| Compression | Level 1, respects `x-no-compression` header | Behind Traefik, minimal overhead |
| WebSocket | `ws` library on shared HTTP server | Heartbeat 30s, max payload 64KB, max 10k connections, Valkey pub/sub |
| Rate limiting | Valkey-backed with local fallback (fail-open on Valkey error) | API: 200/min, Auth: 20/min |
| Cache stampede | Valkey distributed locks on all cached endpoints | Feed, streams, profiles, gifts, coin packages |
| Backpressure | Event loop lag monitor, 503 when lag > 500ms | Configurable via BACKPRESSURE_LAG_MS |
| Health cache | Shared across workers via Valkey, per-worker fallback | Configurable via HEALTH_CACHE_TTL_MS |

## Known Bottleneck

Traefik (Coolify proxy) is the connection bottleneck, not the Node.js app.
At 10k VUs in earlier tests: Traefik was at 240% CPU, Node app at 4%.
This is because Traefik does full TLS termination + HTTP parsing for every connection.

## Scaling Path

| Target | Requirement |
|--------|-------------|
| 10k concurrent | Current 2-server setup with kernel tuning + Traefik GOMAXPROCS |
| 20k concurrent | Upgrade LB to lb21 + Traefik dynamic config attached |
| 40k concurrent | Upgrade LB to lb31 + 4 servers, or dedicated TLS offload |
| 100k+ concurrent | Multiple LBs, dedicated Nginx/HAProxy for TLS, horizontal Node scaling |
