import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../index';
import logger from '../utils/logger';
import { isEmailConfigured, sendNotificationEmail } from './emailService';

export const DEFAULT_NOTIFICATION_PREFS: Record<string, boolean> = {
  BID_RECEIVED: true,
  BID_ACCEPTED: true,
  BID_REJECTED: true,
  BID_COUNTERED: true,
  BID_OUTCOME: true,
  PRODUCT_APPROVED: true,
  PRODUCT_NEW: true,
  PRODUCT_PRICE: true,
  PRODUCT_STOCK: false,
  MATCH_SUGGESTION: true,
  COA_PROCESSED: false,
  PREDICTION_DUE: true,
  SHORTLIST_PRICE_DROP: true,
  ISO_MATCH_FOUND: true,
  ISO_SELLER_RESPONSE: true,
  EDIT_APPROVED: true,
  EDIT_REJECTED: true,
  SYSTEM_ANNOUNCEMENT: true,
};

export const DEFAULT_EMAIL_PREFS: Record<string, boolean> = {
  BID_RECEIVED: true,
  BID_ACCEPTED: true,
  BID_REJECTED: true,
  BID_COUNTERED: false,
  BID_OUTCOME: false,
  PRODUCT_APPROVED: true,
  PRODUCT_NEW: false,
  PRODUCT_PRICE: false,
  PRODUCT_STOCK: false,
  MATCH_SUGGESTION: false,
  COA_PROCESSED: false,
  PREDICTION_DUE: false,
  SHORTLIST_PRICE_DROP: true,
  ISO_MATCH_FOUND: true,
  ISO_SELLER_RESPONSE: true,
  EDIT_APPROVED: true,
  EDIT_REJECTED: true,
  SYSTEM_ANNOUNCEMENT: true,
};

/**
 * Get effective email preferences for a user (defaults merged with overrides).
 */
export async function getEffectiveEmailPrefs(userId: string): Promise<Record<string, boolean>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailNotificationPrefs: true },
  });

  const overrides = (user?.emailNotificationPrefs as Record<string, boolean> | null) ?? {};
  return { ...DEFAULT_EMAIL_PREFS, ...overrides };
}

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Get effective preferences for a user (defaults merged with overrides).
 */
export async function getEffectivePrefs(userId: string): Promise<Record<string, boolean>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true },
  });

  const overrides = (user?.notificationPrefs as Record<string, boolean> | null) ?? {};
  return { ...DEFAULT_NOTIFICATION_PREFS, ...overrides };
}

/**
 * Create a single notification.
 * Fire-and-forget safe — catches errors internally.
 * SYSTEM_ANNOUNCEMENT bypasses preference checks.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    // SYSTEM_ANNOUNCEMENT always goes through
    if (input.type !== 'SYSTEM_ANNOUNCEMENT') {
      const prefs = await getEffectivePrefs(input.userId);
      if (!prefs[input.type]) return;
    }

    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data ? (input.data as Prisma.InputJsonValue) : undefined,
      },
    });

    // Fire-and-forget email
    if (isEmailConfigured) {
      try {
        const emailPrefs = await getEffectiveEmailPrefs(input.userId);
        const shouldEmail = input.type === 'SYSTEM_ANNOUNCEMENT' || emailPrefs[input.type];
        if (shouldEmail) {
          const user = await prisma.user.findUnique({
            where: { id: input.userId },
            select: { email: true, firstName: true },
          });
          if (user?.email) {
            sendNotificationEmail(user, { type: input.type, title: input.title, body: input.body, data: input.data });
          }
        }
      } catch (emailErr) {
        logger.error({ err: emailErr, type: input.type, userId: input.userId }, '[NOTIFICATIONS] Email send failed');
      }
    }
  } catch (err) {
    logger.error({ err, type: input.type, userId: input.userId }, '[NOTIFICATIONS] Failed to create notification');
  }
}

/**
 * Create notifications for multiple users.
 * Respects each user's preferences individually.
 */
export async function createNotificationBatch(
  inputs: CreateNotificationInput[],
): Promise<void> {
  for (const input of inputs) {
    // Don't await — fire-and-forget for each
    createNotification(input);
  }
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}
