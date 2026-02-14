import express from 'express';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';

// Mock notification service (for route tests only — service tests use the real functions)
vi.mock('../services/notificationService', () => ({
  getUnreadCount: vi.fn().mockResolvedValue(5),
  getEffectivePrefs: vi.fn().mockResolvedValue({
    BID_RECEIVED: true,
    BID_ACCEPTED: true,
    BID_REJECTED: true,
    BID_COUNTERED: true,
    BID_OUTCOME: true,
    PRODUCT_NEW: true,
    PRODUCT_PRICE: true,
    PRODUCT_STOCK: false,
    MATCH_SUGGESTION: true,
    COA_PROCESSED: false,
    PREDICTION_DUE: true,
    SYSTEM_ANNOUNCEMENT: true,
  }),
  createNotification: vi.fn().mockResolvedValue(undefined),
  DEFAULT_NOTIFICATION_PREFS: {
    BID_RECEIVED: true,
    BID_ACCEPTED: true,
    BID_REJECTED: true,
    BID_COUNTERED: true,
    BID_OUTCOME: true,
    PRODUCT_NEW: true,
    PRODUCT_PRICE: true,
    PRODUCT_STOCK: false,
    MATCH_SUGGESTION: true,
    COA_PROCESSED: false,
    PREDICTION_DUE: true,
    SYSTEM_ANNOUNCEMENT: true,
  },
}));

vi.mock('../middleware/auth', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../services/auditService', () => ({
  logAudit: vi.fn(),
  getRequestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

import notificationsRouter from '../routes/notifications';
import {
  getUnreadCount,
  getEffectivePrefs,
  createNotification,
} from '../services/notificationService';

// ─── Test fixtures ───

const mockUser = {
  id: 'user-1',
  clerkUserId: 'clerk-user-1',
  zohoContactId: 'zoho-user-1',
  email: 'user@example.com',
  firstName: 'Test',
  lastName: 'User',
  companyName: 'Test Corp',
  contactType: 'Buyer',
  approved: true,
  eulaAcceptedAt: new Date(),
  docUploaded: true,
  notificationPrefs: null,
};

const mockNotification = {
  id: 'notif-1',
  userId: 'user-1',
  type: 'BID_RECEIVED',
  title: 'New Bid',
  body: 'You received a new bid on Test Strain',
  data: null,
  read: false,
  readAt: null,
  createdAt: new Date('2025-01-15T10:00:00Z'),
};

const mockNotification2 = {
  id: 'notif-2',
  userId: 'user-1',
  type: 'BID_ACCEPTED',
  title: 'Bid Accepted',
  body: 'Your bid was accepted',
  data: null,
  read: true,
  readAt: new Date('2025-01-15T11:00:00Z'),
  createdAt: new Date('2025-01-15T09:00:00Z'),
};

// ─── Test app factory ───

function createTestApp(router: express.Router, user: any = mockUser) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/', router);
  return app;
}

// ═══════════════════════════════════════════════════════════
// ROUTE TESTS
// ═══════════════════════════════════════════════════════════

