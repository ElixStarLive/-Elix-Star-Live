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

## CRITICAL: Step-by-step execution order

### Step 1: Fix BOTH app servers (Server1 + Server2)

SSH into each server and run:

```bash
# Download and run the diagnose + fix script
cd /tmp
curl -sL https://raw.githubusercontent.com/<YOUR-REPO>/main/scripts/server-diagnose-and-fix.sh -o fix.sh
# OR copy-paste the script content, then:
bash fix.sh
```

Or manually copy `scripts/server-diagnose-and-fix.sh` to each server and run `bash server-diagnose-and-fix.sh`.

The script will:
- Show BEFORE state (current limits)
- Apply all kernel + fd fixes
- Update Docker daemon defaults
- Restart Docker
- Show AFTER state (verified)

**Important:** After the script runs, Docker restarts. You MUST redeploy the app in Coolify.

### Step 2: Verify container limits after redeploy

After Coolify redeploys, SSH into each server and run:

```bash
# Find app container name
docker ps --format '{{.Names}}' | grep -i elix

# Check its file descriptor limit (must be 1000000)
docker exec <container-name> sh -c 'cat /proc/1/limits | grep "open files"'

# Check Traefik proxy limit too
docker exec $(docker ps -q --filter name=coolify-proxy) sh -c 'cat /proc/1/limits | grep "open files"'
```

If app container shows 1024 or 65536 instead of 1000000:
- In Coolify → App → Advanced → Custom Docker Options, add: `--ulimit nofile=1000000:1000000`
- Redeploy again

### Step 3: Traefik high-concurrency config

On EACH server:

```bash
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

docker restart $(docker ps -q --filter name=coolify-proxy)
```

### Step 4: Environment variables in Coolify

Set on BOTH app instances (Runtime):

```
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

### Step 5: Prepare k6 server

SSH into k6 server (159.69.116.85):

```bash
cd ~/elix
git pull

bash scripts/k6-server-prepare.sh
```

### Step 6: Run staged test

```bash
cd ~/elix
k6 run scripts/k6-staged-progressive.js \
  --env BASE_URL=https://elixstarlive.co.uk \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-progressive-$(date +%s).log
```

### Step 7: Monitor during test

On each app server (in a second SSH session):

```bash
cd /tmp
# Copy server-monitor-during-test.sh here, then:
bash server-monitor-during-test.sh
```

This captures every 10 seconds:
- CPU + load
- Memory
- Socket state (ss -s)
- TCP breakdown
- Conntrack usage
- Docker container CPU/MEM
- App container fd count
- dmesg errors

---

## Verification checklist

After Step 1, BEFORE testing, verify on EACH server:

| Check | Command | Expected |
|-------|---------|----------|
| file-max | `cat /proc/sys/fs/file-max` | 1000000 |
| somaxconn | `sysctl -n net.core.somaxconn` | 65535 |
| syn_backlog | `sysctl -n net.ipv4.tcp_max_syn_backlog` | 65535 |
| port range | `sysctl -n net.ipv4.ip_local_port_range` | 1024 65535 |
| tcp_tw_reuse | `sysctl -n net.ipv4.tcp_tw_reuse` | 1 |
| conntrack_max | `sysctl -n net.netfilter.nf_conntrack_max` | 1000000 |
| host ulimit | `ulimit -n` | 1000000 |
| app container nofile | `docker exec <app> cat /proc/1/limits \| grep nofile` | 1000000 |
| traefik container nofile | `docker exec <traefik> cat /proc/1/limits \| grep nofile` | 1000000 |

**If ANY of these are wrong, the test will fail with connection resets.**

---

## Expected results after fixes

| VU Count | Expected Result |
|----------|----------------|
| 2,000 | p95 < 200ms, 0% errors |
| 5,000 | p95 < 500ms, < 0.5% errors |
| 10,000 | p95 < 1s, < 1% errors |
| 15,000 | p95 < 2s, < 3% errors |
| 20,000 | p95 < 5s, < 5% errors |

## Bottleneck layers (priority order)

1. **Linux kernel** — file descriptors, somaxconn, conntrack, port range
2. **Docker container limits** — nofile must be 1M for BOTH app + proxy containers
3. **Traefik proxy** — maxIdleConnsPerHost, timeout settings
4. **Node.js clustering** — workers must match CPU core count (16)
5. **Postgres pool** — cluster-aware sizing (total ~80 across all workers)
6. **Valkey throughput** — enableAutoPipelining reduces round-trips
7. **Cache stampede** — all cached endpoints use distributed locks

## Monitoring during test

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
