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
  });

  // 1. Runs fn when lock acquired
  it('executes the job function when lock is acquired', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ acquired: true }])   // lock acquired
      .mockResolvedValueOnce(undefined as any);       // lock released

    const jobFn = vi.fn().mockResolvedValue('done');

    await withCronLock(100001, 'test-job', jobFn);

    expect(jobFn).toHaveBeenCalledTimes(1);
  });

  // 2. Skips fn when lock not acquired
  it('skips the job function when lock is not acquired', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ acquired: false }]);

    const jobFn = vi.fn().mockResolvedValue('done');

    await withCronLock(100001, 'test-job', jobFn);

    expect(jobFn).not.toHaveBeenCalled();
  });

  // 3. Releases lock after fn completes
  it('releases the lock after the job function completes', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce(undefined as any);

    const jobFn = vi.fn().mockResolvedValue('done');

    await withCronLock(100001, 'test-job', jobFn);

    // $queryRaw called twice: once for lock, once for unlock
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  // 4. Releases lock even if fn throws
  it('releases the lock even when the job function throws', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce(undefined as any);

    const jobFn = vi.fn().mockRejectedValue(new Error('Job failed'));

    await expect(withCronLock(100001, 'test-job', jobFn)).rejects.toThrow('Job failed');

    // Lock should still be released (2 calls to $queryRaw)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  // 5. Returns undefined in both cases
  it('returns undefined when lock is acquired and job succeeds', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce(undefined as any);

    const jobFn = vi.fn().mockResolvedValue('some-value');

    const result = await withCronLock(100001, 'test-job', jobFn);

    expect(result).toBeUndefined();
  });

  it('returns undefined when lock is not acquired', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ acquired: false }]);

    const jobFn = vi.fn();

    const result = await withCronLock(100001, 'test-job', jobFn);

    expect(result).toBeUndefined();
  });

  // 7. Logs skip message when lock held
  it('logs an info message when skipping due to held lock', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ acquired: false }]);

    const jobFn = vi.fn();

    await withCronLock(100001, 'test-job', jobFn);

    expect(logger.info).toHaveBeenCalledWith(
      { job: 'test-job', lockId: 100001 },
      expect.stringContaining('Skipping'),
    );
  });

  // 8. Handles lock release error gracefully
  it('catches and logs lock release errors without throwing', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ acquired: true }])
      .mockRejectedValueOnce(new Error('Release failed'));

    const jobFn = vi.fn().mockResolvedValue('done');

    // Should NOT throw even though the unlock query fails
    await expect(withCronLock(100001, 'test-job', jobFn)).resolves.toBeUndefined();

    expect(jobFn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'test-job', lockId: 100001 }),
      expect.stringContaining('Failed to release lock'),
    );
  });

  // 9. Does not release lock when lock was never acquired
  it('does not call unlock when lock was not acquired', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ acquired: false }]);

    await withCronLock(100001, 'test-job', vi.fn());

    // Only 1 call for the lock attempt, no unlock call
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
