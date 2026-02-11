import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { pushProductUpdate } from '../services/zohoApi';
import { zohoRequest } from '../services/zohoAuth';

const router = Router();

/**
 * GET /api/my-listings
 * Returns the seller's products with bid counts.
 */
router.get('/', async (req: Request, res: Response) => {
  const sellerId = req.user!.id;

  const products = await prisma.product.findMany({
    where: { sellerId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      category: true,
      type: true,
      certification: true,
      isActive: true,
      requestPending: true,
      pricePerUnit: true,
      gramsAvailable: true,
      upcomingQty: true,
      thcMin: true,
      thcMax: true,
      cbdMax: true,
      imageUrls: true,
      lastSyncedAt: true,
      _count: {
        select: { bids: true },
      },
    },
  });

  // Also get count of pending bids per product
  const pendingBidCounts = await prisma.bid.groupBy({
    by: ['productId'],
    where: {
      product: { sellerId },
      status: 'PENDING',
    },
    _count: true,
  });

  const pendingMap = new Map(pendingBidCounts.map((b) => [b.productId, b._count]));

  const listings = products.map((p) => ({
    ...p,
    totalBids: p._count.bids,
    pendingBids: pendingMap.get(p.id) || 0,
    _count: undefined,
  }));

  res.json({ listings });
});

/**
 * PATCH /api/my-listings/:id
 * Update seller-editable fields: pricePerUnit, gramsAvailable, upcomingQty.
 * Changes sync back to Zoho.
 */
router.patch('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const sellerId = req.user!.id;
  const productId = req.params.id;

  // Verify ownership
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sellerId: true, zohoProductId: true },
  });

  if (!product || product.sellerId !== sellerId) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { pricePerUnit, gramsAvailable, upcomingQty } = req.body as {
    pricePerUnit?: number;
    gramsAvailable?: number;
    upcomingQty?: number;
  };

  // Validate — at least one field must be provided
  if (pricePerUnit === undefined && gramsAvailable === undefined && upcomingQty === undefined) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const updates: { pricePerUnit?: number; gramsAvailable?: number; upcomingQty?: number } = {};
  if (pricePerUnit !== undefined) updates.pricePerUnit = Number(pricePerUnit);
  if (gramsAvailable !== undefined) updates.gramsAvailable = Number(gramsAvailable);
  if (upcomingQty !== undefined) updates.upcomingQty = Number(upcomingQty);

  try {
    await pushProductUpdate(productId, updates);
    const updated = await prisma.product.findUnique({ where: { id: productId } });
    res.json({ message: 'Product updated', product: updated });
  } catch (err: any) {
    console.error('[MY-LISTINGS] Update failed:', err?.message);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * PATCH /api/my-listings/:id/toggle-active
 * Pause or unpause a product listing.
 */
router.patch('/:id/toggle-active', async (req: Request<{ id: string }>, res: Response) => {
  const sellerId = req.user!.id;
  const productId = req.params.id;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sellerId: true, zohoProductId: true, isActive: true },
  });

  if (!product || product.sellerId !== sellerId) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const newActive = !product.isActive;

  // Update local DB
  await prisma.product.update({
    where: { id: productId },
    data: { isActive: newActive },
  });

  // Sync to Zoho
  try {
    await zohoRequest('PUT', `/Products/${product.zohoProductId}`, {
      data: { data: [{ Product_Active: newActive }], trigger: [] },
    });
  } catch (err: any) {
    console.error('[MY-LISTINGS] Zoho toggle sync failed:', err?.message);
    // Don't fail the request — local state is updated
  }

  res.json({ message: newActive ? 'Product activated' : 'Product paused', isActive: newActive });
});

// ─── Seller Share Links ───

/**
 * POST /api/my-listings/share
 * Create a shareable link for selected products (or all active).
 */
router.post('/share', async (req: Request, res: Response) => {
  const sellerId = req.user!.id;
  const { label, productIds, expiresInDays } = req.body as {
    label?: string;
    productIds?: string[];
    expiresInDays?: number;
  };

  // If no productIds provided, share all active products
  let idsToShare: string[];
  if (productIds && productIds.length > 0) {
    // Verify all products belong to this seller
    const owned = await prisma.product.findMany({
      where: { id: { in: productIds }, sellerId },
      select: { id: true },
    });
    if (owned.length !== productIds.length) {
      return res.status(400).json({ error: 'Some products not found or not yours' });
    }
    idsToShare = productIds;
  } else {
    const active = await prisma.product.findMany({
      where: { sellerId, isActive: true },
      select: { id: true },
    });
    if (active.length === 0) {
      return res.status(400).json({ error: 'No active products to share' });
    }
    idsToShare = active.map((p) => p.id);
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: { companyName: true } });
  const shareLabel = label || `${seller?.companyName || 'Seller'} — ${idsToShare.length} product${idsToShare.length !== 1 ? 's' : ''}`;

  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

  const share = await prisma.curatedShare.create({
    data: {
      token,
      label: shareLabel,
      productIds: idsToShare,
      expiresAt,
      createdById: sellerId,
    },
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.json({
    share,
    shareUrl: `${frontendUrl}/share/${share.token}`,
  });
});

/**
 * GET /api/my-listings/shares
 * List the seller's share links.
 */
router.get('/shares', async (req: Request, res: Response) => {
  const sellerId = req.user!.id;

  const shares = await prisma.curatedShare.findMany({
    where: { createdById: sellerId },
    orderBy: { createdAt: 'desc' },
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const sharesWithUrl = shares.map((s) => ({
    ...s,
    shareUrl: `${frontendUrl}/share/${s.token}`,
  }));

  res.json({ shares: sharesWithUrl });
});

/**
 * DELETE /api/my-listings/shares/:id
 * Deactivate a seller's share link.
 */
router.delete('/shares/:id', async (req: Request<{ id: string }>, res: Response) => {
  const sellerId = req.user!.id;

  try {
    const share = await prisma.curatedShare.findUnique({ where: { id: req.params.id } });
    if (!share || share.createdById !== sellerId) {
      return res.status(404).json({ error: 'Share not found' });
    }

    await prisma.curatedShare.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json({ message: 'Share link deactivated' });
  } catch {
    res.status(404).json({ error: 'Share not found' });
  }
});

export default router;
