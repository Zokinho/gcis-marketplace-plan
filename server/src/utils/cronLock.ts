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
} as const;

/**
 * Wraps a cron job function with a PostgreSQL advisory lock.
 * If the lock is already held (by another instance or overlapping run),
 * the job is skipped silently. The lock is released when the job completes.
 *
 * Uses session-level advisory locks: pg_try_advisory_lock / pg_advisory_unlock.
 */
export async function withCronLock(
  lockId: number,
  jobName: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  // Try to acquire the advisory lock (non-blocking)
  const [{ acquired }] = await prisma.$queryRaw<[{ acquired: boolean }]>`
    SELECT pg_try_advisory_lock(${lockId}) AS acquired
  `;

  if (!acquired) {
    logger.info({ job: jobName, lockId }, '[CRON-LOCK] Skipping — lock held by another process');
    return;
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