describe('Notification Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure prisma.notification mock methods are available
    (prisma as any).notification = {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    };
  });

  // ─── GET / ───

  describe('GET / - List notifications', () => {
    it('lists notifications with default pagination', async () => {
      const notifications = [mockNotification, mockNotification2];
      vi.mocked((prisma as any).notification.findMany).mockResolvedValue(notifications);
      vi.mocked((prisma as any).notification.count).mockResolvedValue(2);

      const app = createTestApp(notificationsRouter);
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(2);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(20);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.totalPages).toBe(1);
      expect((prisma as any).notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('lists notifications with unreadOnly=true', async () => {
      vi.mocked((prisma as any).notification.findMany).mockResolvedValue([mockNotification]);
      vi.mocked((prisma as any).notification.count).mockResolvedValue(1);

      const app = createTestApp(notificationsRouter);
      const res = await request(app).get('/?unreadOnly=true');

      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(1);
      expect((prisma as any).notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', read: false },
        }),
      );
    });

    it('handles pagination parameters correctly', async () => {
      vi.mocked((prisma as any).notification.findMany).mockResolvedValue([]);
      vi.mocked((prisma as any).notification.count).mockResolvedValue(50);

      const app = createTestApp(notificationsRouter);
      const res = await request(app).get('/?page=3&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(3);
      expect(res.body.pagination.limit).toBe(10);
      expect(res.body.pagination.total).toBe(50);
      expect(res.body.pagination.totalPages).toBe(5);
      expect((prisma as any).notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3-1) * 10
          take: 10,
        }),
      );
    });
  });

  // ─── GET /unread-count ───

  describe('GET /unread-count', () => {
    it('returns unread count from service', async () => {
      const app = createTestApp(notificationsRouter);
      const res = await request(app).get('/unread-count');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
      expect(getUnreadCount).toHaveBeenCalledWith('user-1');
    });
  });

  // ─── PATCH /read ───

  describe('PATCH /read - Mark notifications as read', () => {
    it('marks specific notifications as read by ids', async () => {
      vi.mocked((prisma as any).notification.updateMany).mockResolvedValue({ count: 2 });

      const app = createTestApp(notificationsRouter);
      const res = await request(app)
        .patch('/read')
        .send({ ids: ['notif-1', 'notif-2'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect((prisma as any).notification.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['notif-1', 'notif-2'] }, userId: 'user-1' },
        data: { read: true, readAt: expect.any(Date) },
      });
    });

    it('marks all notifications as read', async () => {
      vi.mocked((prisma as any).notification.updateMany).mockResolvedValue({ count: 5 });

      const app = createTestApp(notificationsRouter);
      const res = await request(app)
        .patch('/read')
        .send({ all: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect((prisma as any).notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
        data: { read: true, readAt: expect.any(Date) },
      });
    });

    it('returns 400 when body is empty (no ids or all)', async () => {
      const app = createTestApp(notificationsRouter);
      const res = await request(app)
        .patch('/read')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  // ─── GET /preferences ───

  describe('GET /preferences', () => {
    it('returns effective preferences and defaults', async () => {
      const app = createTestApp(notificationsRouter);
      const res = await request(app).get('/preferences');

      expect(res.status).toBe(200);
      expect(res.body.preferences).toBeDefined();
      expect(res.body.defaults).toBeDefined();
      expect(res.body.preferences.BID_RECEIVED).toBe(true);
      expect(res.body.preferences.PRODUCT_STOCK).toBe(false);
      expect(res.body.defaults.SYSTEM_ANNOUNCEMENT).toBe(true);
      expect(getEffectivePrefs).toHaveBeenCalledWith('user-1');
    });
  });

  // ─── PATCH /preferences ───

  describe('PATCH /preferences - Update preferences', () => {
    it('updates preferences and returns merged result', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        notificationPrefs: { BID_RECEIVED: true },
      } as any);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any);

      // Zod v4 z.record(z.enum([...]), z.boolean()) requires all keys
      const fullPrefs = {
        BID_RECEIVED: true,
        BID_ACCEPTED: true,
        BID_REJECTED: true,
        BID_COUNTERED: true,
        BID_OUTCOME: false,
        PRODUCT_NEW: true,
        PRODUCT_PRICE: true,
        PRODUCT_STOCK: true,
        MATCH_SUGGESTION: true,
        COA_PROCESSED: false,
        PREDICTION_DUE: true,
        SHORTLIST_PRICE_DROP: true,
        SYSTEM_ANNOUNCEMENT: true,
      };

      const app = createTestApp(notificationsRouter);
      const res = await request(app)
        .patch('/preferences')
        .send(fullPrefs);

      expect(res.status).toBe(200);
      expect(res.body.preferences).toBeDefined();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { notificationPrefs: true },
      });
      // SYSTEM_ANNOUNCEMENT is stripped, rest merged with existing
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          notificationPrefs: expect.objectContaining({
            BID_RECEIVED: true,
            PRODUCT_STOCK: true,
            BID_OUTCOME: false,
          }),
        },
      });
    });

    it('SYSTEM_ANNOUNCEMENT cannot be turned off', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        notificationPrefs: {},
      } as any);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any);

      // Send all keys (Zod v4 requires all enum keys in z.record)
      const fullPrefs = {
        BID_RECEIVED: false,
        BID_ACCEPTED: true,
        BID_REJECTED: true,
        BID_COUNTERED: true,
        BID_OUTCOME: true,
        PRODUCT_NEW: true,
        PRODUCT_PRICE: true,
        PRODUCT_STOCK: false,
        MATCH_SUGGESTION: true,
        COA_PROCESSED: false,
        PREDICTION_DUE: true,
        SHORTLIST_PRICE_DROP: true,
        SYSTEM_ANNOUNCEMENT: false, // Attempting to disable - should be ignored
      };

      const app = createTestApp(notificationsRouter);
      const res = await request(app)
        .patch('/preferences')
        .send(fullPrefs);

      expect(res.status).toBe(200);
      // SYSTEM_ANNOUNCEMENT should NOT be in the stored prefs update
      const updateCall = vi.mocked(prisma.user.update).mock.calls[0][0];
      const storedPrefs = updateCall.data.notificationPrefs as Record<string, boolean>;
      expect(storedPrefs).not.toHaveProperty('SYSTEM_ANNOUNCEMENT');
      expect(storedPrefs.BID_RECEIVED).toBe(false);
    });
  });

  // ─── POST /admin/broadcast ───

  describe('POST /admin/broadcast', () => {
    it('sends SYSTEM_ANNOUNCEMENT to all approved users', async () => {
      const approvedUsers = [
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(approvedUsers as any);

      const app = createTestApp(notificationsRouter);
      const res = await request(app)
        .post('/admin/broadcast')
        .send({ title: 'Maintenance Notice', body: 'System will be down tonight.' });

      expect(res.status).toBe(200);
      expect(res.body.sent).toBe(3);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { approved: true },
        select: { id: true },
      });
      expect(createNotification).toHaveBeenCalledTimes(3);
      expect(createNotification).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'SYSTEM_ANNOUNCEMENT',
        title: 'Maintenance Notice',
        body: 'System will be down tonight.',
      });
    });

    it('returns 400 when title is empty', async () => {
      const app = createTestApp(notificationsRouter);
      const res = await request(app)
        .post('/admin/broadcast')
        .send({ title: '', body: 'Some body text' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// SERVICE UNIT TESTS (using real functions, mocking prisma)
// ═══════════════════════════════════════════════════════════

// We need to import the actual service functions rather than the mocked ones.
// Since vi.mock is hoisted, we use vi.importActual to get the real implementations.

describe('Notification Service', () => {
  let realGetEffectivePrefs: typeof import('../services/notificationService').getEffectivePrefs;
  let realCreateNotification: typeof import('../services/notificationService').createNotification;
  let realGetUnreadCount: typeof import('../services/notificationService').getUnreadCount;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Set up notification mock on prisma
    (prisma as any).notification = {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    };

    // Import the actual (non-mocked) service functions
    const actual = await vi.importActual<typeof import('../services/notificationService')>(
      '../services/notificationService',
    );
    realGetEffectivePrefs = actual.getEffectivePrefs;
    realCreateNotification = actual.createNotification;
    realGetUnreadCount = actual.getUnreadCount;
  });

  // ─── getEffectivePrefs ───

  describe('getEffectivePrefs', () => {
    it('returns defaults when user has no overrides', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        notificationPrefs: null,
      } as any);

      const prefs = await realGetEffectivePrefs('user-1');

      expect(prefs.BID_RECEIVED).toBe(true);
      expect(prefs.PRODUCT_STOCK).toBe(false);
      expect(prefs.SYSTEM_ANNOUNCEMENT).toBe(true);
      expect(prefs.COA_PROCESSED).toBe(false);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { notificationPrefs: true },
      });
    });

    it('merges user overrides with defaults', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        notificationPrefs: { PRODUCT_STOCK: true, BID_RECEIVED: false },
      } as any);

      const prefs = await realGetEffectivePrefs('user-1');

      // Overridden values
      expect(prefs.PRODUCT_STOCK).toBe(true);
      expect(prefs.BID_RECEIVED).toBe(false);
      // Default values preserved
      expect(prefs.BID_ACCEPTED).toBe(true);
      expect(prefs.SYSTEM_ANNOUNCEMENT).toBe(true);
    });
  });

  // ─── createNotification ───

  describe('createNotification', () => {
    it('suppresses notification when user preference is disabled', async () => {
      // User has PRODUCT_NEW disabled
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        notificationPrefs: { PRODUCT_NEW: false },
      } as any);

      await realCreateNotification({
        userId: 'user-1',
        type: 'PRODUCT_NEW' as any,
        title: 'New Product',
        body: 'A new product is available',
      });

      // Should NOT create a notification
      expect((prisma as any).notification.create).not.toHaveBeenCalled();
    });

    it('SYSTEM_ANNOUNCEMENT bypasses preference checks', async () => {
      // Even if user somehow has prefs set, SYSTEM_ANNOUNCEMENT still goes through
      vi.mocked((prisma as any).notification.create).mockResolvedValue({
        id: 'notif-new',
      });

      await realCreateNotification({
        userId: 'user-1',
        type: 'SYSTEM_ANNOUNCEMENT' as any,
        title: 'System Update',
        body: 'Important system update',
      });

      // Should create without checking prefs (findUnique should NOT be called)
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect((prisma as any).notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'SYSTEM_ANNOUNCEMENT',
          title: 'System Update',
          body: 'Important system update',
        }),
      });
    });

    it('creates notification in DB when type is allowed by prefs', async () => {
      // User has default prefs (BID_RECEIVED defaults to true)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        notificationPrefs: null,
      } as any);
      vi.mocked((prisma as any).notification.create).mockResolvedValue({
        id: 'notif-new',
        userId: 'user-1',
        type: 'BID_RECEIVED',
        title: 'New Bid',
        body: 'You got a bid',
      });

      await realCreateNotification({
        userId: 'user-1',
        type: 'BID_RECEIVED' as any,
        title: 'New Bid',
        body: 'You got a bid',
      });

      expect((prisma as any).notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'BID_RECEIVED',
          title: 'New Bid',
          body: 'You got a bid',
          data: undefined,
        },
      });
    });
  });

  // ─── getUnreadCount ───

  describe('getUnreadCount', () => {
    it('returns count from prisma notification.count', async () => {
      vi.mocked((prisma as any).notification.count).mockResolvedValue(12);

      const count = await realGetUnreadCount('user-1');

      expect(count).toBe(12);
      expect((prisma as any).notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
      });
    });
  });
});
