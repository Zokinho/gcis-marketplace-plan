import cron from 'node-cron';
import { prisma } from '../index';
import {
  fetchAllProducts,
  fetchMarketplaceContacts,
  fetchProductsModifiedSince,
  fetchProductFileUrls,
  fetchDeletedProductIds,
} from './zohoApi';

// ─── Seller resolution cache ───

const sellerCache = new Map<string, string>(); // zohoContactId → local userId

/**
 * Resolve a Zoho Contact_Name.id to a local User ID.
 * Creates a placeholder user if the seller doesn't exist locally yet.
 */
async function resolveSellerByZohoId(zohoContactId: string | undefined): Promise<string | null> {
  if (!zohoContactId) return null;

  // Check cache first
  const cached = sellerCache.get(zohoContactId);
  if (cached) return cached;

  // Look up in local DB
  const user = await prisma.user.findUnique({
    where: { zohoContactId },
    select: { id: true },
  });

  if (user) {
    sellerCache.set(zohoContactId, user.id);
    return user.id;
  }

  // Seller not in local DB yet — will be linked once they sign up.
  // Return null; these products will be re-linked on next sync after the seller signs up.
  return null;
}

// ─── Product Sync ───

/**
 * Map a Zoho product record to Prisma upsert data.
 */
function mapProductFields(p: any) {
  // Categories is a multiselectpicklist — extract first value as type
  const categories = Array.isArray(p.Categories) ? p.Categories : [];
  const typeValue = categories.length > 0 ? categories[0] : null;
  // Certification is a multiselectpicklist — join as comma-separated string
  const certArray = Array.isArray(p.Certification) ? p.Certification : [];
  const certValue = certArray.length > 0 ? certArray.join(', ') : null;

  return {
    name: p.Product_Name || 'Unnamed Product',
    productCode: p.Product_Code || null,
    description: p.Description || null,
    category: p.Product_Category || null,
    type: typeValue,
    isActive: p.Product_Active ?? false,
    requestPending: p.Request_pending ?? false,
    pricePerUnit: p.Min_Request_G_Including_5_markup != null ? Number(p.Min_Request_G_Including_5_markup) : null,
    minQtyRequest: p.Min_QTY_Request != null ? Number(p.Min_QTY_Request) : null,
    gramsAvailable: p.Grams_Available_When_submitted != null ? Number(p.Grams_Available_When_submitted) : null,
    upcomingQty: p.Upcoming_QTY_3_Months != null ? Number(p.Upcoming_QTY_3_Months) : null,
    thcMin: p.THC_as_is != null ? Number(p.THC_as_is) : null,
    thcMax: p.THC_max != null ? Number(p.THC_max) : null,
    cbdMin: p.CBD_as_is != null ? Number(p.CBD_as_is) : null,
    cbdMax: p.CBD_max != null ? Number(p.CBD_max) : null,
    certification: certValue,
    harvestDate: p.Harvest_Date ? new Date(p.Harvest_Date) : null,
    licensedProducer: p.Manufacturer_name || null,
    lineage: p.Lineage || null,
    growthMedium: p.Growth_Medium || null,
    dominantTerpene: p.Terpen || null,
    highestTerpenes: p.Highest_Terpenes || null,
    aromas: p.Aromas || null,
    budSizePopcorn: p.cm_Popcorn != null ? Number(p.cm_Popcorn) : null,
    budSizeSmall: p.cm_Small != null ? Number(p.cm_Small) : null,
    budSizeMedium: p.cm_Medium != null ? Number(p.cm_Medium) : null,
    budSizeLarge: p.cm_Large != null ? Number(p.cm_Large) : null,
    budSizeXLarge: p.cm_X_Large != null ? Number(p.cm_X_Large) : null,
    lastSyncedAt: new Date(),
  };
}

