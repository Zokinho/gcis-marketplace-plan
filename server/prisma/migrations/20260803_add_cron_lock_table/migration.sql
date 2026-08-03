-- CreateTable: CronLock
-- Replaces PostgreSQL advisory locks for cron mutual exclusion. Advisory locks are
-- session-scoped and Prisma pools connections, so pg_advisory_unlock often ran on a
-- different session than pg_try_advisory_lock — returning false rather than raising,
-- and leaking the lock until that connection was recycled.
CREATE TABLE IF NOT EXISTS "CronLock" (
    "job" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL,
    "lockedBy" TEXT NOT NULL,

    CONSTRAINT "CronLock_pkey" PRIMARY KEY ("job")
);

CREATE INDEX IF NOT EXISTS "CronLock_lockedAt_idx" ON "CronLock"("lockedAt");
