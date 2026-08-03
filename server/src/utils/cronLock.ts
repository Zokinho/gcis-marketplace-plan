import crypto from 'crypto';
import os from 'os';
import { prisma } from '../index';
import logger from './logger';
import { cronJobDuration, cronJobLastSuccess, cronJobErrors } from './metrics';

/**
 * Lock IDs for each cron job.
 *
 * Retained as numbers for continuity with existing config and logs; the lock row
 * is keyed on the job name, so these are identifiers rather than PostgreSQL
 * advisory lock ids.
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

/** How long a lock may be held before another run may take it over. */
const STALE_LOCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** Identifies this process in lock rows, for diagnosing a stuck job. */
const INSTANCE = `${os.hostname()}:${process.pid}`;

/**
 * Take the lock for a job, or report that someone else holds it.
 *
 * One atomic upsert: insert when free, or take it over when the existing holder
 * has been there past the stale threshold. The conditional DO UPDATE means two
 * instances racing cannot both succeed — exactly one write satisfies the WHERE.
 *
 * Returns null when another run holds the lock. When acquired, `tookOverStale`
 * reports whether this displaced an abandoned holder, which is the signal that a
 * previous run died mid-job.
 */
async function acquireLock(
  jobName: string,
  token: string,
): Promise<{ tookOverStale: boolean } | null> {
  const staleSeconds = Math.floor(STALE_LOCK_THRESHOLD_MS / 1000);

  // xmax is zero on a fresh insert and non-zero when the row was updated, which
  // is how a takeover is distinguished from a clean acquisition. Compared as text
  // because xmax is an xid rather than an integer.
  const rows = await prisma.$queryRaw<Array<{ inserted: boolean }>>`
    INSERT INTO "CronLock" ("job", "lockedAt", "lockedBy")
    VALUES (${jobName}, now(), ${token})
    ON CONFLICT ("job") DO UPDATE
       SET "lockedAt" = now(),
           "lockedBy" = ${token}
     WHERE "CronLock"."lockedAt" < now() - make_interval(secs => ${staleSeconds}::double precision)
    RETURNING (xmax::text = '0') AS inserted
  `;

  if (rows.length === 0) return null;
  return { tookOverStale: rows[0].inserted === false };
}

/**
 * Release a lock, but only if this run still holds it.
 *
 * The lockedBy check matters: if this run overran the stale threshold and another
 * instance took the lock over, deleting unconditionally would release a lock that
 * is legitimately held and let two copies of the job run at once.
 */
async function releaseLock(jobName: string, token: string): Promise<boolean> {
  const deleted = await prisma.cronLock.deleteMany({
    where: { job: jobName, lockedBy: token },
  });
  return deleted.count > 0;
}

/**
 * Run a cron job under a mutual-exclusion lock, skipping if it is already running.
 *
 * Uses a lock row rather than a PostgreSQL advisory lock. Advisory locks belong to
 * the session that took them, and Prisma serves pooled connections, so
 * pg_advisory_unlock regularly executed on a different session than
 * pg_try_advisory_lock. That returns false rather than raising, so the release
 * silently failed and the lock leaked until its connection was recycled — leaving
 * the job skipping roughly half its runs with nothing but an info log to show it.
 */
export async function withCronLock(
  lockId: number,
  jobName: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  // Per-acquisition token, so a leaked row from an earlier run of this same
  // process can never be released by a later one
  const token = `${INSTANCE}:${crypto.randomUUID()}`;

  let acquired: { tookOverStale: boolean } | null;
  try {
    acquired = await acquireLock(jobName, token);
  } catch (err) {
    logger.error({ err, job: jobName, lockId }, '[CRON-LOCK] Failed to acquire lock — skipping run');
    return;
  }

  if (!acquired) {
    logger.info({ job: jobName, lockId }, '[CRON-LOCK] Skipping — already running');
    return;
  }

  if (acquired.tookOverStale) {
    logger.warn(
      { job: jobName, lockId, staleMinutes: STALE_LOCK_THRESHOLD_MS / 60000 },
      '[CRON-LOCK] Took over a stale lock — a previous run did not release it',
    );
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
    try {
      const released = await releaseLock(jobName, token);
      if (!released) {
        // Either the row vanished, or the run overran the stale threshold and
        // another instance took the lock over. Both are worth knowing about —
        // the silent version of this is the bug being fixed here.
        logger.warn(
          { job: jobName, lockId, token },
          '[CRON-LOCK] Lock was not held at release — overran the stale threshold or was taken over',
        );
      }
    } catch (err) {
      logger.error({ err, job: jobName, lockId }, '[CRON-LOCK] Failed to release lock');
    }
  }
}
