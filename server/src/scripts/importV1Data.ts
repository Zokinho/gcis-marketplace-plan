#!/usr/bin/env npx tsx
/**
 * V1 Data Import: Users + Products from Zoho CRM
 *
 * One-time script to import approved v1 users and active products into the
 * new marketplace database. Uses standalone PrismaClient + zohoRequest()
 * directly — NO Express server, NO notification services, NO ISO matching.
 *
 * Usage:
 *   npx tsx src/scripts/importV1Data.ts [flags]
 *
 * Flags:
 *   --dry-run         Preview only, no DB writes
 *   --skip-files      Skip fetching file URLs from Zoho (Phase 4)
 *   --contacts-only   Import only users (Phase 2), skip products
 *   --products-only   Import only products (Phase 3+4), skip users
 */

import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { fetchAllContacts, fetchAllProducts, fetchProductFileUrls } from './zohoImportHelpers';

// ─── Phase 0: Bootstrap ───

// Load .env from project root (same as server/src/index.ts)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_FILES = args.includes('--skip-files');
const CONTACTS_ONLY = args.includes('--contacts-only');
const PRODUCTS_ONLY = args.includes('--products-only');

const prisma = new PrismaClient();

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function logError(msg: string, err?: any) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] ERROR: ${msg}`, err?.message || '');
}

// ─── Counters ───

const stats = {
  contactsFetched: 0,
  contactsFiltered: 0,
  usersCreated: 0,
  usersUpdated: 0,
  usersSkipped: 0,
  userErrors: 0,
  productsFetched: 0,
  productsFiltered: 0,
  productsCreated: 0,
  productsUpdated: 0,
  productsSkippedNoSeller: 0,
  productErrors: 0,
  filesFetched: 0,
  fileErrors: 0,
  categoriesCreated: 0,
};

// ─── Phase 2: Import Users ───

const sellerCache = new Map<string, string>(); // zohoContactId → local userId

async function importUsers(contacts: any[]): Promise<void> {
  log(`Phase 2: Importing ${contacts.length} approved contacts...`);

  for (const c of contacts) {
    try {
      const email = c.Email?.toLowerCase()?.trim();
      if (!email) {
        stats.usersSkipped++;
        continue;
      }

      const contactType = Array.isArray(c.Contact_Type)
        ? c.Contact_Type.join(';')
        : (c.Contact_Type || null);

      const userData = {
        zohoContactId: c.id,
        email,
        firstName: c.First_Name || null,
        lastName: c.Last_Name || null,
        companyName: c.Company || null,
        title: c.Title || null,
        contactType,
        mailingCountry: c.Mailing_Country || null,
        phone: c.Phone || null,
        approved: true,
        lastSyncedAt: new Date(),
      };

      if (DRY_RUN) {
        log(`  [DRY RUN] Would upsert user: ${email} (zoho: ${c.id}, type: ${contactType})`);
        // Still populate sellerCache for product dry-run
        sellerCache.set(c.id, `dry-run-${c.id}`);
        stats.usersCreated++;
        continue;
      }

      // Look up by zohoContactId first, then by email
      const existingByZoho = await prisma.user.findUnique({
        where: { zohoContactId: c.id },
        select: { id: true, passwordHash: true },
      });

      const existingByEmail = existingByZoho
        ? null
        : await prisma.user.findUnique({
            where: { email },
            select: { id: true, passwordHash: true },
          });

      const existing = existingByZoho || existingByEmail;

      if (existing) {
        // Update — merge fields, never overwrite passwordHash
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            ...userData,
            // Don't overwrite passwordHash if user already has one
            ...(existing.passwordHash ? {} : {}),
          },
        });
        sellerCache.set(c.id, existing.id);
        stats.usersUpdated++;
      } else {
        // Create — no password (users will need to set one via reset flow)
        const newUser = await prisma.user.create({
          data: userData,
        });
        sellerCache.set(c.id, newUser.id);
        stats.usersCreated++;
      }
    } catch (err: any) {
      logError(`Failed to import contact ${c.id} (${c.Email})`, err);
      stats.userErrors++;
    }
  }

  log(`Phase 2 complete: ${stats.usersCreated} created, ${stats.usersUpdated} updated, ${stats.usersSkipped} skipped, ${stats.userErrors} errors`);
}

// ─── Phase 3: Import Products ───

function mapProductFields(p: any) {
  const categories = Array.isArray(p.Categories) ? p.Categories : [];
  const typeValue = categories.length > 0 ? categories[0] : null;
  const certArray = Array.isArray(p.Certification) ? p.Certification : [];
  const certValue = certArray.length > 0 ? certArray.join(', ') : null;

  return {
    name: p.Product_Name || 'Unnamed Product',
    productCode: p.Product_Code || null,
    description: p.Description || null,
    category: p.Product_Category || null,
    type: typeValue,
    isActive: true,
    marketplaceVisible: true,
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

async function resolveSellerFromDb(zohoContactId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { zohoContactId },
    select: { id: true },
  });
  return user?.id || null;
}

async function importProducts(products: any[]): Promise<void> {
  log(`Phase 3: Importing ${products.length} active products...`);

  for (const p of products) {
    try {
      const zohoContactId = p.Contact_Name?.id;

      // Resolve seller: check cache first, then DB
      let sellerId = zohoContactId ? sellerCache.get(zohoContactId) : undefined;
      if (!sellerId && zohoContactId && !DRY_RUN) {
        sellerId = (await resolveSellerFromDb(zohoContactId)) || undefined;
        if (sellerId) sellerCache.set(zohoContactId, sellerId);
      }

      if (!sellerId) {
        stats.productsSkippedNoSeller++;
        if (DRY_RUN) {
          log(`  [DRY RUN] Would SKIP product "${p.Product_Name}" — no seller (Contact_Name.id: ${zohoContactId || 'null'})`);
        }
        continue;
      }

      const fields = mapProductFields(p);

      if (DRY_RUN) {
        log(`  [DRY RUN] Would upsert product: "${p.Product_Name}" (zoho: ${p.id}, seller: ${zohoContactId})`);
        stats.productsCreated++;
        continue;
      }

      const existing = await prisma.product.findUnique({
        where: { zohoProductId: p.id },
        select: { id: true },
      });

      await prisma.product.upsert({
        where: { zohoProductId: p.id },
        update: {
          ...fields,
          sellerId,
        },
        create: {
          zohoProductId: p.id,
          sellerId,
          ...fields,
          imageUrls: [],
          coaUrls: [],
        },
      });

      if (existing) {
        stats.productsUpdated++;
      } else {
        stats.productsCreated++;
      }
    } catch (err: any) {
      logError(`Failed to import product ${p.id} (${p.Product_Name})`, err);
      stats.productErrors++;
    }
  }

  log(`Phase 3 complete: ${stats.productsCreated} created, ${stats.productsUpdated} updated, ${stats.productsSkippedNoSeller} skipped (no seller), ${stats.productErrors} errors`);
}

// ─── Phase 4: Fetch File URLs ───

async function fetchFileUrls(): Promise<void> {
  if (DRY_RUN) {
    log('Phase 4: [DRY RUN] Skipping file URL fetch');
    return;
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, zohoProductId: true, name: true },
  });

  log(`Phase 4: Fetching file URLs for ${products.length} products...`);

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    try {
      const { imageUrls, coaUrls } = await fetchProductFileUrls(product.zohoProductId);

      if (imageUrls.length > 0 || coaUrls.length > 0) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            ...(imageUrls.length > 0 ? { imageUrls } : {}),
            ...(coaUrls.length > 0 ? { coaUrls } : {}),
          },
        });
        stats.filesFetched++;
      }

      // Progress log every 50 products
      if ((i + 1) % 50 === 0) {
        log(`  File URLs: ${i + 1}/${products.length} processed`);
      }

      // Rate limit: 200ms between requests
      await new Promise((r) => setTimeout(r, 200));
    } catch (err: any) {
      logError(`Failed to fetch file URLs for product ${product.zohoProductId} (${product.name})`, err);
      stats.fileErrors++;
    }
  }

  log(`Phase 4 complete: ${stats.filesFetched} products with files, ${stats.fileErrors} errors`);
}

// ─── Phase 5: Finalize ───

async function finalize(): Promise<void> {
  if (DRY_RUN) {
    log('Phase 5: [DRY RUN] Skipping finalization');
    return;
  }

  // Populate Category table from imported products
  const categories = await prisma.product.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ['category'],
  });

  for (const { category } of categories) {
    if (!category) continue;
    try {
      await prisma.category.upsert({
        where: { name: category },
        update: {},
        create: { name: category },
      });
      stats.categoriesCreated++;
    } catch {
      // Ignore duplicates
    }
  }

  // Create SyncLog entry
  await prisma.syncLog.create({
    data: {
      type: 'v1-import',
      status: (stats.userErrors + stats.productErrors) > 0 ? 'partial' : 'success',
      recordCount: stats.usersCreated + stats.usersUpdated + stats.productsCreated + stats.productsUpdated,
      details: stats as any,
    },
  });

  log(`Phase 5 complete: ${stats.categoriesCreated} categories populated, SyncLog entry created`);
}

// ─── Main ───

async function main() {
  log('═══════════════════════════════════════════');
  log('  V1 Data Import: Zoho CRM → Marketplace  ');
  log('═══════════════════════════════════════════');
  log('');

  if (DRY_RUN) log('*** DRY RUN MODE — no database writes ***');
  if (SKIP_FILES) log('*** Skipping file URL fetch (--skip-files) ***');
  if (CONTACTS_ONLY) log('*** Contacts only mode ***');
  if (PRODUCTS_ONLY) log('*** Products only mode ***');
  log('');

  // Validate environment
  const required = ['DATABASE_URL', 'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    logError(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Verify DB connectivity
  if (!DRY_RUN) {
    try {
      await prisma.$connect();
      log('Database connected');
    } catch (err: any) {
      logError('Database connection failed', err);
      process.exit(1);
    }
  }

  const startTime = Date.now();

  // Phase 1: Fetch Zoho data
  log('Phase 1: Fetching data from Zoho CRM...');

  let approvedContacts: any[] = [];
  let activeProducts: any[] = [];

  if (!PRODUCTS_ONLY) {
    const allContacts = await fetchAllContacts();
    stats.contactsFetched = allContacts.length;
    log(`  Fetched ${allContacts.length} total contacts`);

    approvedContacts = allContacts.filter(
      (c) => c.Account_Confirmed === true && c.User_UID,
    );
    stats.contactsFiltered = approvedContacts.length;
    log(`  Filtered to ${approvedContacts.length} approved contacts (Account_Confirmed + User_UID)`);
  }

  if (!CONTACTS_ONLY) {
    const allProducts = await fetchAllProducts();
    stats.productsFetched = allProducts.length;
    log(`  Fetched ${allProducts.length} total products`);

    activeProducts = allProducts.filter((p) => p.Product_Active === true);
    stats.productsFiltered = activeProducts.length;
    log(`  Filtered to ${activeProducts.length} active products (Product_Active = true)`);
  }

  log('');

  // Phase 2: Import users
  if (!PRODUCTS_ONLY) {
    await importUsers(approvedContacts);
    log('');
  }

  // Phase 3: Import products
  if (!CONTACTS_ONLY) {
    await importProducts(activeProducts);
    log('');

    // Phase 4: File URLs
    if (!SKIP_FILES) {
      await fetchFileUrls();
      log('');
    }
  }

  // Phase 5: Finalize
  await finalize();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  log('');
  log('═══════════════════════════════════════════');
  log('  Import Summary');
  log('═══════════════════════════════════════════');
  log(`  Duration:           ${elapsed}s`);
  log(`  Contacts fetched:   ${stats.contactsFetched} (${stats.contactsFiltered} approved)`);
  log(`  Users created:      ${stats.usersCreated}`);
  log(`  Users updated:      ${stats.usersUpdated}`);
  log(`  User errors:        ${stats.userErrors}`);
  log(`  Products fetched:   ${stats.productsFetched} (${stats.productsFiltered} active)`);
  log(`  Products created:   ${stats.productsCreated}`);
  log(`  Products updated:   ${stats.productsUpdated}`);
  log(`  Products no seller: ${stats.productsSkippedNoSeller}`);
  log(`  Product errors:     ${stats.productErrors}`);
  log(`  Files fetched:      ${stats.filesFetched}`);
  log(`  File errors:        ${stats.fileErrors}`);
  log(`  Categories:         ${stats.categoriesCreated}`);
  log(`  Notifications sent: 0 (by design)`);
  log('═══════════════════════════════════════════');

  if (stats.userErrors + stats.productErrors > 0) {
    log('');
    log('WARNING: Some records failed. Re-run the script (it is idempotent) to retry.');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  logError('Import failed', err);
  await prisma.$disconnect();
  process.exit(1);
});
