# Infrastructure Checklist — Elix Star Live Production Scaling

**Purpose:** Step-by-step checklist to fix routing, upgrade infrastructure, and validate under load.
**Rule:** Do not skip steps. Do not run load tests until Step 7 validation passes.

---

## PHASE 0 — Fix Coolify / Traefik routing (MUST DO FIRST)

Public requests currently return `TRAEFIK DEFAULT CERT` + `503 no available server`.
Nothing else matters until this is fixed.

### 0.1 — SSH into Server 1 and check container status

```bash
docker ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -i elix
```

- [ ] App container is listed
- [ ] Status shows `Up` and `(healthy)`
- [ ] If not running, check: `docker logs --tail 100 <CONTAINER_NAME>`

### 0.2 — Check what port the app is listening on

```bash
ss -tulpn | grep LISTEN | grep -E '8080|3000|443|80'
```

- [ ] Port 8080 shows a Node process listening

### 0.3 — Test app directly from inside the server

```bash
curl -s http://localhost:8080/health
curl -s http://localhost:8080/api/health
```

- [ ] Returns JSON with `"status":"ok"` or `"status":"degraded"`
- [ ] If no response: the app is not running — check container logs

### 0.4 — Check Traefik labels on the app container

```bash
docker inspect <APP_CONTAINER> --format '{{json .Config.Labels}}' | python3 -m json.tool
```

Look for:
- [ ] `traefik.enable` = `true`
- [ ] `traefik.http.routers.*.rule` contains `Host(\`elixstarlive.co.uk\`)` (or `www.elixstarlive.co.uk`)
- [ ] `traefik.http.routers.*.tls.certresolver` has a valid resolver name
- [ ] `traefik.http.services.*.loadbalancer.server.port` = `8080`

### 0.5 — Check Docker network

```bash
docker inspect <APP_CONTAINER> --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool
docker inspect coolify-proxy --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool
```

- [ ] App and Traefik share a network (usually `coolify`)

### 0.6 — Check Traefik logs

```bash
docker logs --tail 200 coolify-proxy 2>&1 | grep -iE "elix|no available|error|cert|acme"
```

- [ ] No "no available server" for this app
- [ ] No ACME/cert errors for `elixstarlive.co.uk`

### 0.7 — Fix in Coolify dashboard

1. Go to Coolify → Projects → Elix Star Live
2. Check app shows **Running** and **Healthy**
3. Go to **Network** → confirm port is **8080**
4. Go to **Domains** → confirm `elixstarlive.co.uk` is listed
5. If missing → add the domain back
6. Go to **Build** → confirm build pack is **Dockerfile**, path is `Dockerfile`
7. **Redeploy**

- [ ] Domain is assigned
- [ ] Port is 8080
- [ ] Build pack is Dockerfile
- [ ] Redeploy completed successfully

### 0.8 — Validate public access

```bash
curl -vso /dev/null https://elixstarlive.co.uk/api/health 2>&1 | grep -E 'subject:|HTTP/|< '
```

- [ ] Certificate subject is `elixstarlive.co.uk` (NOT `TRAEFIK DEFAULT CERT`)
- [ ] HTTP status is `200`

```bash
curl -s https://elixstarlive.co.uk/api/health | python3 -m json.tool
```

- [ ] Returns `"status":"ok"`
- [ ] `"database": true`
- [ ] `"valkey": true`

### 0.9 — Repeat Steps 0.1–0.8 on Server 2

- [ ] Server 2 app container is running and healthy
- [ ] Server 2 app responds on localhost:8080
- [ ] Server 2 Traefik labels are correct

**STOP HERE if 0.8 does not pass. Do not proceed to Phase 1.**

---

## PHASE 1 — Bypass-LB test (app path only)

Test one server directly, bypassing the load balancer, to prove the app works.

### 1.1 — Prepare the k6 load generator machine

```bash
ulimit -n 500000
sysctl -w fs.file-max=1000000
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_tw_reuse=1
```

### 1.2 — Run bypass-LB test against Server 1

```bash
k6 run scripts/k6-bypass-lb.js \
  --env SERVER_IP=<SERVER_1_PUBLIC_IP> \
  --env BYPASS_KEY='<LOADTEST_BYPASS_SECRET>' \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-bypass-s1-$(date +%s).log
```

### 1.3 — Record results for Server 1

| VU Level | status 2xx % | err_rate_limited | err_backpressure | err_server_5xx | err_conn_reset | err_timeout | p95 latency |
|----------|-------------|-----------------|-----------------|---------------|---------------|-------------|-------------|
| 100 | | | | | | | |
| 500 | | | | | | | |
| 1000 | | | | | | | |
| 2000 | | | | | | | |
| 5000 | | | | | | | |
| 8000 | | | | | | | |
| 10000 | | | | | | | |

### 1.4 — Monitor Server 1 during test (second SSH session)

