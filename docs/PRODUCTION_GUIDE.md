# Elix Star Live — Production Guide

## Architecture

```
k6 (load generator, separate server)
  → Hetzner Load Balancer (TCP passthrough :80/:443)
    → Server 1 (Traefik → Node.js x16 workers)
    → Server 2 (Traefik → Node.js x16 workers)
      → Valkey (on Server 1, shared)
      → Neon Postgres (external, shared)
```

Servers: 2x Hetzner CX53 (16 core, 30GB RAM, Ubuntu 24.04)
Load balancer IP: 46.225.33.56
Domain: elixstarlive.co.uk → points to LB IP

## Critical Rules

1. NEVER manually recreate or replace the `coolify-proxy` container.
   Coolify manages Traefik. Manual replacement breaks routing, ACME certs, and Docker service discovery.
2. Only use Traefik dynamic config files in `/data/coolify/proxy/dynamic/`.
3. Only restart proxy via Coolify dashboard: Servers → [server] → Proxy → Restart Proxy.

## Kernel Tuning (EACH server, as root)

Run `bash scripts/linux-production-tuning.sh` on each server, or apply manually:

```bash
sysctl -w fs.file-max=1000000
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_max_syn_backlog=65535
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sysctl -w net.ipv4.tcp_tw_reuse=1
sysctl -w net.ipv4.tcp_fin_timeout=15
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
sysctl -w net.core.netdev_max_backlog=65535
```

Make permanent with `/etc/sysctl.d/99-elix.conf`.

Verify:

| Check | Command | Expected |
|-------|---------|----------|
| file-max | `cat /proc/sys/fs/file-max` | 1000000 |
| somaxconn | `sysctl -n net.core.somaxconn` | 65535 |
| syn_backlog | `sysctl -n net.ipv4.tcp_max_syn_backlog` | 65535 |
| port range | `sysctl -n net.ipv4.ip_local_port_range` | 1024 65535 |

## Traefik Dynamic Config (EACH server)

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

Then in Coolify → App → Edit Labels, add:
```
traefik.http.services.<service-name>.loadbalancer.serversTransport=highconcurrency@file
```
(Find `<service-name>` in the existing Traefik labels for the app.)

## Coolify Environment Variables

Set on BOTH app instances (Runtime):

```
WEB_CONCURRENCY=16
HEALTH_CACHE_TTL_MS=30000
FEED_FORYOU_CACHE_TTL_MS=120000
LIVE_STREAMS_CACHE_TTL_MS=30000
CATALOG_VALKEY_TTL_MS=120000
```

Set only on Server 1:
```
ELIX_JOB_WORKER=1
```

Do NOT set `HEALTH_LIGHT=1` in production — only during load testing.

## Hetzner Load Balancer

- Protocol: TCP passthrough on ports 80 and 443
- Algorithm: Round Robin (or Least Connections)
- Sticky sessions: Enable for WebSocket support (cookie-based)
- Health check: TCP on port 443, interval 15s, timeout 10s, retries 3
- Both servers added as targets

## Load Testing

### Prepare k6 server

```bash
ulimit -n 500000
sysctl -w fs.file-max=1000000
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_tw_reuse=1
```

### Run staged proof test

```bash
cd ~/elix && git pull
k6 run scripts/k6-proof-staged.js \
  --env BASE_URL=https://elixstarlive.co.uk \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-proof-$(date +%s).log
```

Stages: 500 → 1k → 2k → 5k → 8k → 10k → 15k → 20k (2-min hold each).

### Monitor during test (EACH app server, second SSH session)

```bash
watch -n 5 'echo "$(date)"; ss -s; docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -5'
```

## Server Code Summary

| Component | Config | Notes |
|-----------|--------|-------|
| Node.js cluster | `WEB_CONCURRENCY` workers (default: CPU count) | Round-robin scheduling, exponential backoff on crash |
| HTTP server | Port 8080, backlog 8192 | keepAlive 65s, headers 66s, request timeout 120s |
| Postgres pool | ~80 total connections across all workers | Cluster-aware auto-sizing via `DEFAULT_POOL_PER_WORKER` |
| Valkey | Single ioredis connection per worker | Auto-pipelining enabled, 5s connect/command timeout |
| Compression | Level 1, respects `x-no-compression` header | Behind Traefik, minimal overhead |
| WebSocket | `ws` library on shared HTTP server | Heartbeat 30s, max payload 64KB, Valkey pub/sub for cross-worker |
| Rate limiting | Valkey-backed with local fallback | API: 200/min, Auth: 20/min |
| Cache stampede | Valkey distributed locks on all cached endpoints | Feed, streams, profiles, gifts, coin packages |

## Known Bottleneck

Traefik (Coolify proxy) is the connection bottleneck, not the Node.js app.
At 10k VUs: Traefik was at 240% CPU, Node app at 4%.
This is because Traefik does full TLS termination + HTTP parsing for every connection.

## Scaling Path

| Target | Requirement |
|--------|-------------|
| 10k concurrent | Current 2-server setup with tuning |
| 20k concurrent | Traefik tuning via dynamic config, or add 1-2 more servers |
| 50k+ concurrent | 4+ servers behind LB, consider dedicated TLS offload |
