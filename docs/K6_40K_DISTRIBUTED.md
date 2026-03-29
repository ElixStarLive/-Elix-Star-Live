# Reaching ~40k concurrent VUs with k6

A **single** k6 process on one VM often plateaus around **~10k VUs** (file descriptors, ephemeral ports, CPU). To reach **40k total**, run **four separate load generators** (four machines or four cloud VMs in the same region), each with **~10k VUs**, **same** `BASE_URL` and **same** `BYPASS_KEY`.

---

## Option A — Four steady 10k runners (simplest)

Use **`scripts/k6-steady-10k.js`** on **four** hosts (or four shells on four VMs):

```bash
export BASE_URL="https://www.elixstarlive.co.uk"
export BYPASS_KEY="YOUR_LOADTEST_BYPASS_SECRET"

# On machine 1, 2, 3, 4 — start at the same time (or within seconds):
k6 run --env BASE_URL="$BASE_URL" --env BYPASS_KEY="$BYPASS_KEY" scripts/k6-steady-10k.js
```

Total ≈ **40k VUs** (4 × 10k). Each host should run `ulimit -n 1048576` (or similar) before k6.

**Why four machines?** Same IP from four processes on **one** box still shares one outbound address and one set of limits; four **different** VMs gives four times the client-side connection budget.

---

## Option B — Split one scenario with `--execution-segment`

Run the **same** staged script on **four** machines, each responsible for **25%** of the execution (k6 scales VU targets per segment).

Start all four **together**:

```bash
export BASE_URL="https://www.elixstarlive.co.uk"
export BYPASS_KEY="YOUR_LOADTEST_BYPASS_SECRET"
SCRIPT=scripts/k6-staged-500-to-40k.js

# Machine / terminal 1
k6 run --execution-segment "0:0.25" --env BASE_URL="$BASE_URL" --env BYPASS_KEY="$BYPASS_KEY" "$SCRIPT"

# Machine / terminal 2
k6 run --execution-segment "0.25:0.5" --env BASE_URL="$BASE_URL" --env BYPASS_KEY="$BYPASS_KEY" "$SCRIPT"

# Machine / terminal 3
k6 run --execution-segment "0.5:0.75" --env BASE_URL="$BASE_URL" --env BYPASS_KEY="$BYPASS_KEY" "$SCRIPT"

# Machine / terminal 4
k6 run --execution-segment "0.75:1" --env BASE_URL="$BASE_URL" --env BYPASS_KEY="$BYPASS_KEY" "$SCRIPT"
```

Use **`COMPACT=1`** on all four if you want a shorter ramp. Each segment’s peak VU count is a **fraction** of the scenario’s target (e.g. 40k × 0.25 = **10k per instance**).

---

## Edge / origin

- **Cloudflare / proxy** may still rate-limit or cap connections per IP; four **different** egress IPs may behave better than four processes on one host.
- Your API **must** accept **`LOADTEST_BYPASS_SECRET`** via **`x-loadtest-key`** on every request, or you will see **429** under load.

---

## Summary

| Goal              | Approach                                      |
|-------------------|-----------------------------------------------|
| ~40k total VUs    | **4 × ~10k** on **four** generators           |
| Single 10k proven | Keep that as baseline; scale out, not one box |
