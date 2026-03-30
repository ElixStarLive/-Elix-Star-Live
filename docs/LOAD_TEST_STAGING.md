# Load Testing — Production Staging Guide

## Architecture

```
k6 (load generator)
  → Hetzner Load Balancer (TCP passthrough :80 / :443)
    → Server1 (Traefik → 16x Node workers)
    → Server2 (Traefik → 16x Node workers)
      → Valkey (Server1, shared)
      → Neon Postgres (external, shared)
```

## Pre-test Checklist (BOTH servers)

### 1. Linux Kernel Tuning

SSH into each server and run:

```bash
sudo bash scripts/linux-production-tuning.sh
```

Or apply manually:
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
```

### 2. Docker Container File Descriptor Limits

In Coolify → App → Advanced → Custom Docker Options, add:
```
--ulimit nofile=1000000:1000000
```

Or in Docker Compose format:
```yaml
ulimits:
  nofile:
    soft: 1000000
    hard: 1000000
```

### 3. Traefik Tuning (Coolify Proxy)

Coolify uses Traefik as its reverse proxy. To handle 20k+ connections:

SSH into each server, then:

```bash
# Find the Traefik container
docker ps | grep traefik

# Create/edit Traefik dynamic config
mkdir -p /data/coolify/proxy/dynamic
cat > /data/coolify/proxy/dynamic/high-concurrency.yml << 'EOF'
http:
  serversTransports:
    default:
      maxIdleConnsPerHost: 500
      forwardingTimeouts:
        dialTimeout: "30s"
        responseHeaderTimeout: "30s"
        idleConnTimeout: "90s"
EOF

# Restart Traefik to pick up config
docker restart $(docker ps -q --filter name=coolify-proxy)
```

### 4. Environment Variables (Coolify)

Set these on BOTH app instances (Available at Runtime):

```
LOADTEST_BYPASS_SECRET=elix-loadtest-2026-secret-key
WEB_CONCURRENCY=16
HEALTH_LIGHT=1
HEALTH_CACHE_TTL_MS=30000
FEED_FORYOU_CACHE_TTL_MS=120000
LIVE_STREAMS_CACHE_TTL_MS=30000
CATALOG_VALKEY_TTL_MS=120000
```

Set only on Server1:
```
ELIX_JOB_WORKER=1
```

### 5. Load Test Server (k6)

```bash
# Apply limits on the k6 server too
ulimit -n 250000
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sysctl -w fs.file-max=250000

# Run test
cd ~/elix
git pull
k6 run --insecure-skip-tls-verify \
  --env BASE_URL=https://46.225.33.56 \
  --env BYPASS_KEY=elix-loadtest-2026-secret-key \
  --env MAX_VUS=20000 \
  ./scripts/k6-staged-200k.js
```

## Monitoring During Load Test

### On each app server:

```bash
# Connection state summary
ss -s

# TCP state breakdown
ss -tan state established | wc -l

# File descriptors used by Node
ls /proc/$(pgrep -f "node.*cluster")/fd 2>/dev/null | wc -l

# CPU and memory
top -bn1 | head -20

# Load average
uptime

# Kernel drops/resets
dmesg | tail -30
netstat -s | grep -i -E 'overflow|drop|reset|retrans'
```

### Valkey:

```bash
docker exec <valkey-container> redis-cli info clients
docker exec <valkey-container> redis-cli info stats | grep -E 'connected_clients|blocked_clients|ops_per_sec'
```

### Postgres (Neon dashboard or query):

```sql
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
SELECT count(*) FROM pg_stat_activity WHERE wait_event_type IS NOT NULL;
```

## Expected Behavior After Fixes

| VU Count | Expected Result |
|----------|----------------|
| 5,000    | p95 < 500ms, 0% errors |
| 10,000   | p95 < 1s, < 1% errors |
| 20,000   | p95 < 3s, < 5% errors |
| 40,000+  | Requires 4+ app servers |

## Bottleneck Layers (Priority Order)

1. **Linux kernel** — file descriptors, somaxconn, conntrack
2. **Traefik proxy** — maxIdleConnsPerHost, connection limits
3. **Node.js clustering** — workers must match CPU core count
4. **Postgres pool** — must be sized per-worker to avoid Neon limit
5. **Valkey throughput** — enableAutoPipelining reduces round-trips
6. **Cache stampede** — all cached endpoints need distributed locks
