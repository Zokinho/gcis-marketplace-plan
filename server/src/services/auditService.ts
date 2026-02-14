import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import logger from '../utils/logger';

interface AuditEntry {
  actorId?: string;
  actorEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/**
 * Fire-and-forget audit log writer.
 * Never throws — failures are logged but don't affect the caller.
 */
export function logAudit(entry: AuditEntry): void {
  prisma.auditLog
    .create({
      data: {
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata as Prisma.InputJsonValue) ?? undefined,
        ip: entry.ip ?? null,
      },
    })
    .catch((err) => {
      logger.error({ err, entry }, '[AUDIT] Failed to write audit log');
    });
}

/**
 * Helper to extract IP from Express request.
 */
export function getRequestIp(req: { ip?: string; headers?: Record<string, any> }): string | undefined {
  return (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || undefined;
}
