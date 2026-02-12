import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import logger from '../utils/logger';
import { requireAdmin } from '../middleware/auth';
import {
  getUnreadCount,
  getEffectivePrefs,
  DEFAULT_NOTIFICATION_PREFS,
  createNotification,
} from '../services/notificationService';

const router = Router();

/**
 * GET /api/notifications
 * List notifications for the current user (paginated).
 */
router.get('/', async (req: Request, res: Response) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const unreadOnly = req.query.unreadOnly === 'true';

  const where: any = { userId: user.id };
  if (unreadOnly) where.read = false;

  try {
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      notifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, '[NOTIFICATIONS] Failed to list');
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Fast count of unread notifications (polled by frontend).
 */
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const count = await getUnreadCount(req.user!.id);
    res.json({ count });
  } catch (err) {
    logger.error({ err }, '[NOTIFICATIONS] Failed to get unread count');
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * PATCH /api/notifications/read
 * Mark notifications as read: { ids: [...] } or { all: true }
 */
router.patch('/read', async (req: Request, res: Response) => {
  const user = req.user!;
  const { ids, all } = req.body as { ids?: string[]; all?: boolean };

  try {
    if (all) {
      await prisma.notification.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true, readAt: new Date() },
      });
    } else if (ids && Array.isArray(ids) && ids.length > 0) {
      await prisma.notification.updateMany({
        where: { id: { in: ids }, userId: user.id },
        data: { read: true, readAt: new Date() },
      });
    } else {
      return res.status(400).json({ error: 'Provide ids array or all: true' });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, '[NOTIFICATIONS] Failed to mark read');
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

/**
 * GET /api/notifications/preferences
 * Get effective notification preferences for the current user.
 */
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const prefs = await getEffectivePrefs(req.user!.id);
    res.json({ preferences: prefs, defaults: DEFAULT_NOTIFICATION_PREFS });
  } catch (err) {
    logger.error({ err }, '[NOTIFICATIONS] Failed to get preferences');
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

/**
 * PATCH /api/notifications/preferences
 * Update notification preferences (partial merge).
 */
router.patch('/preferences', async (req: Request, res: Response) => {
  const user = req.user!;
  const updates = req.body as Record<string, boolean>;

  // Validate that keys are valid notification types
  const validTypes = Object.keys(DEFAULT_NOTIFICATION_PREFS);
  const filtered: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (validTypes.includes(key) && typeof value === 'boolean') {
      // SYSTEM_ANNOUNCEMENT cannot be turned off
      if (key === 'SYSTEM_ANNOUNCEMENT') continue;
      filtered[key] = value;
    }
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: { notificationPrefs: true },
    });

    const currentPrefs = (existing?.notificationPrefs as Record<string, boolean> | null) ?? {};
    const merged = { ...currentPrefs, ...filtered };

    await prisma.user.update({
      where: { id: user.id },
      data: { notificationPrefs: merged },
    });

    res.json({ preferences: { ...DEFAULT_NOTIFICATION_PREFS, ...merged } });
  } catch (err) {
    logger.error({ err }, '[NOTIFICATIONS] Failed to update preferences');
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /api/notifications/admin/broadcast
 * Send a SYSTEM_ANNOUNCEMENT to all approved users.
 */
router.post('/admin/broadcast', requireAdmin, async (req: Request, res: Response) => {
  const { title, body } = req.body as { title?: string; body?: string };

  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  try {
    const approvedUsers = await prisma.user.findMany({
      where: { approved: true },
      select: { id: true },
    });

    for (const u of approvedUsers) {
      createNotification({
        userId: u.id,
        type: 'SYSTEM_ANNOUNCEMENT',
        title,
        body,
      });
    }

    res.json({ sent: approvedUsers.length });
  } catch (err) {
    logger.error({ err }, '[NOTIFICATIONS] Broadcast failed');
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

export default router;
