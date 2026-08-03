import { vi, describe, it, expect, beforeEach } from 'vitest';
import { withCronLock, LOCK_IDS } from '../utils/cronLock';
import { prisma } from '../index';
import logger from '../utils/logger';

// ─── Tests ───

describe('LOCK_IDS', () => {
  // 6. LOCK_IDS contains expected keys
  it('contains all expected cron lock IDs', () => {
    expect(LOCK_IDS).toHaveProperty('ZOHO_SYNC');
    expect(LOCK_IDS).toHaveProperty('COA_EMAIL_SYNC');
    expect(LOCK_IDS).toHaveProperty('INTEL_PREDICTIONS');
    expect(LOCK_IDS).toHaveProperty('INTEL_CHURN');
    expect(LOCK_IDS).toHaveProperty('INTEL_PROPENSITY');
    expect(LOCK_IDS).toHaveProperty('INTEL_SELLER_SCORES');
  });

  it('all lock IDs are unique numbers', () => {
    const values = Object.values(LOCK_IDS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
    for (const v of values) {
      expect(typeof v).toBe('number');
    }
  });
});

describe('withCronLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: lock acquired cleanly, released cleanly
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ inserted: true }] as any);
    vi.mocked(prisma.cronLock.deleteMany).mockResolvedValue({ count: 1 } as any);
  });

  it('executes the job function when the lock is acquired', async () => {
    const jobFn = vi.fn().mockResolvedValue('done');

    await withCronLock(100001, 'test-job', jobFn);

    expect(jobFn).toHaveBeenCalledTimes(1);
  });

  it('skips the job function when another run holds the lock', async () => {
    // Conditional upsert wrote nothing — someone else holds a fresh lock
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);
    const jobFn = vi.fn();

    await withCronLock(100001, 'test-job', jobFn);

    expect(jobFn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { job: 'test-job', lockId: 100001 },
      expect.stringContaining('Skipping'),
    );
  });

  it('releases the lock after the job completes', async () => {
    await withCronLock(100001, 'test-job', vi.fn().mockResolvedValue('done'));

    expect(prisma.cronLock.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('releases the lock even when the job throws', async () => {
    const jobFn = vi.fn().mockRejectedValue(new Error('Job failed'));

    await expect(withCronLock(100001, 'test-job', jobFn)).rejects.toThrow('Job failed');

    expect(prisma.cronLock.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a release when the lock was not acquired', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    await withCronLock(100001, 'test-job', vi.fn());

    expect(prisma.cronLock.deleteMany).not.toHaveBeenCalled();
  });

  it('releases only the row this run holds, never another holder\'s', async () => {
    await withCronLock(100001, 'test-job', vi.fn().mockResolvedValue('done'));

    // Scoping the delete on lockedBy is what stops an overrunning run from
    // releasing a lock that a different instance legitimately took over
    const where = (vi.mocked(prisma.cronLock.deleteMany).mock.calls[0][0] as any).where;
    expect(where.job).toBe('test-job');
    expect(typeof where.lockedBy).toBe('string');
    expect(where.lockedBy.length).toBeGreaterThan(0);
  });

  it('uses a distinct token per acquisition', async () => {
    await withCronLock(100001, 'test-job', vi.fn());
    await withCronLock(100001, 'test-job', vi.fn());

    const calls = vi.mocked(prisma.cronLock.deleteMany).mock.calls;
    const first = (calls[0][0] as any).where.lockedBy;
    const second = (calls[1][0] as any).where.lockedBy;
    // A leaked row from an earlier run must not be releasable by a later one
    expect(first).not.toBe(second);
  });

  it('warns when the release matched no row', async () => {
    // The silent version of this was the bug: pg_advisory_unlock returned false
    // on a pooled connection that did not hold the lock, and nothing checked it
    vi.mocked(prisma.cronLock.deleteMany).mockResolvedValue({ count: 0 } as any);

    await withCronLock(100001, 'test-job', vi.fn().mockResolvedValue('done'));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'test-job', lockId: 100001 }),
      expect.stringContaining('not held at release'),
    );
  });

  it('warns when it takes over a stale lock', async () => {
    // xmax non-zero => the row was updated, i.e. an abandoned holder was displaced
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ inserted: false }] as any);
    const jobFn = vi.fn().mockResolvedValue('done');

    await withCronLock(100001, 'test-job', jobFn);

    expect(jobFn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'test-job' }),
      expect.stringContaining('stale lock'),
    );
  });

  it('skips the run rather than throwing when acquisition errors', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('db down'));
    const jobFn = vi.fn();

    await expect(withCronLock(100001, 'test-job', jobFn)).resolves.toBeUndefined();

    expect(jobFn).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'test-job' }),
      expect.stringContaining('Failed to acquire'),
    );
  });

  it('does not throw when the release query itself fails', async () => {
    vi.mocked(prisma.cronLock.deleteMany).mockRejectedValue(new Error('Release failed'));
    const jobFn = vi.fn().mockResolvedValue('done');

    await expect(withCronLock(100001, 'test-job', jobFn)).resolves.toBeUndefined();

    expect(jobFn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'test-job', lockId: 100001 }),
      expect.stringContaining('Failed to release lock'),
    );
  });

  it('returns undefined in both the acquired and skipped cases', async () => {
    await expect(withCronLock(100001, 'a', vi.fn())).resolves.toBeUndefined();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);
    await expect(withCronLock(100001, 'b', vi.fn())).resolves.toBeUndefined();
  });
});
