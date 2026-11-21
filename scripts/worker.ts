/**
 * Background worker: runs generation jobs from the DB queue.
 * Start with `npm run worker` (or `npm run dev`, which starts web + worker).
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

import crypto from "node:crypto";

async function main() {
  const { getConfig } = await import("../lib/config");
  const { tuneSqlite } = await import("../lib/db");
  const { claimNext, reclaimExpired } = await import("../lib/jobs/queue");
  const { runJob } = await import("../lib/jobs/runner");
  const { activeProviderNames } = await import("../lib/providers/registry");
  const { log } = await import("../lib/log");
  const { scheduleOrderChecks } = await import("../lib/orders/service");

  const config = getConfig();
  await tuneSqlite();
  const workerId = `worker-${process.pid}-${crypto.randomUUID().slice(0, 6)}`;
  log.info(`StoryStar worker ${workerId} started`, { concurrency: config.WORKER_CONCURRENCY, providers: activeProviderNames() });

  let stopping = false;
  const stop = () => {
    if (stopping) process.exit(1);
    stopping = true;
    log.info("Worker stopping after current jobs finish (Ctrl+C again to force)");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Polling fallback for print orders (webhooks usually arrive first).
  const pollTimer = setInterval(() => {
    if (!stopping) scheduleOrderChecks().catch((err) => log.error("Order status scheduling failed", { err }));
  }, 5 * 60_000);
  scheduleOrderChecks().catch((err) => log.error("Order status scheduling failed", { err }));

  let lastReclaim = 0;
  const slot = async () => {
    while (!stopping) {
      try {
        if (Date.now() - lastReclaim > 30_000) {
          lastReclaim = Date.now();
          await reclaimExpired();
        }
        const job = await claimNext(workerId, config.JOB_LEASE_SECONDS);
        if (!job) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        await runJob(job);
      } catch (err) {
        log.error("Worker loop error", { err });
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };
  await Promise.all(Array.from({ length: config.WORKER_CONCURRENCY }, slot));
  clearInterval(pollTimer);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
