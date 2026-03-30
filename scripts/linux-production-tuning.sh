#!/usr/bin/env bash
# ------------------------------------------------------------------
# Elix Star Live — Linux production kernel tuning
# Run on BOTH app servers (Server1 + Server2) as root BEFORE load test.
# These settings persist until reboot; add to /etc/sysctl.conf for permanence.
# ------------------------------------------------------------------
set -euo pipefail

echo "=== Elix Star Live: applying production kernel tuning ==="

# ── File descriptor limits ───────────────────────────────────────
# Node + Traefik each need one fd per connection.
# At 20k+ VUs, 1024 default is instantly exhausted.
sysctl -w fs.file-max=1000000
ulimit -n 1000000 2>/dev/null || true

# Write permanent limit for all services
cat > /etc/security/limits.d/99-elix-nofile.conf <<'LIMITS'
*    soft    nofile    1000000
*    hard    nofile    1000000
root soft    nofile    1000000
root hard    nofile    1000000
LIMITS

# ── TCP accept queue ────────────────────────────────────────────
# somaxconn: max pending connections in listen() backlog.
# Default is 4096 on Ubuntu 24; raise for burst traffic.
sysctl -w net.core.somaxconn=65535

# SYN backlog: max half-open connections waiting for ACK.
sysctl -w net.ipv4.tcp_max_syn_backlog=65535

# ── Connection tracking ────────────────────────────────────────
# nf_conntrack_max: max tracked connections for firewall/NAT.
# Default ~65k; at 20k VUs this fills instantly.
sysctl -w net.netfilter.nf_conntrack_max=1000000 2>/dev/null || true
sysctl -w net.nf_conntrack_max=1000000 2>/dev/null || true

# ── Ephemeral port range ───────────────────────────────────────
# Wider range = more outbound connections (to Neon, Valkey, LiveKit).
sysctl -w net.ipv4.ip_local_port_range="1024 65535"

# ── TCP TIME_WAIT recycling ───────────────────────────────────
# Reclaim TIME_WAIT sockets faster under high churn.
sysctl -w net.ipv4.tcp_tw_reuse=1
sysctl -w net.ipv4.tcp_fin_timeout=15

# ── Network buffer sizes ──────────────────────────────────────
# Larger buffers help under burst; auto-tuning handles the rest.
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216"
sysctl -w net.ipv4.tcp_wmem="4096 65536 16777216"

# ── Backlog queue ─────────────────────────────────────────────
# netdev_budget/netdev_max_backlog: packets queued before processing.
sysctl -w net.core.netdev_max_backlog=65535

# ── Keepalive tuning ─────────────────────────────────────────
# Detect dead connections faster.
sysctl -w net.ipv4.tcp_keepalive_time=300
sysctl -w net.ipv4.tcp_keepalive_intvl=30
sysctl -w net.ipv4.tcp_keepalive_probes=5

echo "=== Kernel tuning applied. Verify with: sysctl -a | grep -E 'somaxconn|file-max|conntrack_max|local_port' ==="
echo ""
echo "To make permanent, copy these sysctl values to /etc/sysctl.d/99-elix.conf and run: sysctl --system"
echo ""
echo "=== Docker container limits ==="
echo "If Coolify containers still hit fd limits, add to the container's Docker settings:"
echo '  "ulimits": { "nofile": { "soft": 1000000, "hard": 1000000 } }'
echo "In Coolify: go to the app → Docker Compose → add ulimits section, or set in Coolify Advanced settings."
