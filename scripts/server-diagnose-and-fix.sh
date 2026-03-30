#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Elix Star Live — Server Diagnose + Fix
# Run on BOTH app servers as root:
#   bash server-diagnose-and-fix.sh
#
# This script:
#  1. Captures BEFORE state (current limits)
#  2. Applies kernel + fd fixes
#  3. Captures AFTER state (verify fixes applied)
#  4. Fixes Docker container limits for the app
#  5. Prints a summary
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  ELIX STAR LIVE — SERVER DIAGNOSE + FIX${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
echo ""

# ─── STEP 1: BEFORE snapshot ─────────────────────────────────────
echo -e "${RED}▶ STEP 1: CURRENT STATE (BEFORE FIX)${NC}"
echo "────────────────────────────────────"

echo "hostname:        $(hostname)"
echo "date:            $(date -u)"
echo "kernel:          $(uname -r)"
echo "cpus:            $(nproc)"
echo "ram:             $(free -h | awk '/Mem:/{print $2}')"
echo ""

echo "── Kernel limits ──"
echo "fs.file-max:              $(cat /proc/sys/fs/file-max)"
echo "net.core.somaxconn:       $(sysctl -n net.core.somaxconn 2>/dev/null || echo 'N/A')"
echo "tcp_max_syn_backlog:      $(sysctl -n net.ipv4.tcp_max_syn_backlog 2>/dev/null || echo 'N/A')"
echo "nf_conntrack_max:         $(sysctl -n net.netfilter.nf_conntrack_max 2>/dev/null || echo 'N/A')"
echo "ip_local_port_range:      $(sysctl -n net.ipv4.ip_local_port_range 2>/dev/null || echo 'N/A')"
echo "tcp_tw_reuse:             $(sysctl -n net.ipv4.tcp_tw_reuse 2>/dev/null || echo 'N/A')"
echo "tcp_fin_timeout:          $(sysctl -n net.ipv4.tcp_fin_timeout 2>/dev/null || echo 'N/A')"
echo "netdev_max_backlog:       $(sysctl -n net.core.netdev_max_backlog 2>/dev/null || echo 'N/A')"
echo ""

echo "── Process limits (root) ──"
echo "ulimit -n (open files):   $(ulimit -n)"
echo "ulimit -u (max procs):    $(ulimit -u)"
echo ""

echo "── Connection state ──"
ss -s 2>/dev/null || echo "ss not available"
echo ""

echo "── Listening on :443 and :8080 ──"
ss -ltnp 2>/dev/null | grep -E ':443|:8080' || echo "nothing listening"
echo ""

echo "── Docker containers ──"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -20 || echo "docker not available"
echo ""

echo "── App container nofile limit ──"
APP_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i -E 'elix|app|star' | head -1 || true)
if [ -n "$APP_CONTAINER" ]; then
  echo "Container: $APP_CONTAINER"
  docker exec "$APP_CONTAINER" sh -c 'cat /proc/1/limits 2>/dev/null | grep "open files"' 2>/dev/null || echo "  could not read"
  echo "  fd count: $(docker exec "$APP_CONTAINER" sh -c 'ls /proc/1/fd 2>/dev/null | wc -l' 2>/dev/null || echo 'N/A')"
else
  echo "No app container found"
fi
echo ""

echo "── Traefik/proxy container nofile limit ──"
PROXY_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i -E 'traefik|proxy|coolify-proxy' | head -1 || true)
if [ -n "$PROXY_CONTAINER" ]; then
  echo "Container: $PROXY_CONTAINER"
  docker exec "$PROXY_CONTAINER" sh -c 'cat /proc/1/limits 2>/dev/null | grep "open files"' 2>/dev/null || echo "  could not read"
  echo "  fd count: $(docker exec "$PROXY_CONTAINER" sh -c 'ls /proc/1/fd 2>/dev/null | wc -l' 2>/dev/null || echo 'N/A')"
else
  echo "No proxy container found"
fi
echo ""

echo "── dmesg (last errors) ──"
dmesg -T 2>/dev/null | grep -i -E 'conntrack|nf_conntrack|drop|oom|kill|reset|overflow' | tail -10 || echo "no relevant dmesg"
echo ""

# ─── STEP 2: APPLY FIXES ─────────────────────────────────────────
echo -e "${GREEN}▶ STEP 2: APPLYING KERNEL + FD FIXES${NC}"
echo "────────────────────────────────────"

sysctl -w fs.file-max=1000000
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_max_syn_backlog=65535
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sysctl -w net.ipv4.tcp_tw_reuse=1
sysctl -w net.ipv4.tcp_fin_timeout=15
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216"
sysctl -w net.ipv4.tcp_wmem="4096 65536 16777216"
sysctl -w net.core.netdev_max_backlog=65535
sysctl -w net.ipv4.tcp_keepalive_time=300
sysctl -w net.ipv4.tcp_keepalive_intvl=30
sysctl -w net.ipv4.tcp_keepalive_probes=5

