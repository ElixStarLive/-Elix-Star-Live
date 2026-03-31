/**
 * k6: Definitive staged proof — 500 → 1k → 2k → 5k → 8k → 10k → 15k → 20k → 30k → 40k
 *
 * Each stage: 30s ramp + 2 min hold = 2.5 min per stage.
 * Total: ~25 minutes (10 stages × 2.5 min).
 *
 * USAGE:
 *   k6 run scripts/k6-staged-0-1k-5k-10k-20k.js \
 *     --env BASE_URL=https://elixstarlive.co.uk \
 *     --env BYPASS_KEY='<secret>' \
 *     --insecure-skip-tls-verify \
 *     2>&1 | tee /tmp/k6-staged-$(date +%s).log
 *
 * For bypass-LB (hit server directly):
 *   k6 run scripts/k6-staged-0-1k-5k-10k-20k.js \
 *     --env BASE_URL=https://<server-ip> \
 *     --env HOST=elixstarlive.co.uk \
 *     --env BYPASS_KEY='<secret>' \
 *     --insecure-skip-tls-verify \
 *     2>&1 | tee /tmp/k6-staged-bypass-$(date +%s).log
 *
 * Optional:
 *   --env MAX_VU=10000    cap max VU level (stops ramping beyond this)
 *   --env HOLD=60         hold duration per stage in seconds (default 120)
 *   --env RAMP=30         ramp duration per stage in seconds (default 30)
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = (__ENV.BASE_URL || "https://elixstarlive.co.uk").replace(/\/$/, "");
const HOST = __ENV.HOST || "";
const BYPASS = __ENV.BYPASS_KEY || "";
const MAX_VU = __ENV.MAX_VU ? parseInt(__ENV.MAX_VU, 10) : 40000;
const HOLD = __ENV.HOLD ? `${parseInt(__ENV.HOLD, 10)}s` : "2m";
const RAMP = __ENV.RAMP ? `${parseInt(__ENV.RAMP, 10)}s` : "30s";

const headers = {};
if (HOST) headers["Host"] = HOST;
if (BYPASS) headers["x-loadtest-key"] = BYPASS;

const params = { headers, timeout: "15s" };

const endpoints = [
  { path: "/api/feed/foryou", weight: 40 },
  { path: "/api/health", weight: 20 },
  { path: "/api/live/streams", weight: 15 },
  { path: "/api/gifts/catalog", weight: 10 },
  { path: "/api/profiles", weight: 10 },
  { path: "/api/coin-packages", weight: 5 },
];

function pickPath() {
  const r = Math.random() * 100;
  let acc = 0;
  for (const e of endpoints) {
    acc += e.weight;
    if (r <= acc) return e.path;
  }
  return endpoints[0].path;
}

export default function () {
  const path = pickPath();
  const res = http.get(`${BASE}${path}`, params);
  check(res, {
    "status 2xx": (r) => r.status >= 200 && r.status < 300,
  });
  sleep(Math.random() * 0.3 + 0.05);
}

const vuLevels = [500, 1000, 2000, 5000, 8000, 10000, 15000, 20000, 30000, 40000];

const stages = [];
for (const vu of vuLevels) {
  if (vu > MAX_VU) break;
  stages.push({ duration: RAMP, target: vu });
  stages.push({ duration: HOLD, target: vu });
}
stages.push({ duration: "30s", target: 0 });

export const options = {
  scenarios: {
    staged_proof: {
      executor: "ramping-vus",
      startVUs: 0,
      stages,
      gracefulRampDown: "15s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<5000"],
  },
  insecureSkipTLSVerify: true,
};
