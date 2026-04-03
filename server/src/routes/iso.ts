/**
 * ISO (In Search Of) Routes
 * Buyers post what they're looking for; sellers can respond with "I have this".
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import logger from '../utils/logger';
import { writeLimiter } from '../utils/rateLimiters';
import {
  validate,
  validateQuery,
  validateParams,
  isoCreateSchema,
  isoQuerySchema,
  isoRespondSchema,
  isoUpdateSchema,
} from '../utils/validation';
import { createNotification } from '../services/notificationService';
import { matchIsoToProducts } from '../services/isoMatchingService';
import { logAudit, getRequestIp } from '../services/auditService';
import { z } from 'zod';

const router = Router();
const idParams = z.object({ id: z.string().min(1) });

/**
 * POST /api/iso
 * Create a new ISO request. Any marketplace user can post.
 */
router.post('/', writeLimiter, validate(isoCreateSchema), async (req: Request, res: Response) => {
  const userId = req.user!.id;

  try {
    const iso = await prisma.isoRequest.create({
      data: {
        buyerId: userId,
        ...req.body,
        expiresAt: req.body.expiresAt ?? null,
      },
    });

    // Fire-and-forget: auto-match against existing products
    matchIsoToProducts(iso.id).catch(() => {});

    res.status(201).json({ iso });
  } catch (err) {
    logger.error({ err }, '[ISO] Create error');
    res.status(500).json({ error: 'Failed to create ISO request' });
  }
});

/**
 * GET /api/iso/my
 * List buyer's own ISOs with full detail (not anonymized).
 * Must be before /:id to avoid route conflict.
 */
