# Production Recovery & Load Test Guide

## RULE: Never manually recreate coolify-proxy

Coolify manages the Traefik proxy container. Manually replacing it breaks:
- Docker service discovery (labels)
- ACME/Let's Encrypt certificates
- Routing rules

Only use dynamic config files in `/data/coolify/proxy/dynamic/`.

---

## Step 1: Restore proxy (Coolify dashboard)

For EACH server:
1. Coolify → Servers → [server] → Proxy → Configuration
2. Set Traefik version to v3.6.1 (or keep current)
3. Click "Restart Proxy"
4. Wait for status to show running/healthy

## Step 2: Verify site works

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs coolify-proxy --tail 100
curl -I https://www.elixstarlive.co.uk
```

## Step 3: Apply kernel tuning (EACH server, as root)

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

Make permanent:
```bash
cat > /etc/sysctl.d/99-elix.conf << 'EOF'
fs.file-max = 1000000
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.netdev_max_backlog = 65535
EOF
```

## Step 4: Apply Traefik dynamic config (EACH server)

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

Traefik auto-reloads — no restart needed.

## Step 5: Attach transport to app service

In Coolify → App → Edit Labels, add:
```
traefik.http.services.<service-name>.loadbalancer.serversTransport=highconcurrency@file
```

Replace `<service-name>` with the actual service name visible in the existing labels.

## Step 6: Run staged load test

On k6 server (159.69.116.85):

```bash
ulimit -n 500000
sysctl -w fs.file-max=1000000
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_tw_reuse=1

cd ~/elix && git pull
k6 run scripts/k6-staged-2k-to-10k.js \
  --env BASE_URL=https://elixstarlive.co.uk \
  --insecure-skip-tls-verify \
  2>&1 | tee /tmp/k6-staged-$(date +%s).log
```

## Step 7: Monitor during test (EACH app server)

```bash
watch -n 5 'echo "$(date)"; ss -s; docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -5'
```

## Expected results

| VUs   | Expected                              |
|-------|---------------------------------------|
| 2,000 | p95 < 500ms, < 1% errors             |
| 5,000 | p95 < 1s, < 2% errors                |
| 8,000 | p95 < 2s, < 3% errors                |
| 10,000| p95 < 3s, < 5% errors                |

## Bottleneck layers (priority)

1. Linux kernel (fd, somaxconn, conntrack, port range)
2. Traefik proxy (serversTransport config, TLS CPU)
3. Node.js clustering (16 workers on 16 cores)
4. Postgres pool (cluster-aware sizing, ~80 total)
5. Valkey (auto-pipelining enabled)
6. Cache stampede (distributed locks on all cached endpoints)