# conntrack may not be loaded
sysctl -w net.netfilter.nf_conntrack_max=1000000 2>/dev/null || \
  sysctl -w net.nf_conntrack_max=1000000 2>/dev/null || \
  echo "WARN: conntrack module not loaded — skipping"

# permanent limits file
cat > /etc/security/limits.d/99-elix.conf <<'LIMITS'
*    soft    nofile    1000000
*    hard    nofile    1000000
root soft    nofile    1000000
root hard    nofile    1000000
LIMITS

# permanent sysctl
cat > /etc/sysctl.d/99-elix.conf <<'SYSCTL'
fs.file-max = 1000000
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
SYSCTL

echo ""
echo "Kernel fixes applied + written to /etc/sysctl.d/99-elix.conf"
echo ""

# ─── STEP 3: FIX DOCKER CONTAINER LIMITS ─────────────────────────
echo -e "${GREEN}▶ STEP 3: FIXING DOCKER DEFAULT LIMITS${NC}"
echo "────────────────────────────────────"

# Update Docker daemon defaults
mkdir -p /etc/docker
DOCKER_CONF="/etc/docker/daemon.json"
if [ -f "$DOCKER_CONF" ]; then
  echo "Existing $DOCKER_CONF — checking for default-ulimits..."
  if grep -q "default-ulimits" "$DOCKER_CONF" 2>/dev/null; then
    echo "  default-ulimits already present, skipping to avoid conflict"
  else
    echo "  Adding default-ulimits (manual merge may be needed)..."
    # Backup
    cp "$DOCKER_CONF" "${DOCKER_CONF}.bak.$(date +%s)"
    # Simple approach: if it's a valid JSON object, add the key
    python3 -c "
import json, sys
with open('$DOCKER_CONF') as f:
    d = json.load(f)
d['default-ulimits'] = {'nofile': {'Name': 'nofile', 'Hard': 1000000, 'Soft': 1000000}}
with open('$DOCKER_CONF', 'w') as f:
    json.dump(d, f, indent=2)
print('  Updated daemon.json with default-ulimits')
" 2>/dev/null || echo "  Could not auto-merge — add manually"
  fi
else
  cat > "$DOCKER_CONF" <<'DJSON'
{
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 1000000,
      "Soft": 1000000
    }
  }
}
DJSON
  echo "Created $DOCKER_CONF with default-ulimits"
fi

echo ""
echo "Restarting Docker daemon to apply container limits..."
systemctl restart docker 2>/dev/null || service docker restart 2>/dev/null || echo "WARN: could not restart docker"
echo "Docker restarted."
echo ""
echo "IMPORTANT: Coolify containers need to be restarted/redeployed after this."
echo ""

# ─── STEP 4: AFTER snapshot ──────────────────────────────────────
echo -e "${GREEN}▶ STEP 4: VERIFIED STATE (AFTER FIX)${NC}"
echo "────────────────────────────────────"

echo "── Kernel limits (after) ──"
echo "fs.file-max:              $(cat /proc/sys/fs/file-max)"
echo "net.core.somaxconn:       $(sysctl -n net.core.somaxconn 2>/dev/null || echo 'N/A')"
echo "tcp_max_syn_backlog:      $(sysctl -n net.ipv4.tcp_max_syn_backlog 2>/dev/null || echo 'N/A')"
echo "nf_conntrack_max:         $(sysctl -n net.netfilter.nf_conntrack_max 2>/dev/null || echo 'N/A')"
echo "ip_local_port_range:      $(sysctl -n net.ipv4.ip_local_port_range 2>/dev/null || echo 'N/A')"
echo "tcp_tw_reuse:             $(sysctl -n net.ipv4.tcp_tw_reuse 2>/dev/null || echo 'N/A')"
echo "tcp_fin_timeout:          $(sysctl -n net.ipv4.tcp_fin_timeout 2>/dev/null || echo 'N/A')"
echo "netdev_max_backlog:       $(sysctl -n net.core.netdev_max_backlog 2>/dev/null || echo 'N/A')"
echo ""

echo "── Process limits (after) ──"
echo "ulimit -n (open files):   $(ulimit -n)"
echo ""

echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  DONE — NOW DO THIS:${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
echo ""
echo "1. In Coolify: redeploy the app on this server"
echo "   (Docker was restarted, so containers need to come back up)"
echo ""
echo "2. After redeploy, verify container limits:"
echo "   docker exec <app-container> sh -c 'cat /proc/1/limits | grep \"open files\"'"
echo "   Expected: 1000000"
echo ""
echo "3. Repeat this script on the OTHER server"
echo ""
echo "4. Then run the staged load test from the k6 server"
echo ""
