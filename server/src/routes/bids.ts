import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { prisma } from '../index';
import { calculateProximity } from '../utils/proximity';
import { validate, validateQuery, createBidSchema, bidOutcomeSchema, bidListQuerySchema } from '../utils/validation';
import { isProductMarketplaceVisible } from '../utils/marketplaceVisibility';
import {
  createBidTask,
  updateBidTaskStatus,
  updateBidTaskOutcome,
  pushProductUpdate,
  createDeal,
  updateDealStage,
} from '../services/zohoApi';
import * as churnDetectionService from '../services/churnDetectionService';
import * as marketContextService from '../services/marketContextService';
import { createNotification } from '../services/notificationService';
import { logAudit, getRequestIp } from '../services/auditService';
import { writeLimiter } from '../utils/rateLimiters';

const router = Router();

/**
 * POST /api/bids
 * Create a new bid on a product.
 */
router.post('/', writeLimiter, validate(createBidSchema), async (req: Request, res: Response) => {
  const buyer = req.user!;

  const { productId, pricePerUnit: price, quantity: qty, notes } = req.body;

  // Fetch product with seller info
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { seller: true },
    // Note: include returns all scalar fields including marketplaceVisible
  });

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (!isProductMarketplaceVisible(product)) {
    return res.status(400).json({ error: 'This product is not currently active' });
  }

  // Prevent sellers from bidding on their own products
  if (product.sellerId === buyer.id) {
    return res.status(400).json({ error: 'You cannot bid on your own product' });
  }

  // Check minimum quantity
  if (product.minQtyRequest && qty < product.minQtyRequest) {
    return res.status(400).json({
      error: `Minimum order quantity is ${product.minQtyRequest}g`,
    });
  }

  const totalValue = price * qty;
  const proximityScore = calculateProximity(price, product.pricePerUnit || 0);

  try {
    // Create bid in database
    const bid = await prisma.bid.create({
      data: {
        productId,
        buyerId: buyer.id,
        pricePerUnit: price,
        quantity: qty,
        totalValue,
        proximityScore,
        notes: notes || null,
        status: 'PENDING',
      },
    });

    // Match conversion tracking (fire-and-forget)
    try {
      const existingMatch = await prisma.match.findUnique({
        where: { buyerId_productId: { buyerId: buyer.id, productId } },
      });
      if (existingMatch && (existingMatch.status === 'pending' || existingMatch.status === 'viewed')) {
        await prisma.match.update({
          where: { id: existingMatch.id },
          data: { status: 'converted', convertedBidId: bid.id },
        });
      }
    } catch (e) {
      logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[BIDS] Match conversion tracking error');
    }

    // Notify seller of new bid (fire-and-forget)
    createNotification({
      userId: product.sellerId,
      type: 'BID_RECEIVED',
      title: 'New bid received',
      body: `${buyer.companyName || 'A buyer'} bid $${price.toFixed(2)}/g on ${product.name}`,
      data: { bidId: bid.id, productId: product.id },
    });

    // Create Zoho Task (non-blocking — don't fail the bid if Zoho is down)
    try {
      await createBidTask(
        {
          id: bid.id,
          pricePerUnit: price,
          quantity: qty,
          totalValue,
          notes: notes || null,
        },
        {
          name: product.name,
          zohoProductId: product.zohoProductId,
          pricePerUnit: product.pricePerUnit,
        },
        {
          companyName: buyer.companyName,
          zohoContactId: buyer.zohoContactId,
        },
      );
    } catch (zohoErr) {
      logger.error({ err: zohoErr instanceof Error ? zohoErr : { message: String(zohoErr) }, bidId: bid.id }, '[BIDS] Failed to create Zoho Task for bid');
      // Bid is still created locally — Zoho task can be retried later
    }

    res.status(201).json({
      bid: {
        id: bid.id,
        proximityScore: bid.proximityScore,
        status: bid.status,
        totalValue: bid.totalValue,
      },
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[BIDS] Failed to create bid');
    res.status(500).json({ error: 'Failed to create bid' });
  }
});

/**
 * GET /api/bids
 * Get the current buyer's bid history.
 */