router.get('/my', validateQuery(isoQuerySchema), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { page, limit, status, category, visibility, sort, order } = req.query as any;

  const where: any = { buyerId: userId };
  if (status) where.status = status;
  if (category) where.category = category;
  if (visibility === 'public') where.isPrivate = false;
  else if (visibility === 'private') where.isPrivate = true;

  let orderBy: any;
  switch (sort) {
    case 'expiry':
      orderBy = { expiresAt: order };
      break;
    case 'budget':
      orderBy = { budgetMax: order };
      break;
    case 'date':
    default:
      orderBy = { createdAt: order };
      break;
  }

  try {
    const [items, total] = await Promise.all([
      prisma.isoRequest.findMany({
        where,
        include: {
          matchedProduct: {
            select: {
              id: true,
              name: true,
              category: true,
              type: true,
              pricePerUnit: true,
              gramsAvailable: true,
              imageUrls: true,
            },
          },
          _count: { select: { responses: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.isoRequest.count({ where }),
    ]);

    res.json({
      items: items.map((iso) => ({
        ...iso,
        responseCount: iso._count.responses,
        _count: undefined,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, '[ISO] My ISOs error');
    res.status(500).json({ error: 'Failed to fetch ISOs' });
  }
});

/**
 * GET /api/iso/matches
 * Buyer's auto-matched ISOs with product details.
 * Must be before /:id to avoid route conflict.
 */
router.get('/matches', async (req: Request, res: Response) => {
  const userId = req.user!.id;

  try {
    const matchedIsos = await prisma.isoRequest.findMany({
      where: {
        buyerId: userId,
        status: 'MATCHED',
        matchedProductId: { not: null },
      },
      include: {
        matchedProduct: {
          select: {
            id: true,
            name: true,
            category: true,
            type: true,
            certification: true,
            thcMin: true,
            thcMax: true,
            cbdMin: true,
            cbdMax: true,
            pricePerUnit: true,
            gramsAvailable: true,
            imageUrls: true,
            isActive: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ items: matchedIsos });
  } catch (err) {
    logger.error({ err }, '[ISO] Matches error');
    res.status(500).json({ error: 'Failed to fetch ISO matches' });
  }
});

/**
 * GET /api/iso/admin
 * Admin view of all ISOs (non-anonymized).
 */
router.get('/admin', async (req: Request, res: Response) => {
  const isAdmin = req.user!.email && process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim()).includes(req.user!.email);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const items = await prisma.isoRequest.findMany({
      include: {
        buyer: {
          select: { id: true, email: true, companyName: true, firstName: true, lastName: true },
        },
        matchedProduct: {
          select: { id: true, name: true, category: true },
        },
        responses: {
          include: {
            seller: {
              select: { id: true, email: true, companyName: true, firstName: true, lastName: true },
            },
            product: {
              select: { id: true, name: true },
            },
          },
        },
        _count: { select: { responses: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({
      items: items.map((iso) => ({
        ...iso,
        responseCount: iso._count.responses,
        _count: undefined,
      })),
    });
  } catch (err) {
    logger.error({ err }, '[ISO] Admin list error');
    res.status(500).json({ error: 'Failed to fetch ISOs' });
  }
});

/**
 * GET /api/iso
 * Browse ISO board (anonymized — buyer info hidden).
 */
router.get('/', validateQuery(isoQuerySchema), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { page, limit, status, category, mine, visibility, sort, order } = req.query as any;
  const isSeller = req.user!.contactType?.includes('Seller') ?? false;

  const where: any = {};
  if (mine === 'true') {
    where.buyerId = userId;
    // Support visibility filter for "mine" mode
    if (visibility === 'public') where.isPrivate = false;
    else if (visibility === 'private') where.isPrivate = true;
  } else {
    // Public browse: never show private ISOs
    where.isPrivate = false;
  }
  if (status) {
    where.status = status;
  } else if (mine !== 'true') {
    // Default: only show OPEN ISOs on the public board (including those with no expiry)
    where.status = 'OPEN';
    where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
  }
  if (category) where.category = category;

  let orderBy: any;
  switch (sort) {
    case 'expiry':
      orderBy = { expiresAt: order };
      break;
    case 'budget':
      orderBy = { budgetMax: order };
      break;
    case 'date':
    default:
      orderBy = { createdAt: order };
      break;
  }

  try {
    const [items, total] = await Promise.all([
      prisma.isoRequest.findMany({
        where,
        include: {
          _count: { select: { responses: true } },
          // Include seller responses for sellers to know if they already responded
          ...(isSeller ? {
            responses: {
              where: { sellerId: userId },
              select: { id: true, status: true },
            },
          } : {}),
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.isoRequest.count({ where }),
    ]);

    // Anonymize: strip buyerId for non-owners
    const anonymized = items.map((iso: any) => {
      const isOwner = iso.buyerId === userId;
      return {
        id: iso.id,
        title: iso.title,
        category: iso.category,
        type: iso.type,
        certification: iso.certification,
        thcMin: iso.thcMin,
        thcMax: iso.thcMax,
        cbdMin: iso.cbdMin,
        cbdMax: iso.cbdMax,
        quantityMin: iso.quantityMin,
        quantityMax: iso.quantityMax,
        budgetMax: iso.budgetMax,
        notes: iso.notes,
        isPrivate: iso.isPrivate,
        status: iso.status,
        expiresAt: iso.expiresAt,
        createdAt: iso.createdAt,
        responseCount: iso._count.responses,
        isOwner,
        ...(isOwner ? { buyerId: iso.buyerId } : {}),
        hasResponded: iso.responses?.length > 0 ? true : false,
      };
    });

    res.json({
      items: anonymized,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, '[ISO] Browse error');
    res.status(500).json({ error: 'Failed to fetch ISOs' });
  }
});

/**
 * GET /api/iso/:id
 * ISO detail. Anonymized for non-owners.
 */
router.get('/:id', validateParams(idParams), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = (req as any).params;

  try {
    const iso = await prisma.isoRequest.findUnique({
      where: { id },
      include: {
        matchedProduct: {
          select: {
            id: true,
            name: true,
            category: true,
            type: true,
            pricePerUnit: true,
            gramsAvailable: true,
            imageUrls: true,
          },
        },
        _count: { select: { responses: true } },
        responses: {
          include: {
            seller: { select: { id: true, companyName: true } },
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!iso) {
      return res.status(404).json({ error: 'ISO request not found' });
    }

    const isOwner = iso.buyerId === userId;
    const isAdmin = !!(req.user!.email && process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim()).includes(req.user!.email));

    // Private ISOs are only visible to owner and admins
    if (iso.isPrivate && !isOwner && !isAdmin) {
      return res.status(404).json({ error: 'ISO request not found' });
    }

    const result: any = {
      id: iso.id,
      title: iso.title,
      category: iso.category,
      type: iso.type,
      certification: iso.certification,
      thcMin: iso.thcMin,
      thcMax: iso.thcMax,
      cbdMin: iso.cbdMin,
      cbdMax: iso.cbdMax,
      quantityMin: iso.quantityMin,
      quantityMax: iso.quantityMax,
      budgetMax: iso.budgetMax,
      notes: iso.notes,
      isPrivate: iso.isPrivate,
      status: iso.status,
      expiresAt: iso.expiresAt,
      createdAt: iso.createdAt,
      responseCount: iso._count.responses,
      isOwner,
      matchedProduct: isOwner ? iso.matchedProduct : undefined,
    };

    if (isOwner) {
      result.buyerId = iso.buyerId;
      result.responses = iso.responses;
    }

    res.json({ iso: result });
  } catch (err) {
    logger.error({ err }, '[ISO] Detail error');
    res.status(500).json({ error: 'Failed to fetch ISO detail' });
  }
});

/**
 * PATCH /api/iso/:id
 * Edit, close, or reopen an ISO. Owner or admin.
 */
router.patch('/:id', writeLimiter, validateParams(idParams), validate(isoUpdateSchema), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = (req as any).params;
  const { status, expiresAt, title, category, type, certification, thcMin, thcMax, cbdMin, cbdMax, quantityMin, quantityMax, budgetMax, notes, isPrivate } = req.body;

  try {
    const iso = await prisma.isoRequest.findUnique({ where: { id } });

    if (!iso) {
      return res.status(404).json({ error: 'ISO request not found' });
    }

    const isOwner = iso.buyerId === userId;
    const isAdmin = !!(req.user!.email && process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim()).includes(req.user!.email));

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only modify your own ISO requests' });
    }

    const updateData: any = {};

    // Status logic
    if (status === 'CLOSED') {
      updateData.status = 'CLOSED';
    }

    // Expiry lifecycle — expiresAt changes bypass content-edit status guard
    if (expiresAt !== undefined) {
      updateData.expiresAt = expiresAt; // Date or null (no expiry)
      // Reopen if was expired or closed
      if (iso.status === 'EXPIRED' || iso.status === 'CLOSED') {
        updateData.status = 'OPEN';
      }
    }

    // isPrivate can be toggled independently (not gated by status)
    if (isPrivate !== undefined) {
      updateData.isPrivate = isPrivate;
    }

    // Content field edits — only allowed on OPEN or MATCHED (unless reopening via expiresAt)
    const contentFields = { title, category, type, certification, thcMin, thcMax, cbdMin, cbdMax, quantityMin, quantityMax, budgetMax, notes };
    const hasContentEdits = Object.values(contentFields).some((v) => v !== undefined);

    if (hasContentEdits) {
      const effectiveStatus = updateData.status || iso.status;
      if (effectiveStatus !== 'OPEN' && effectiveStatus !== 'MATCHED') {
        return res.status(400).json({ error: 'Cannot edit content on a closed or expired ISO request' });
      }

      for (const [key, value] of Object.entries(contentFields)) {
        if (value !== undefined) {
          updateData[key] = value;
        }
      }
    }

    const updated = await prisma.isoRequest.update({
      where: { id },
      data: updateData,
    });

    // Audit log when admin edits someone else's ISO
    if (isAdmin && !isOwner) {
      logAudit({
        actorId: userId,
        actorEmail: req.user!.email,
        action: 'iso.edit',
        targetType: 'IsoRequest',
        targetId: id,
        metadata: updateData,
        ip: getRequestIp(req),
      });
    }

    res.json({ iso: updated });
  } catch (err) {
    logger.error({ err }, '[ISO] Update error');
    res.status(500).json({ error: 'Failed to update ISO request' });
  }
});

/**
 * POST /api/iso/:id/respond
 * Seller clicks "I have this" — creates IsoResponse, notifies admin + buyer.
 */
router.post('/:id/respond', writeLimiter, validateParams(idParams), validate(isoRespondSchema), async (req: Request, res: Response) => {
  const sellerId = req.user!.id;
  const { id } = (req as any).params;
  const { productId, message } = req.body;

  try {
    const iso = await prisma.isoRequest.findUnique({ where: { id } });

    if (!iso) {
      return res.status(404).json({ error: 'ISO request not found' });
    }

    if (iso.isPrivate) {
      return res.status(403).json({ error: 'Cannot respond to a private request' });
    }

    if (iso.status !== 'OPEN' && iso.status !== 'MATCHED') {
      return res.status(400).json({ error: 'This ISO request is no longer accepting responses' });
    }

    if (iso.buyerId === sellerId) {
      return res.status(400).json({ error: 'You cannot respond to your own ISO request' });
    }

    // Verify product belongs to seller if specified
    if (productId) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sellerId: true },
      });
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      if (product.sellerId !== sellerId) {
        return res.status(403).json({ error: 'You can only reference your own products' });
      }
    }

    // Create response (unique constraint prevents duplicates)
    const response = await prisma.isoResponse.create({
      data: {
        isoRequestId: id,
        sellerId,
        productId: productId || null,
        message: message || null,
        status: 'admin_notified',
      },
    });

    // Notify admins
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
    if (adminEmails.length > 0) {
      const adminUsers = await prisma.user.findMany({
        where: { email: { in: adminEmails } },
        select: { id: true },
      });

      const sellerUser = await prisma.user.findUnique({
        where: { id: sellerId },
        select: { companyName: true, email: true },
      });

      for (const admin of adminUsers) {
        createNotification({
          userId: admin.id,
          type: 'ISO_SELLER_RESPONSE',
          title: 'ISO Seller Response',
          body: `${sellerUser?.companyName || sellerUser?.email} responded to an ISO request`,
          data: { isoRequestId: id, isoResponseId: response.id, sellerId },
        });
      }
    }

    // Notify the ISO buyer
    createNotification({
      userId: iso.buyerId,
      type: 'ISO_SELLER_RESPONSE',
      title: 'Response to Your ISO',
      body: 'A seller may have what you\'re looking for',
      data: { isoRequestId: id, isoResponseId: response.id },
    });

    res.status(201).json({ response });
  } catch (err: any) {
    // Handle unique constraint violation (duplicate response)
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'You have already responded to this ISO request' });
    }
    logger.error({ err }, '[ISO] Respond error');
    res.status(500).json({ error: 'Failed to respond to ISO request' });
  }
});

export default router;
