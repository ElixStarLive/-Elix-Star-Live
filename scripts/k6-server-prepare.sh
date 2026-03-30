#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Prepare the k6 load generator server
# Run ONCE on the k6 server (159.69.116.85) as root BEFORE testing:
#   bash k6-server-prepare.sh
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

echo "═══ Preparing k6 load generator ═══"
echo ""

echo "── Current limits ──"
echo "ulimit -n:             $(ulimit -n)"
echo "fs.file-max:           $(cat /proc/sys/fs/file-max)"
echo "ip_local_port_range:   $(sysctl -n net.ipv4.ip_local_port_range)"
echo "somaxconn:             $(sysctl -n net.core.somaxconn)"
echo ""

echo "── Applying fixes ──"
ulimit -n 500000

sysctl -w fs.file-max=1000000
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_tw_reuse=1
sysctl -w net.ipv4.tcp_fin_timeout=10
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216"
sysctl -w net.ipv4.tcp_wmem="4096 65536 16777216"
sysctl -w net.core.netdev_max_backlog=65535

# Permanent
cat > /etc/security/limits.d/99-k6.conf <<'LIMITS'
*    soft    nofile    1000000
*    hard    nofile    1000000
root soft    nofile    1000000
root hard    nofile    1000000
LIMITS

echo ""
echo "── After fixes ──"
echo "ulimit -n:             $(ulimit -n)"
echo "fs.file-max:           $(cat /proc/sys/fs/file-max)"
echo "ip_local_port_range:   $(sysctl -n net.ipv4.ip_local_port_range)"
echo ""

echo "═══ k6 server ready ═══"
echo ""
echo "Now run the test:"
echo "  cd ~/elix"
echo "  git pull"
echo "  k6 run scripts/k6-staged-progressive.js \\"
echo "    --env BASE_URL=https://elixstarlive.co.uk \\"
echo "    --insecure-skip-tls-verify \\"
echo "    2>&1 | tee /tmp/k6-progressive-\$(date +%s).log"
echo ""