router.get('/', validateQuery(bidListQuerySchema), async (req: Request, res: Response) => {
  const buyer = req.user!;

  const { page, limit, status } = req.query as any;

  const where: any = { buyerId: buyer.id };
  if (status) {
    where.status = status;
  }

  try {
    const [bids, total] = await Promise.all([
      prisma.bid.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              category: true,
              type: true,
              certification: true,
              pricePerUnit: true,
              imageUrls: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bid.count({ where }),
    ]);

    res.json({
      bids,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[BIDS] Failed to fetch bids');
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

/**
 * GET /api/bids/seller
 * Get bids on the seller's products.
 * NOTE: Must be defined BEFORE /:id to avoid "seller" matching as a bid ID.
 */
router.get('/seller', validateQuery(bidListQuerySchema), async (req: Request, res: Response) => {
  const seller = req.user!;

  if (!seller.contactType?.includes('Seller')) {
    return res.status(403).json({ error: 'Seller access required' });
  }

  const { page, limit, status } = req.query as any;

  const where: any = { product: { sellerId: seller.id } };
  if (status) {
    where.status = status;
  }

  try {
    const [bids, total] = await Promise.all([
      prisma.bid.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, category: true, type: true, pricePerUnit: true, imageUrls: true } },
          buyer: { select: { id: true } },
          transaction: { select: { id: true, status: true, outcomeRecordedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bid.count({ where }),
    ]);

    res.json({
      bids,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[BIDS] Failed to fetch seller bids');
    res.status(500).json({ error: 'Failed to fetch seller bids' });
  }
});

/**
 * GET /api/bids/:id
 * Get a single bid's details.
 */
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const buyer = req.user!;

  try {
    const bid = await prisma.bid.findUnique({
      where: { id: req.params.id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            type: true,
            pricePerUnit: true,
            imageUrls: true,
          },
        },
      },
    });

    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    // Buyers can only see their own bids
    if (bid.buyerId !== buyer.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ bid });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[BIDS] Failed to fetch bid');
    res.status(500).json({ error: 'Failed to fetch bid' });
  }
});

/**
 * PATCH /api/bids/:id/accept
 * Seller accepts a bid → creates a Transaction.
 */
router.patch('/:id/accept', writeLimiter, async (req: Request<{ id: string }>, res: Response) => {
  const seller = req.user!;

  try {
    const bid = await prisma.bid.findUnique({
      where: { id: req.params.id },
      include: {
        product: {
          select: {
            id: true, sellerId: true, category: true,
            zohoProductId: true, gramsAvailable: true, name: true,
          },
        },
        buyer: { select: { zohoContactId: true, companyName: true } },
      },
    });

    if (!bid) return res.status(404).json({ error: 'Bid not found' });

    // Only the product's seller can accept
    if (bid.product.sellerId !== seller.id) {
      return res.status(403).json({ error: 'Only the product seller can accept bids' });
    }

    if (bid.status !== 'PENDING' && bid.status !== 'UNDER_REVIEW') {
      return res.status(400).json({ error: `Cannot accept a bid with status ${bid.status}` });
    }

    // Create transaction + update bid in a transaction
    const [transaction] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          buyerId: bid.buyerId,
          sellerId: seller.id,
          productId: bid.productId,
          bidId: bid.id,
          quantity: bid.quantity,
          pricePerUnit: bid.pricePerUnit,
          totalValue: bid.totalValue,
          status: 'pending',
        },
      }),
      prisma.bid.update({
        where: { id: bid.id },
        data: { status: 'ACCEPTED' },
      }),
      prisma.user.update({
        where: { id: bid.buyerId },
        data: {
          lastTransactionDate: new Date(),
          transactionCount: { increment: 1 },
          totalTransactionValue: { increment: bid.totalValue },
        },
      }),
    ]);

    // Notify buyer of acceptance (fire-and-forget)
    createNotification({
      userId: bid.buyerId,
      type: 'BID_ACCEPTED',
      title: 'Bid accepted!',
      body: `Your bid on ${bid.product.name} has been accepted`,
      data: { bidId: bid.id, productId: bid.productId },
    });

    // Non-blocking side effects
    try {
      await churnDetectionService.resolveOnPurchase(bid.buyerId, bid.product.category || undefined);
    } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[BIDS] Churn resolve error'); }

    try {
      if (bid.product.category) {
        await marketContextService.updateMarketPrice(bid.product.category, bid.pricePerUnit, bid.quantity);
      }
    } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[BIDS] Market price update error'); }

    // Zoho writeback — all non-blocking
    // 1. Update Zoho Task status → Accepted
    if (bid.zohoTaskId) {
      try {
        await updateBidTaskStatus(bid.zohoTaskId, 'accept');
      } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[BIDS] Zoho Task accept update failed'); }
    }

    // 2. Decrement inventory locally + push to Zoho
    if (bid.product.gramsAvailable != null && bid.product.gramsAvailable > 0) {
      const newGrams = Math.max(0, bid.product.gramsAvailable - bid.quantity);
      try {
        await pushProductUpdate(bid.productId, { gramsAvailable: newGrams });
      } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[BIDS] Inventory decrement failed'); }
    }

    // 3. Create Deal (if ZOHO_DEALS_ENABLED), store zohoDealId on Transaction
    try {
      const zohoDealId = await createDeal({
        productName: bid.product.name,
        buyerCompany: bid.buyer.companyName,
        buyerZohoContactId: bid.buyer.zohoContactId,
        sellerZohoContactId: seller.zohoContactId,
        amount: bid.totalValue,
        quantity: bid.quantity,
      });
      if (zohoDealId) {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { zohoDealId },
        });
      }
    } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[BIDS] Zoho Deal creation failed'); }

    logAudit({ actorId: seller.id, actorEmail: seller.email, action: 'bid.accept', targetType: 'Bid', targetId: bid.id, metadata: { productId: bid.productId, transactionId: transaction.id, buyerId: bid.buyerId }, ip: getRequestIp(req) });
    res.json({ transaction: { id: transaction.id, status: transaction.status } });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[BIDS] Failed to accept bid');
    res.status(500).json({ error: 'Failed to accept bid' });
  }
});

