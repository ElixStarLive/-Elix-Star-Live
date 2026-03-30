#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Elix Star Live — Live monitor during load test
# Run on EACH app server as root while k6 is running:
#   bash server-monitor-during-test.sh
#
# Captures a snapshot every 10 seconds and prints it.
# Press Ctrl+C to stop.
# ═══════════════════════════════════════════════════════════════════

INTERVAL=10
LOG_FILE="/tmp/elix-monitor-$(date +%s).log"

echo "Monitoring every ${INTERVAL}s — logging to $LOG_FILE"
echo "Press Ctrl+C to stop"
echo ""

while true; do
  STAMP=$(date -u +"%H:%M:%S")

  {
    echo "═══════════ $STAMP ═══════════"

    echo "── CPU + Load ──"
    uptime
    echo ""

    echo "── Memory ──"
    free -h | head -2
    echo ""

    echo "── Socket summary ──"
    ss -s 2>/dev/null
    echo ""

    echo "── TCP state breakdown ──"
    ss -tan 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -10
    echo ""

    echo "── Conntrack ──"
    CT_COUNT=$(cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null || echo "N/A")
    CT_MAX=$(sysctl -n net.netfilter.nf_conntrack_max 2>/dev/null || echo "N/A")
    echo "  count: $CT_COUNT / max: $CT_MAX"
    echo ""

    echo "── Docker container CPU/MEM ──"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.PIDs}}" 2>/dev/null | head -10
    echo ""

    echo "── App container fd count ──"
    APP_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i -E 'elix|app|star' | head -1 || true)
    if [ -n "$APP_CONTAINER" ]; then
      FD_COUNT=$(docker exec "$APP_CONTAINER" sh -c 'ls /proc/1/fd 2>/dev/null | wc -l' 2>/dev/null || echo 'N/A')
      echo "  $APP_CONTAINER: $FD_COUNT fds"
    fi
    echo ""

    echo "── dmesg (new errors) ──"
    dmesg -T 2>/dev/null | grep -i -E 'conntrack|drop|oom|kill|overflow' | tail -3 || echo "  none"
    echo ""

  } | tee -a "$LOG_FILE"

  sleep "$INTERVAL"
done
