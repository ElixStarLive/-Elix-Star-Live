# ─────────────────────────────────────────────────────────
# Run all 6 load tests sequentially and save results (PowerShell).
#
# Usage:
#   $env:BASE_URL="http://YOUR_SERVER:8080"
#   $env:WS_URL="ws://YOUR_SERVER:8080"
#   $env:TEST_EMAIL="user@test.com"
#   $env:TEST_PASSWORD="pass123"
#   .\loadtest\test-all.ps1
#
# Requirements:
#   - k6 installed: choco install k6  OR  winget install k6
#   - Server running and accessible
# ─────────────────────────────────────────────────────────

$ErrorActionPreference = "Continue"

$BASE_URL = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:8080" }
$WS_URL   = if ($env:WS_URL) { $env:WS_URL } else { "ws://localhost:8080" }
$TEST_EMAIL = if ($env:TEST_EMAIL) { $env:TEST_EMAIL } else { "loadtest@test.com" }
$TEST_PASSWORD = if ($env:TEST_PASSWORD) { $env:TEST_PASSWORD } else { "loadtest123456" }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$RESULTS_DIR = "loadtest\results\$timestamp"
New-Item -ItemType Directory -Force -Path $RESULTS_DIR | Out-Null

Write-Host "================================================"
Write-Host "  ELIX STAR LIVE - FULL LOAD TEST SUITE"
Write-Host "  Target:  $BASE_URL"
Write-Host "  WS:      $WS_URL"
Write-Host "  Results: $RESULTS_DIR"
Write-Host "================================================"
Write-Host ""

$tests = @(
    @{ Name = "01-ws-concurrency"; File = "loadtest/test1-ws-concurrency.js" },
    @{ Name = "02-live-room";      File = "loadtest/test2-live-room.js" },
    @{ Name = "03-chat-stress";    File = "loadtest/test3-chat-stress.js" },
    @{ Name = "04-gift-burst";     File = "loadtest/test4-gift-burst.js" },
    @{ Name = "05-feed-api";       File = "loadtest/test5-feed-api.js" },
    @{ Name = "06-reconnect";      File = "loadtest/test6-reconnect.js" }
)

foreach ($test in $tests) {
    $name = $test.Name
    $file = $test.File

    Write-Host "----------------------------------------------"
    Write-Host "  RUNNING: $name"
    Write-Host "  File:    $file"
    Write-Host "  Started: $(Get-Date)"
    Write-Host "----------------------------------------------"

    k6 run `
        --env BASE_URL="$BASE_URL" `
        --env WS_URL="$WS_URL" `
        --env TEST_EMAIL="$TEST_EMAIL" `
        --env TEST_PASSWORD="$TEST_PASSWORD" `
        --out json="$RESULTS_DIR\${name}.json" `
        --summary-export="$RESULTS_DIR\${name}-summary.json" `
        $file 2>&1 | Tee-Object -FilePath "$RESULTS_DIR\${name}.log"

    Write-Host ""
    Write-Host "  Done: $name"
    Write-Host ""

    Start-Sleep -Seconds 10
}

Write-Host ""
Write-Host "================================================"
Write-Host "  ALL TESTS COMPLETE"
Write-Host "  Results saved to: $RESULTS_DIR"
Write-Host "  Finished: $(Get-Date)"
Write-Host "================================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Review each *-summary.json for pass/fail thresholds"
Write-Host "  2. Check *.log for detailed output"
Write-Host "  3. Look at *.json for raw metrics"
Write-Host ""