/**
 * PATCH /api/bids/:id/reject
 * Seller rejects a bid.
 */
router.patch('/:id/reject', writeLimiter, async (req: Request<{ id: string }>, res: Response) => {
  const seller = req.user!;

  try {
    const bid = await prisma.bid.findUnique({
      where: { id: req.params.id },
      include: { product: { select: { sellerId: true, name: true } } },
    });

    if (!bid) return res.status(404).json({ error: 'Bid not found' });

    if (bid.product.sellerId !== seller.id) {
      return res.status(403).json({ error: 'Only the product seller can reject bids' });
    }

    if (bid.status !== 'PENDING' && bid.status !== 'UNDER_REVIEW') {
      return res.status(400).json({ error: `Cannot reject a bid with status ${bid.status}` });
    }

    await prisma.bid.update({
      where: { id: bid.id },
      data: { status: 'REJECTED' },
    });

    // Notify buyer of rejection (fire-and-forget)
    createNotification({
      userId: bid.buyerId,
      type: 'BID_REJECTED',
      title: 'Bid rejected',
      body: `Your bid on ${bid.product.name} was not accepted`,
      data: { bidId: bid.id, productId: bid.productId },
    });

    // Zoho writeback — update Task status → Rejected
    if (bid.zohoTaskId) {
      try {
        await updateBidTaskStatus(bid.zohoTaskId, 'reject');
      } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[BIDS] Zoho Task reject update failed'); }
    }

    logAudit({ actorId: seller.id, actorEmail: seller.email, action: 'bid.reject', targetType: 'Bid', targetId: bid.id, metadata: { productId: bid.productId, buyerId: bid.buyerId }, ip: getRequestIp(req) });
    res.json({ status: 'REJECTED' });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[BIDS] Failed to reject bid');
    res.status(500).json({ error: 'Failed to reject bid' });
  }
});

/**
 * PATCH /api/bids/:id/outcome
 * Record delivery outcome for a transaction linked to a bid.
 */
router.patch('/:id/outcome', writeLimiter, validate(bidOutcomeSchema), async (req: Request<{ id: string }>, res: Response) => {
  const seller = req.user!;

  const { actualQuantityDelivered, deliveryOnTime, qualityAsExpected, outcomeNotes } = req.body;

  try {
    const bid = await prisma.bid.findUnique({
      where: { id: req.params.id },
      include: {
        product: { select: { sellerId: true } },
        transaction: true,
      },
    });

    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    if (bid.product.sellerId !== seller.id) {
      return res.status(403).json({ error: 'Only the product seller can record outcomes' });
    }
    if (!bid.transaction) {
      return res.status(400).json({ error: 'Bid has no associated transaction' });
    }

    const parsedQty = actualQuantityDelivered != null ? parseFloat(actualQuantityDelivered) : undefined;
    const parsedOnTime = deliveryOnTime != null ? Boolean(deliveryOnTime) : undefined;
    const parsedQuality = qualityAsExpected != null ? Boolean(qualityAsExpected) : undefined;

    const transaction = await prisma.transaction.update({
      where: { id: bid.transaction.id },
      data: {
        actualQuantityDelivered: parsedQty,
        deliveryOnTime: parsedOnTime,
        qualityAsExpected: parsedQuality,
        outcomeNotes: outcomeNotes || undefined,
        outcomeRecordedAt: new Date(),
        status: 'completed',
      },
    });

    // Notify buyer of outcome (fire-and-forget)
    createNotification({
      userId: bid.buyerId,
      type: 'BID_OUTCOME',
      title: 'Delivery outcome recorded',
      body: `Outcome recorded for your order — ${parsedQuality === false ? 'quality issue reported' : 'completed successfully'}`,
      data: { bidId: bid.id, productId: bid.productId },
    });

    // Zoho writeback — append outcome to Task description
    if (bid.zohoTaskId) {
      try {
        await updateBidTaskOutcome(bid.zohoTaskId, {
          actualQuantityDelivered: parsedQty,
          deliveryOnTime: parsedOnTime,
          qualityAsExpected: parsedQuality,
          outcomeNotes: outcomeNotes || undefined,
        });
      } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[BIDS] Zoho Task outcome update failed'); }
    }

    // Update Deal stage if applicable
    if (bid.transaction.zohoDealId) {
      try {
        const stage = (parsedQuality === false) ? 'Closed Lost' : 'Closed Won';
        await updateDealStage(bid.transaction.zohoDealId, stage);
      } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[BIDS] Zoho Deal stage update failed'); }
    }

    logAudit({ actorId: seller.id, actorEmail: seller.email, action: 'bid.outcome', targetType: 'Bid', targetId: bid.id, metadata: { transactionId: transaction.id, deliveryOnTime: parsedOnTime, qualityAsExpected: parsedQuality }, ip: getRequestIp(req) });
    res.json({ transaction: { id: transaction.id, status: transaction.status } });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[BIDS] Failed to record outcome');
    res.status(500).json({ error: 'Failed to record outcome' });
  }
});

export default router;
