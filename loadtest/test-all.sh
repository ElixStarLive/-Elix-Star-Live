#!/bin/bash
# ─────────────────────────────────────────────────────────
# Run all 6 load tests sequentially and save results.
#
# Usage:
#   chmod +x loadtest/test-all.sh
#   BASE_URL=http://YOUR_SERVER:8080 WS_URL=ws://YOUR_SERVER:8080 \
#     TEST_EMAIL=user@test.com TEST_PASSWORD=pass123 \
#     ./loadtest/test-all.sh
#
# Requirements:
#   - k6 installed (https://k6.io/docs/get-started/installation/)
#   - Server running and accessible from this machine
#   - For 40K tests: run from a dedicated load-test machine (not your laptop)
# ─────────────────────────────────────────────────────────

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
WS_URL="${WS_URL:-ws://localhost:8080}"
RESULTS_DIR="loadtest/results/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"

echo "================================================"
echo "  ELIX STAR LIVE — FULL LOAD TEST SUITE"
echo "  Target: $BASE_URL"
echo "  WS:     $WS_URL"
echo "  Results: $RESULTS_DIR"
echo "================================================"
echo ""

run_test() {
  local name="$1"
  local file="$2"
  echo "──────────────────────────────────────────────"
  echo "  RUNNING: $name"
  echo "  File: $file"
  echo "  Started: $(date)"
  echo "──────────────────────────────────────────────"

  k6 run \
    --env BASE_URL="$BASE_URL" \
    --env WS_URL="$WS_URL" \
    --env TEST_EMAIL="${TEST_EMAIL:-loadtest@test.com}" \
    --env TEST_PASSWORD="${TEST_PASSWORD:-loadtest123456}" \
    --out json="$RESULTS_DIR/${name}.json" \
    --summary-export="$RESULTS_DIR/${name}-summary.json" \
    "$file" \
    2>&1 | tee "$RESULTS_DIR/${name}.log"

  echo ""
  echo "  ✓ $name complete"
  echo ""
  # cooldown between tests
  sleep 10
}

echo ""
echo ">>> Starting test suite at $(date)"
echo ""

run_test "01-ws-concurrency"   "loadtest/test1-ws-concurrency.js"
run_test "02-live-room"        "loadtest/test2-live-room.js"
run_test "03-chat-stress"      "loadtest/test3-chat-stress.js"
run_test "04-gift-burst"       "loadtest/test4-gift-burst.js"
run_test "05-feed-api"         "loadtest/test5-feed-api.js"
run_test "06-reconnect"        "loadtest/test6-reconnect.js"

echo ""
echo "================================================"
echo "  ALL TESTS COMPLETE"
echo "  Results saved to: $RESULTS_DIR"
echo "  Finished: $(date)"
echo "================================================"
echo ""
echo "Next steps:"
echo "  1. Review each *-summary.json for pass/fail thresholds"
echo "  2. Check *.log for detailed output"
echo "  3. Look at *.json for raw metrics (import into Grafana/k6 Cloud)"
echo ""