```bash
watch -n 5 'echo "=== $(date) ==="; \
  echo "--- ss ---"; ss -s; \
  echo "--- docker ---"; docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -5; \
  echo "--- fds ---"; cat /proc/sys/fs/file-nr'
```

- [ ] Record Traefik CPU at each VU level
- [ ] Record Node CPU at each VU level
- [ ] Note which component saturates first

### 1.5 — Run bypass-LB test against Server 2

```bash
k6 run scripts/k6-bypass-lb.js \
  --env SERVER_IP=<SERVER_2_PUBLIC_IP> \
  --env BYPASS_KEY='<LOADTEST_BYPASS_SECRET>' \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-bypass-s2-$(date +%s).log
```

- [ ] Record same table for Server 2

### 1.6 — Phase 1 verdict

- [ ] Both servers pass at 1k with >98% success?
- [ ] Both servers pass at 5k with >95% success?
- [ ] What is the highest VU level that passes on a single server?
- [ ] Is Traefik or Node the first to saturate?

**If both servers fail at low VU (e.g. 500), the problem is in the app or its dependencies — investigate before continuing.**

---

## PHASE 2 — Infrastructure upgrades

### 2.1 — Upgrade Hetzner Load Balancer

Go to Hetzner Cloud Console → Load Balancers → select the LB.

- [ ] Current tier noted: ___________
- [ ] Resize to **lb31** (50,000 connections)
- [ ] Confirm both servers are listed as targets
- [ ] Confirm health check is: protocol HTTP, port 8080, path `/health`, interval 10s, timeout 5s, retries 3
- [ ] Confirm sticky sessions are **enabled** (cookie-based)

### 2.2 — Decide TLS termination location

**Option A (recommended):** Move TLS to the LB
- Change LB services from TCP passthrough to: Frontend HTTPS :443 → Backend HTTP :8080
- Upload or provision SSL certificate on the LB
- Traefik then receives plain HTTP — massive CPU reduction

**Option B:** Keep TLS at Traefik
- Requires GOMAXPROCS and Traefik tuning (Steps 2.4, 2.5)
- More CPU-intensive but no cert management at LB

- [ ] Decision: Option A / Option B
- [ ] If Option A: LB protocol changed to HTTPS→HTTP
- [ ] If Option A: SSL certificate uploaded/provisioned

### 2.3 — Kernel tuning (BOTH servers, as root)

```bash
bash scripts/linux-production-tuning.sh
```

Then make permanent:

```bash
cp scripts/linux-production-tuning.sh /root/
cat > /etc/sysctl.d/99-elix.conf << 'EOF'
fs.file-max=1000000
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=65535
net.netfilter.nf_conntrack_max=1000000
net.ipv4.ip_local_port_range=1024 65535
net.ipv4.tcp_tw_reuse=1
net.ipv4.tcp_fin_timeout=15
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.ipv4.tcp_rmem=4096 87380 16777216
net.ipv4.tcp_wmem=4096 65536 16777216
net.core.netdev_max_backlog=65535
net.ipv4.tcp_keepalive_time=300
net.ipv4.tcp_keepalive_intvl=30
net.ipv4.tcp_keepalive_probes=5
EOF
sysctl --system
```

Verify:

```bash
cat /proc/sys/fs/file-max          # expect 1000000
sysctl -n net.core.somaxconn       # expect 65535
sysctl -n net.ipv4.tcp_max_syn_backlog  # expect 65535
sysctl -n net.ipv4.ip_local_port_range  # expect 1024 65535
```

- [ ] Server 1 tuned and verified
- [ ] Server 2 tuned and verified
- [ ] `/etc/sysctl.d/99-elix.conf` created on both servers

### 2.4 — Traefik GOMAXPROCS (BOTH servers)

In Coolify → each Server → Proxy settings → Environment variables:

```
GOMAXPROCS=16
```

Then restart proxy via Coolify: Servers → [server] → Proxy → **Restart Proxy**.

**Do NOT run `docker rm` or `docker restart` on `coolify-proxy` manually.**

- [ ] Server 1: GOMAXPROCS=16 set, proxy restarted via Coolify
- [ ] Server 2: GOMAXPROCS=16 set, proxy restarted via Coolify

### 2.5 — Deploy Traefik connection pooling config (BOTH servers)

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

Traefik auto-reloads dynamic config files — no restart needed.

- [ ] Server 1: `/data/coolify/proxy/dynamic/high-concurrency.yml` created
- [ ] Server 2: `/data/coolify/proxy/dynamic/high-concurrency.yml` created

### 2.6 — Attach serversTransport label to app service

In Coolify → App → Edit Labels, add:

```
traefik.http.services.<service-name>.loadbalancer.serversTransport=highconcurrency@file
```

Find `<service-name>` from existing labels (look for `traefik.http.services.*.loadbalancer`).

- [ ] Label added on Server 1 app
- [ ] Label added on Server 2 app
- [ ] Redeployed after label change

### 2.7 — Container file descriptor limits

In Coolify → App → Docker Compose / Advanced settings:

