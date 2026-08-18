/**
 * Process lifecycle contract.
 *
 * One instance stopping is a routine event — a deploy, a scale-down, a crash. It
 * must stop doing work without taking anything shared with it: the live streams,
 * presence, battles and seats it can see belong to the cluster, not to this
 * process. These are source-level guarantees because they are about what the
 * shutdown path is allowed to reach for, which no unit test can observe.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const indexSrc = readFileSync(resolve(__dirname, "../index.ts"), "utf8");
const battleSrc = readFileSync(resolve(__dirname, "../websocket/battle.ts"), "utf8");

/** The body of `gracefulShutdown`, where every ordering claim below applies. */
const shutdown = indexSrc.slice(indexSrc.indexOf("function gracefulShutdown"));

describe("graceful shutdown", () => {
  it("stops taking on new work before letting go of the database", () => {
    expect(shutdown).toContain("stopJobWorker()");
    expect(shutdown).toContain("stopBattleTickLoop()");
    expect(shutdown).toContain("stopBackgroundTimers()");
    // A maturation or reconciliation pass that starts here would open a money
    // transaction on a pool that is already ending.
    expect(shutdown.indexOf("stopBackgroundTimers()")).toBeLessThan(
      shutdown.indexOf("pool.end()"),
    );
    expect(shutdown.indexOf("stopJobWorker()")).toBeLessThan(
      shutdown.indexOf("server.close("),
    );
  });

  it("closes its own connections and cannot hang forever", () => {
    expect(shutdown).toContain("closeValkeyConnections()");
    expect(shutdown).toContain("setTimeout(() => process.exit(0), 10_000)");
  });

  it("does not end anyone's live on the way out", () => {
    // The failure this forbids: a rolling deploy where each instance "cleans up"
    // and every creator on the platform drops off air.
    for (const sharedStateWrite of [
      "removeActiveStream",
      "dbEndLiveStream",
      "clearBattleRuntimeForRoom",
      "deleteCohostLayout",
      "broadcastStreamEnded",
      "finalizeBattle",
    ]) {
      expect(shutdown).not.toContain(sharedStateWrite);
    }
  });

  it("owns every recurring timer it starts", () => {
    // Both of them: the event-loop lag sampler and the one inside `everyMs`,
    // which is how every background pass is registered. A new bare setInterval
    // here would be a timer nothing can stop.
    expect(indexSrc.match(/setInterval\(/g)).toHaveLength(2);
    expect(indexSrc).toContain("into.push(timer)");
    expect(indexSrc).toContain("function stopBackgroundTimers()");
    expect(shutdown).toContain("clearInterval(_evLoopLagTimer)");
  });

  it("hands the job lease back instead of holding it for its whole TTL", () => {
    // Releasing is owner-checked, so an instance that already lost the lease
    // cannot take the work away from whoever picked it up.
    expect(shutdown).toContain("valkeyReleaseLock(JOB_LEADER_KEY, jobLeaderToken)");
  });
});

describe("who runs the background jobs", () => {
  /** The lease block: acquisition, renewal and the two start/stop paths. */
  const leadership = indexSrc.slice(
    indexSrc.indexOf("const JOB_LEADER_KEY"),
    indexSrc.indexOf("try {\n  await connectPostgres()"),
  );

  it("is decided by a Valkey lease, not by an env flag", () => {
    // Production boots through server/cluster.ts, so every process is a cluster
    // child holding the same env: a flag can only run these jobs in all of them
    // or none of them, and it cannot move the work when the chosen one dies.
    expect(leadership).toContain("valkeyTrySetNx(JOB_LEADER_KEY, jobLeaderToken");
    expect(leadership).toContain("valkeyRenewLock(JOB_LEADER_KEY, jobLeaderToken");
    expect(indexSrc).not.toContain("if (runBackgroundJobs)");
  });

  it("starts the recurring money jobs only while it holds the lease", () => {
    const start = indexSrc.slice(
      indexSrc.indexOf("function startBackgroundJobs()"),
      indexSrc.indexOf("function stopBackgroundJobs()"),
    );
    for (const leaderOnlyJob of [
      "neonMatureCreatorEarnings",
      "matureGbpPendingEarnings",
      "tickRewardsPeriods",
      "runWalletLedgerReconciliation",
      "startJobWorker",
    ]) {
      expect(start).toContain(leaderOnlyJob);
    }
    // Every one of them is registered where losing the lease can stop it.
    expect(start.match(/leaderTimers/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(indexSrc).toContain("clearTimerList(leaderTimers)");
  });

  it("stops the jobs when the lease is proven lost, and not when Valkey is merely unreadable", () => {
    // "unavailable" is not evidence another process took over. Stopping on it
    // would leave nobody maturing earnings during a Valkey blip; the lease
    // expires by itself if this process is the one that is cut off.
    expect(leadership).toContain('if (renewed === "lost") stopBackgroundJobs();');
    expect(leadership).not.toContain('renewed !== "renewed"');
  });

  it("takes the lease once, and does not stack a second set of timers", () => {
    expect(indexSrc).toContain("if (backgroundJobsRunning) return;");
    expect(indexSrc).toContain('if (claimed === "set") startBackgroundJobs();');
  });
});

describe("the battle tick scheduler", () => {
  it("runs one pass at a time in this process", () => {
    // The interval does not await the async pass, so a slow pass would otherwise
    // have the next one start on top of it and pile up under a slowdown.
    expect(battleSrc).toContain("let tickPassRunning = false");
    const loop = battleSrc.slice(
      battleSrc.indexOf("async function globalTickLoop"),
      battleSrc.indexOf("export function initBattleTickLoop"),
    );
    expect(loop).toContain("if (tickPassRunning) return;");
    expect(loop).toContain("tickPassRunning = true;");
    expect(loop).toContain("tickPassRunning = false;");
  });

  it("is stopped on shutdown, and is safe to start again", () => {
    expect(battleSrc).toContain("export function stopBattleTickLoop");
    expect(battleSrc).toContain("if (globalTickInterval) return;");
  });
});
