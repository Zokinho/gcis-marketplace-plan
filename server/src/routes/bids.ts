import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { calculateProximity } from '../utils/proximity';
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

const router = Router();

/**
 * POST /api/bids
 * Create a new bid on a product.
 */
router.post('/', async (req: Request, res: Response) => {
  const buyer = req.user!;

  const { productId, pricePerUnit, quantity, notes } = req.body;

  // Validate required fields
  if (!productId || !pricePerUnit || !quantity) {
    return res.status(400).json({ error: 'productId, pricePerUnit, and quantity are required' });
  }

  const price = parseFloat(pricePerUnit);
  const qty = parseFloat(quantity);

  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: 'pricePerUnit must be a positive number' });
  }
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'quantity must be a positive number' });
  }

  // Fetch product with seller info
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { seller: true },
  });

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (!product.isActive) {
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
      console.error('[BIDS] Failed to create Zoho Task for bid:', bid.id, zohoErr);
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
    console.error('[BIDS] Failed to create bid:', err);
    res.status(500).json({ error: 'Failed to create bid' });
  }
});

/**
 * GET /api/bids
 * Get the current buyer's bid history.
 */
router.get('/', async (req: Request, res: Response) => {
  const buyer = req.user!;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const status = req.query.status as string | undefined;

  const where: any = { buyerId: buyer.id };
  if (status && ['PENDING', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'EXPIRED'].includes(status)) {
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
    console.error('[BIDS] Failed to fetch bids:', err);
    res.status(500).json({ error: 'Failed to fetch bids' });
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
    console.error('[BIDS] Failed to fetch bid:', err);
    res.status(500).json({ error: 'Failed to fetch bid' });
  }
});

/**
 * PATCH /api/bids/:id/accept
 * Seller accepts a bid → creates a Transaction.
 */
router.patch('/:id/accept', async (req: Request<{ id: string }>, res: Response) => {
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

    // Non-blocking side effects
    try {
      await churnDetectionService.resolveOnPurchase(bid.buyerId, bid.product.category || undefined);
    } catch (e) { console.error('[BIDS] Churn resolve error:', e); }

    try {
      if (bid.product.category) {
        await marketContextService.updateMarketPrice(bid.product.category, bid.pricePerUnit, bid.quantity);
      }
    } catch (e) { console.error('[BIDS] Market price update error:', e); }

    // Zoho writeback — all non-blocking
    // 1. Update Zoho Task status → Accepted
    if (bid.zohoTaskId) {
      try {
        await updateBidTaskStatus(bid.zohoTaskId, 'accept');
      } catch (e) { console.error('[BIDS] Zoho Task accept update failed:', e); }
    }

    // 2. Decrement inventory locally + push to Zoho
    if (bid.product.gramsAvailable != null && bid.product.gramsAvailable > 0) {
      const newGrams = Math.max(0, bid.product.gramsAvailable - bid.quantity);
      try {
        await pushProductUpdate(bid.productId, { gramsAvailable: newGrams });
      } catch (e) { console.error('[BIDS] Inventory decrement failed:', e); }
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
    } catch (e) { console.error('[BIDS] Zoho Deal creation failed:', e); }

    res.json({ transaction: { id: transaction.id, status: transaction.status } });
  } catch (err) {
    console.error('[BIDS] Failed to accept bid:', err);
    res.status(500).json({ error: 'Failed to accept bid' });
  }
});

/**
 * PATCH /api/bids/:id/reject
 * Seller rejects a bid.
 */
router.patch('/:id/reject', async (req: Request<{ id: string }>, res: Response) => {
  const seller = req.user!;

  try {
    const bid = await prisma.bid.findUnique({
      where: { id: req.params.id },
      include: { product: { select: { sellerId: true } } },
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

    // Zoho writeback — update Task status → Rejected
    if (bid.zohoTaskId) {
      try {
        await updateBidTaskStatus(bid.zohoTaskId, 'reject');
      } catch (e) { console.error('[BIDS] Zoho Task reject update failed:', e); }
    }

    res.json({ status: 'REJECTED' });
  } catch (err) {
    console.error('[BIDS] Failed to reject bid:', err);
    res.status(500).json({ error: 'Failed to reject bid' });
  }
});

/**
 * PATCH /api/bids/:id/outcome
 * Record delivery outcome for a transaction linked to a bid.
 */
router.patch('/:id/outcome', async (req: Request<{ id: string }>, res: Response) => {
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

    // Zoho writeback — append outcome to Task description
    if (bid.zohoTaskId) {
      try {
        await updateBidTaskOutcome(bid.zohoTaskId, {
          actualQuantityDelivered: parsedQty,
          deliveryOnTime: parsedOnTime,
          qualityAsExpected: parsedQuality,
          outcomeNotes: outcomeNotes || undefined,
        });
      } catch (e) { console.error('[BIDS] Zoho Task outcome update failed:', e); }
    }

    // Update Deal stage if applicable
    if (bid.transaction.zohoDealId) {
      try {
        const stage = (parsedQuality === false) ? 'Closed Lost' : 'Closed Won';
        await updateDealStage(bid.transaction.zohoDealId, stage);
      } catch (e) { console.error('[BIDS] Zoho Deal stage update failed:', e); }
    }

    res.json({ transaction: { id: transaction.id, status: transaction.status } });
  } catch (err) {
    console.error('[BIDS] Failed to record outcome:', err);
    res.status(500).json({ error: 'Failed to record outcome' });
  }
});

/**
 * GET /api/bids/seller
 * Get bids on the seller's products.
 */
router.get('/seller', async (req: Request, res: Response) => {
  const seller = req.user!;

  if (!seller.contactType?.includes('Seller')) {
    return res.status(403).json({ error: 'Seller access required' });
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const status = req.query.status as string | undefined;

  const where: any = { product: { sellerId: seller.id } };
  if (status && ['PENDING', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'EXPIRED'].includes(status)) {
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
    console.error('[BIDS] Failed to fetch seller bids:', err);
    res.status(500).json({ error: 'Failed to fetch seller bids' });
  }
});

export default router;