export async function syncProducts(): Promise<{ synced: number; skipped: number; errors: number }> {
  console.log('[SYNC] Starting product sync...');
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const products = await fetchAllProducts();

    for (const p of products) {
      try {
        const sellerId = await resolveSellerByZohoId(p.Contact_Name?.id);

        if (!sellerId) {
          // Can't link to a local seller — skip but don't fail
          skipped++;
          continue;
        }

        const fields = mapProductFields(p);

        // Fetch image/CoA file URLs from Zoho
        let fileUrls = { imageUrls: [] as string[], coaUrls: [] as string[] };
        try {
          fileUrls = await fetchProductFileUrls(p.id);
        } catch (err) {
          console.error(`[SYNC] Failed to fetch file URLs for product ${p.id}:`, err);
        }

        await prisma.product.upsert({
          where: { zohoProductId: p.id },
          update: {
            ...fields,
            ...(fileUrls.imageUrls.length > 0 ? { imageUrls: fileUrls.imageUrls } : {}),
            ...(fileUrls.coaUrls.length > 0 ? { coaUrls: fileUrls.coaUrls } : {}),
          },
          create: {
            zohoProductId: p.id,
            sellerId,
            ...fields,
            imageUrls: fileUrls.imageUrls,
            coaUrls: fileUrls.coaUrls,
          },
        });
        synced++;
      } catch (err) {
        console.error(`[SYNC] Error syncing product ${p.id} (${p.Product_Name}):`, err);
        errors++;
      }
    }

    // Deactivate products that were removed or deactivated in Zoho
    const activeZohoIds = products.map((p: any) => p.id);
    if (activeZohoIds.length > 0) {
      await prisma.product.updateMany({
        where: {
          zohoProductId: { notIn: activeZohoIds },
          isActive: true,
        },
        data: { isActive: false, lastSyncedAt: new Date() },
      });
    }

    await prisma.syncLog.create({
      data: {
        type: 'products',
        status: errors > 0 ? 'partial' : 'success',
        recordCount: synced,
        details: { synced, skipped, errors, total: products.length },
      },
    });

    console.log(`[SYNC] Products complete: ${synced} synced, ${skipped} skipped, ${errors} errors`);
  } catch (err: any) {
    console.error('[SYNC] Product sync failed:', err?.message);
    await prisma.syncLog.create({
      data: {
        type: 'products',
        status: 'error',
        details: { error: err?.message || 'Unknown error' },
      },
    });
  }

  return { synced, skipped, errors };
}

// ─── Delta Product Sync ───

/**
 * Sync only products modified since last successful sync.
 * Falls back to full sync if no previous sync or on error.
 */