```
ulimits:
  nofile:
    soft: 1000000
    hard: 1000000
```

Or in Coolify environment/settings if Docker Compose option is not available.

- [ ] ulimits set on Server 1 app
- [ ] ulimits set on Server 2 app

### 2.8 — Validate after infrastructure changes

```bash
# Public health check
curl -s https://elixstarlive.co.uk/api/health | python3 -m json.tool

# Certificate check
curl -vso /dev/null https://elixstarlive.co.uk 2>&1 | grep 'subject:'

# Both servers responding via LB (run multiple times)
for i in $(seq 1 10); do curl -s https://elixstarlive.co.uk/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('port','?'))"; done
```

- [ ] Health returns 200
- [ ] Certificate is correct
- [ ] Traffic reaches both servers (if port shows on both)

---

## PHASE 3 — Staged load test through LB

Only proceed if Phase 0 and Phase 2 validation pass.

### 3.1 — Run staged test

```bash
k6 run scripts/k6-staged-0-1k-5k-10k-20k.js \
  --env BASE_URL=https://elixstarlive.co.uk \
  --env BYPASS_KEY='<LOADTEST_BYPASS_SECRET>' \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-staged-$(date +%s).log
```

### 3.2 — Record results at each VU level

| VU | status 2xx % | err_rate_limited | err_backpressure | err_5xx | err_reset | err_timeout | p50 ms | p95 ms | p99 ms | Traefik CPU S1 | Node CPU S1 | Traefik CPU S2 | Node CPU S2 | Memory |
|----|-------------|-----------------|-----------------|---------|-----------|-------------|--------|--------|--------|---------------|------------|---------------|------------|--------|
| 500 | | | | | | | | | | | | | | |
| 1000 | | | | | | | | | | | | | | |
| 2000 | | | | | | | | | | | | | | |
| 5000 | | | | | | | | | | | | | | |
| 8000 | | | | | | | | | | | | | | |
| 10000 | | | | | | | | | | | | | | |
| 15000 | | | | | | | | | | | | | | |
| 20000 | | | | | | | | | | | | | | |

### 3.3 — Monitor during test (BOTH servers, second SSH session each)

```bash
watch -n 5 'echo "=== $(date) ==="; \
  echo "--- ss ---"; ss -s; \
  echo "--- docker ---"; docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -5; \
  echo "--- fds ---"; cat /proc/sys/fs/file-nr; \
  echo "--- conntrack ---"; cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null || echo "n/a"'
```

### 3.4 — Phase 3 analysis

- [ ] What is the highest VU that passes with >98% success?
- [ ] Where does degradation start?
- [ ] What is the bottleneck? (Traefik CPU / Node CPU / LB connections / DB pool / Valkey / kernel)
- [ ] Are err_rate_limited counts zero? (they should be if bypass key is working)

---

## PHASE 4 — Extended test (30k → 40k)

Only proceed if 20k passes in Phase 3.

### 4.1 — Run full staged test

```bash
k6 run scripts/k6-staged-500-to-40k.js \
  --env BASE_URL=https://elixstarlive.co.uk \
  --env BYPASS_KEY='<LOADTEST_BYPASS_SECRET>' \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-40k-$(date +%s).log
```

Note: a single k6 machine may OOM above ~10k VUs. For 40k total, use 4 machines each running:

```bash
k6 run scripts/k6-steady-10k.js \
  --env BASE_URL=https://elixstarlive.co.uk \
  --env BYPASS_KEY='<LOADTEST_BYPASS_SECRET>' \
  --env VUS=10000 \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-10k-node$(hostname)-$(date +%s).log
```

### 4.2 — Record results (same format as Phase 3 table for 25k, 30k, 35k, 40k)

---

## PHASE 5 — Final report

Fill in only after evidence exists.

### 5.1 — Architecture

```
[Diagram of actual traffic flow — fill in after testing]
```

### 5.2 — Root cause of original failure

```
[Fill in after all phases complete]
```

### 5.3 — What was changed

```
[List every infrastructure change made]
```

### 5.4 — Proven capacity

```
Highest VU that passed with >98% success: ___________
Evidence: [log file path]
```

### 5.5 — Remaining limits

```
[What still blocks scaling beyond the proven level]
```

### 5.6 — Unproven areas

These have NOT been load-tested and must not be claimed as "working":

- [ ] WebSocket concurrency at target VU level
- [ ] Database pool under full concurrent query load
- [ ] Valkey throughput under full pub/sub + rate limiting load
- [ ] App-level correctness (gifts, battles, auth) under load
- [ ] Memory stability during sustained high load

---

## Checklist summary

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Fix Coolify/Traefik routing | [ ] |
| 1 | Bypass-LB test (app path only) | [ ] |
| 2 | Infrastructure upgrades | [ ] |
| 3 | Staged load test through LB | [ ] |
| 4 | Extended test (30k–40k) | [ ] |
| 5 | Final report with evidence | [ ] |
