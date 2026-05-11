import { prisma } from '../index';
import logger from './logger';
import { cronJobDuration, cronJobLastSuccess, cronJobErrors } from './metrics';

/**
 * PostgreSQL advisory lock IDs for each cron job.
 * Must be unique integers — using arbitrary constants.
 */
export const LOCK_IDS = {
  ZOHO_SYNC: 100001,
  COA_EMAIL_SYNC: 100002,
  INTEL_PREDICTIONS: 100003,
  INTEL_CHURN: 100004,
  INTEL_PROPENSITY: 100005,
  INTEL_SELLER_SCORES: 100006,
  ISO_EXPIRY: 100007,
} as const;

/** Max time (ms) a lock can be held before being considered stale. */
const STALE_LOCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Wraps a cron job function with a PostgreSQL advisory lock.
 * If the lock is already held (by another instance or overlapping run),
 * the job is skipped silently. The lock is released when the job completes.
 *
 * If a lock has been held for longer than STALE_LOCK_THRESHOLD_MS (e.g. the
 * server crashed mid-job), the stale session is terminated and the lock is
 * retried once.
 *
 * Uses session-level advisory locks: pg_try_advisory_lock / pg_advisory_unlock.
 */
export async function withCronLock(
  lockId: number,
  jobName: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  // Try to acquire the advisory lock (non-blocking)
  let [{ acquired }] = await prisma.$queryRaw<[{ acquired: boolean }]>`
    SELECT pg_try_advisory_lock(${lockId}) AS acquired
  `;

  if (!acquired) {
    // Check if the lock is stale (held by a dead/crashed session)
    const staleRows = await prisma.$queryRaw<Array<{ pid: number; held_ms: number }>>`
      SELECT l.pid,
             EXTRACT(EPOCH FROM (now() - a.state_change))::int * 1000 AS held_ms
        FROM pg_locks l
        JOIN pg_stat_activity a ON l.pid = a.pid
       WHERE l.locktype = 'advisory'
         AND l.objid = ${lockId}
         AND l.granted = true
         AND a.pid != pg_backend_pid()
    `;

    const stale = staleRows.find((r) => r.held_ms > STALE_LOCK_THRESHOLD_MS);
    if (stale) {
      logger.warn(
        { job: jobName, lockId, stalePid: stale.pid, heldMinutes: Math.round(stale.held_ms / 60000) },
        '[CRON-LOCK] Terminating stale session holding lock',
      );
      await prisma.$queryRaw`SELECT pg_terminate_backend(${stale.pid})`.catch(() => {});

      // Retry lock acquisition after terminating the stale session
      const [retry] = await prisma.$queryRaw<[{ acquired: boolean }]>`
        SELECT pg_try_advisory_lock(${lockId}) AS acquired
      `;
      acquired = retry.acquired;
    }

    if (!acquired) {
      logger.info({ job: jobName, lockId }, '[CRON-LOCK] Skipping — lock held by another process');
      return;
    }
  }

  const endTimer = cronJobDuration.startTimer({ job: jobName });

  try {
    await fn();
    cronJobLastSuccess.set({ job: jobName }, Date.now() / 1000);
  } catch (err) {
    cronJobErrors.inc({ job: jobName });
    throw err;
  } finally {
    endTimer();
    // Always release the lock
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`.catch((err) => {
      logger.error({ err, job: jobName, lockId }, '[CRON-LOCK] Failed to release lock');
    });
  }
}