export async function syncProductsDelta(): Promise<{ synced: number; skipped: number; errors: number; mode: string }> {
  console.log('[SYNC] Starting delta product sync...');

  // Find last successful product sync timestamp
  const lastSync = await prisma.syncLog.findFirst({
    where: { type: { in: ['products', 'products-delta'] }, status: { in: ['success', 'partial'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastSync) {
    console.log('[SYNC] No previous sync found, falling back to full sync');
    const result = await syncProducts();
    return { ...result, mode: 'full-fallback' };
  }

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const products = await fetchProductsModifiedSince(lastSync.createdAt);

    if (products.length === 0) {
      console.log('[SYNC] Delta sync: no modified products');
      await prisma.syncLog.create({
        data: {
          type: 'products-delta',
          status: 'success',
          recordCount: 0,
          details: { synced: 0, skipped: 0, errors: 0, mode: 'delta', since: lastSync.createdAt.toISOString() },
        },
      });
      return { synced: 0, skipped: 0, errors: 0, mode: 'delta' };
    }

    for (const p of products) {
      try {
        const sellerId = await resolveSellerByZohoId(p.Contact_Name?.id);
        if (!sellerId) { skipped++; continue; }

        const fields = mapProductFields(p);

        let fileUrls = { imageUrls: [] as string[], coaUrls: [] as string[] };
        try {
          fileUrls = await fetchProductFileUrls(p.id);
        } catch (err) {
          console.error(`[SYNC] Failed to fetch file URLs for product ${p.id}:`, err);
        }

        await prisma.product.upsert({
          where: { zohoProductId: p.id },
          update: {
            ...fields,
            ...(fileUrls.imageUrls.length > 0 ? { imageUrls: fileUrls.imageUrls } : {}),
            ...(fileUrls.coaUrls.length > 0 ? { coaUrls: fileUrls.coaUrls } : {}),
          },
          create: {
            zohoProductId: p.id,
            sellerId,
            ...fields,
            imageUrls: fileUrls.imageUrls,
            coaUrls: fileUrls.coaUrls,
          },
        });
        synced++;
      } catch (err) {
        console.error(`[SYNC] Error syncing product ${p.id} (${p.Product_Name}):`, err);
        errors++;
      }
    }

    // Remove products deleted from Zoho since last sync
    let removed = 0;
    try {
      const deletedIds = await fetchDeletedProductIds(lastSync.createdAt);
      if (deletedIds.length > 0) {
        // Only delete products that have no bids (preserve history)
        const productsWithBids = await prisma.bid.findMany({
          where: { product: { zohoProductId: { in: deletedIds } } },
          select: { productId: true },
          distinct: ['productId'],
        });
        const productIdsWithBids = new Set(productsWithBids.map(b => b.productId));

        // Products with bids: just deactivate
        if (productIdsWithBids.size > 0) {
          await prisma.product.updateMany({
            where: { id: { in: [...productIdsWithBids] } },
            data: { isActive: false, lastSyncedAt: new Date() },
          });
        }

        // Products without bids: delete entirely
        const result = await prisma.product.deleteMany({
          where: {
            zohoProductId: { in: deletedIds },
            id: { notIn: [...productIdsWithBids] },
          },
        });
        removed = result.count;
        if (removed > 0) {
          console.log(`[SYNC] Removed ${removed} products deleted from Zoho`);
        }
        if (productIdsWithBids.size > 0) {
          console.log(`[SYNC] Deactivated ${productIdsWithBids.size} deleted products (have bids, preserving history)`);
        }
      }
    } catch (err: any) {
      console.error('[SYNC] Deleted products check failed (non-critical):', err?.message);
    }

    await prisma.syncLog.create({
      data: {
        type: 'products-delta',
        status: errors > 0 ? 'partial' : 'success',
        recordCount: synced,
        details: { synced, skipped, errors, removed, total: products.length, mode: 'delta', since: lastSync.createdAt.toISOString() },
      },
    });

    console.log(`[SYNC] Delta sync complete: ${synced} synced, ${skipped} skipped, ${errors} errors, ${removed} removed`);
  } catch (err: any) {
    console.error('[SYNC] Delta sync failed, falling back to full sync:', err?.message);
    const result = await syncProducts();
    return { ...result, mode: 'full-fallback' };
  }

  return { synced, skipped, errors, mode: 'delta' };
}

// ─── Contact Sync ───

export async function syncContacts(): Promise<{ synced: number; errors: number }> {
  console.log('[SYNC] Starting contact sync...');
  let synced = 0;
  let errors = 0;

  try {
    const contacts = await fetchMarketplaceContacts();

    for (const c of contacts) {
      try {
        const clerkUserId = c.User_UID;
        if (!clerkUserId) continue;

        // Find the local user by Clerk ID or Zoho Contact ID
        const existingUser = await prisma.user.findFirst({
          where: {
            OR: [
              { clerkUserId },
              { zohoContactId: c.id },
            ],
          },
        });

        if (!existingUser) continue; // Not a marketplace user yet

        // Update approval status, contact type, and profile fields from Zoho
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            approved: c.Account_Confirmed ?? existingUser.approved,
            contactType: c.Contact_Type || existingUser.contactType,
            firstName: c.First_Name || existingUser.firstName,
            lastName: c.Last_Name || existingUser.lastName,
            companyName: c.Company || existingUser.companyName,
            title: c.Title || existingUser.title,
            mailingCountry: c.Mailing_Country || existingUser.mailingCountry,
            phone: c.Phone || existingUser.phone,
            zohoContactId: c.id, // Ensure link is set
            lastSyncedAt: new Date(),
          },
        });
        synced++;
      } catch (err) {
        console.error(`[SYNC] Error syncing contact ${c.id} (${c.Email}):`, err);
        errors++;
      }
    }

    await prisma.syncLog.create({
      data: {
        type: 'contacts',
        status: errors > 0 ? 'partial' : 'success',
        recordCount: synced,
        details: { synced, errors, total: contacts.length },
      },
    });

    console.log(`[SYNC] Contacts complete: ${synced} synced, ${errors} errors`);
  } catch (err: any) {
    console.error('[SYNC] Contact sync failed:', err?.message);
    await prisma.syncLog.create({
      data: {
        type: 'contacts',
        status: 'error',
        details: { error: err?.message || 'Unknown error' },
      },
    });
  }

  return { synced, errors };
}

// ─── Full sync (both products + contacts) ───

export async function runFullSync() {
  const start = Date.now();
  console.log('[SYNC] ─── Full sync starting ───');

  const productResult = await syncProducts();
  const contactResult = await syncContacts();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[SYNC] ─── Full sync complete in ${elapsed}s ───`);

  return { products: productResult, contacts: contactResult, durationSeconds: Number(elapsed) };
}

// ─── Cron scheduler ───

let cronJob: cron.ScheduledTask | null = null;

export function startSyncCron() {
  if (cronJob) return;

  // Every 15 minutes — delta sync for products + full contacts
  cronJob = cron.schedule('*/15 * * * *', async () => {
    try {
      const start = Date.now();
      console.log('[SYNC] ─── Cron sync starting (delta products + contacts) ───');

      const productResult = await syncProductsDelta();
      const contactResult = await syncContacts();

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[SYNC] ─── Cron sync complete in ${elapsed}s (mode: ${productResult.mode}) ───`);
    } catch (err) {
      console.error('[SYNC] Cron sync error:', err);
    }
  });

  console.log('[SYNC] Cron scheduled: every 15 minutes (delta sync)');
}

export function stopSyncCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('[SYNC] Cron stopped');
  }
}
