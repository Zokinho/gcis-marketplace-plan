/**
 * Seed script — populates the marketplace with demo products.
 *
 * Strategy:
 *   1. Try to fetch real products from Zoho CRM (read-only GET — does NOT modify Zoho)
 *   2. If Zoho fails, insert realistic Canadian cannabis demo products
 *
 * Usage:  npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

// ─── Zoho fetch (read-only) ───

async function getZohoToken(): Promise<string> {
  const res = await axios.post(
    `${process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zohocloud.ca'}/oauth/v2/token`,
    null,
    {
      params: {
        grant_type: 'refresh_token',
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      },
    },
  );
  if (res.data.error) throw new Error(res.data.error);
  return res.data.access_token;
}

async function fetchZohoProducts(token: string): Promise<any[]> {
  const apiUrl = process.env.ZOHO_API_URL || 'https://www.zohoapis.ca/crm/v7';
  const fields = [
    'Product_Name', 'Product_Code', 'Description', 'Product_Category', 'Categories',
    'Product_Active', 'Request_pending', 'Min_Request_G_Including_5_markup', 'Min_QTY_Request',
    'Grams_Available_When_submitted', 'Upcoming_QTY_3_Months', 'THC_as_is', 'THC_max',
    'CBD_as_is', 'CBD_max', 'Certification', 'Harvest_Date', 'Manufacturer_name',
    'Lineage', 'Growth_Medium', 'Terpen', 'Highest_Terpenes', 'Aromas',
    'cm_Popcorn', 'cm_Small', 'cm_Medium', 'cm_Large', 'cm_X_Large', 'Contact_Name',
  ].join(',');

  const all: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await axios.get(`${apiUrl}/Products`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      params: { fields, page, per_page: 200 },
    });
    const data = res.data?.data || [];
    all.push(...data);
    hasMore = res.data?.info?.more_records ?? false;
    page++;
  }

  return all;
}

function mapZohoProduct(p: any) {
  const categories = Array.isArray(p.Categories) ? p.Categories : [];
  const certArray = Array.isArray(p.Certification) ? p.Certification : [];

  return {
    zohoProductId: p.id,
    name: p.Product_Name || 'Unnamed Product',
    productCode: p.Product_Code || null,
    description: p.Description || null,
    category: p.Product_Category || null,
    type: categories.length > 0 ? categories[0] : null,
    isActive: true, // Force active for demo
    requestPending: false,
    pricePerUnit: p.Min_Request_G_Including_5_markup != null ? Number(p.Min_Request_G_Including_5_markup) : null,
    minQtyRequest: p.Min_QTY_Request != null ? Number(p.Min_QTY_Request) : null,
    gramsAvailable: p.Grams_Available_When_submitted != null ? Number(p.Grams_Available_When_submitted) : null,
    upcomingQty: p.Upcoming_QTY_3_Months != null ? Number(p.Upcoming_QTY_3_Months) : null,
    thcMin: p.THC_as_is != null ? Number(p.THC_as_is) : null,
    thcMax: p.THC_max != null ? Number(p.THC_max) : null,
    cbdMin: p.CBD_as_is != null ? Number(p.CBD_as_is) : null,
    cbdMax: p.CBD_max != null ? Number(p.CBD_max) : null,
    certification: certArray.length > 0 ? certArray.join(', ') : null,
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
    source: 'zoho' as const,
    lastSyncedAt: new Date(),
  };
}

// ─── Fallback demo products ───

const DEMO_PRODUCTS = [
  {
    name: 'Pink Kush', type: 'Indica', category: 'Dried Flower', certification: 'GMP1',
    licensedProducer: 'Aurora Cannabis', lineage: 'OG Kush phenotype',
    thcMin: 19, thcMax: 24, cbdMin: 0.1, cbdMax: 0.3, pricePerUnit: 3.20,
    gramsAvailable: 45000, upcomingQty: 20000, minQtyRequest: 5000,
    dominantTerpene: 'Myrcene, Limonene, Caryophyllene',
    aromas: 'Sweet vanilla, floral, earthy undertones',
    budSizePopcorn: 5, budSizeSmall: 15, budSizeMedium: 35, budSizeLarge: 35, budSizeXLarge: 10,
    description: 'Premium Pink Kush with high THC content. Dense, frosty buds with sweet vanilla aroma. Popular indica strain known for potent relaxation.',
  },
  {
    name: 'Blue Dream', type: 'Hybrid', category: 'Dried Flower', certification: 'GACP',
    licensedProducer: 'Canopy Growth', lineage: 'Blueberry × Haze',
    thcMin: 17, thcMax: 21, cbdMin: 0.1, cbdMax: 0.2, pricePerUnit: 2.85,
    gramsAvailable: 60000, upcomingQty: 30000, minQtyRequest: 5000,
    dominantTerpene: 'Myrcene, Pinene, Caryophyllene',
    aromas: 'Sweet berry, herbal, hints of citrus',
    budSizePopcorn: 8, budSizeSmall: 20, budSizeMedium: 30, budSizeLarge: 30, budSizeXLarge: 12,
    description: 'Classic Blue Dream hybrid. Balanced cerebral and body effects. Sweet berry aroma with herbal undertones.',
  },
  {
    name: 'Jean Guy', type: 'Sativa', category: 'Dried Flower', certification: 'GMP2',
    licensedProducer: 'HEXO Corp', lineage: 'White Widow phenotype',
    thcMin: 18, thcMax: 23, cbdMin: 0.05, cbdMax: 0.15, pricePerUnit: 3.10,
    gramsAvailable: 25000, upcomingQty: 15000, minQtyRequest: 3000,
    dominantTerpene: 'Terpinolene, Pinene, Ocimene',
    aromas: 'Pine, citrus, spicy pepper',
    budSizePopcorn: 3, budSizeSmall: 12, budSizeMedium: 40, budSizeLarge: 35, budSizeXLarge: 10,
    description: 'Quebec-bred Jean Guy sativa. Uplifting and energizing. Distinct pine and citrus terpene profile.',
  },
  {
    name: 'Sensi Star', type: 'Indica', category: 'Dried Flower', certification: 'GMP1',
    licensedProducer: 'Tilray', lineage: 'Unknown indica heritage',
    thcMin: 20, thcMax: 26, cbdMin: 0.1, cbdMax: 0.4, pricePerUnit: 3.75,
    gramsAvailable: 18000, upcomingQty: 10000, minQtyRequest: 2000,
    dominantTerpene: 'Myrcene, Linalool, Caryophyllene',
    aromas: 'Earthy, spicy, subtle citrus',
    budSizePopcorn: 2, budSizeSmall: 10, budSizeMedium: 30, budSizeLarge: 40, budSizeXLarge: 18,
    description: 'Award-winning Sensi Star with exceptionally high THC. Dense crystalline buds. Deep relaxation effects.',
  },
  {
    name: 'Tangerine Dream', type: 'Sativa', category: 'Dried Flower', certification: 'GACP',
    licensedProducer: 'Organigram', lineage: 'G13 × Afghan × Neville\'s A5 Haze',
    thcMin: 15, thcMax: 19, cbdMin: 0.1, cbdMax: 0.2, pricePerUnit: 2.65,
    gramsAvailable: 35000, upcomingQty: 25000, minQtyRequest: 5000,
    dominantTerpene: 'Limonene, Myrcene, Terpinolene',
    aromas: 'Tangerine, citrus, tropical fruit',
    budSizePopcorn: 6, budSizeSmall: 18, budSizeMedium: 35, budSizeLarge: 30, budSizeXLarge: 11,
    description: 'Bright and citrusy Tangerine Dream. Moderate THC with uplifting effects. Excellent daytime strain.',
  },
  {
    name: 'CBD Shark Shock', type: 'Indica', category: 'Dried Flower', certification: 'GMP1',
    licensedProducer: 'Aphria', lineage: 'Shark Shock × CBD-rich cultivar',
    thcMin: 5, thcMax: 8, cbdMin: 8, cbdMax: 12, pricePerUnit: 2.90,
    gramsAvailable: 22000, upcomingQty: 12000, minQtyRequest: 3000,
    dominantTerpene: 'Myrcene, Caryophyllene, Pinene',
    aromas: 'Earthy, woody, mild sweetness',
    budSizePopcorn: 10, budSizeSmall: 25, budSizeMedium: 35, budSizeLarge: 25, budSizeXLarge: 5,
    description: 'High-CBD medical strain with balanced cannabinoid ratio. Mild psychoactive effects with strong therapeutic potential.',
  },
  {
    name: 'Ghost Train Haze', type: 'Sativa', category: 'Dried Flower', certification: 'GPP',
    licensedProducer: 'CannTrust', lineage: 'Ghost OG × Neville\'s Wreck',
    thcMin: 22, thcMax: 28, cbdMin: 0.05, cbdMax: 0.1, pricePerUnit: 4.10,
    gramsAvailable: 12000, upcomingQty: 8000, minQtyRequest: 2000,
    dominantTerpene: 'Terpinolene, Myrcene, Limonene',
    aromas: 'Citrus, pine, floral, sour',
    budSizePopcorn: 4, budSizeSmall: 10, budSizeMedium: 25, budSizeLarge: 38, budSizeXLarge: 23,
    description: 'Ultra-potent Ghost Train Haze. One of the strongest sativas available. Intense cerebral effects.',
  },
  {
    name: 'Wedding Cake', type: 'Hybrid', category: 'Dried Flower', certification: 'GMP1',
    licensedProducer: 'Cronos Group', lineage: 'Triangle Kush × Animal Mints',
    thcMin: 20, thcMax: 25, cbdMin: 0.1, cbdMax: 0.3, pricePerUnit: 3.50,
    gramsAvailable: 28000, upcomingQty: 18000, minQtyRequest: 3000,
    dominantTerpene: 'Limonene, Caryophyllene, Linalool',
    aromas: 'Sweet, vanilla, tangy, earthy',
    budSizePopcorn: 3, budSizeSmall: 12, budSizeMedium: 32, budSizeLarge: 38, budSizeXLarge: 15,
    description: 'Dessert-flavoured Wedding Cake hybrid. Rich terpene profile with creamy vanilla notes. Euphoric and relaxing.',
  },
  {
    name: 'Durban Poison', type: 'Sativa', category: 'Dried Flower', certification: 'GACP',
    licensedProducer: 'Village Farms', lineage: 'South African landrace sativa',
    thcMin: 16, thcMax: 20, cbdMin: 0.02, cbdMax: 0.1, pricePerUnit: 2.50,
    gramsAvailable: 50000, upcomingQty: 35000, minQtyRequest: 5000,
    dominantTerpene: 'Terpinolene, Myrcene, Ocimene',
    aromas: 'Sweet, anise, earthy, pine',
    budSizePopcorn: 7, budSizeSmall: 20, budSizeMedium: 38, budSizeLarge: 28, budSizeXLarge: 7,
    description: 'Pure South African landrace sativa. Energizing and creative effects. Sweet anise aroma profile.',
  },
  {
    name: 'Northern Lights', type: 'Indica', category: 'Dried Flower', certification: 'GMP2',
    licensedProducer: 'Aurora Cannabis', lineage: 'Afghani × Thai',
    thcMin: 16, thcMax: 21, cbdMin: 0.1, cbdMax: 0.3, pricePerUnit: 2.75,
    gramsAvailable: 40000, upcomingQty: 22000, minQtyRequest: 5000,
    dominantTerpene: 'Myrcene, Caryophyllene, Pinene',
    aromas: 'Sweet, spicy, earthy, pine',
    budSizePopcorn: 5, budSizeSmall: 15, budSizeMedium: 35, budSizeLarge: 32, budSizeXLarge: 13,
    description: 'Legendary Northern Lights indica. Resinous buds with sweet pine aroma. Known for deep, full-body relaxation.',
  },
  {
    name: 'Cannatonic', type: 'Hybrid', category: 'Dried Flower', certification: 'GMP1',
    licensedProducer: 'Tilray', lineage: 'MK Ultra × G13 Haze',
    thcMin: 4, thcMax: 7, cbdMin: 10, cbdMax: 15, pricePerUnit: 3.30,
    gramsAvailable: 15000, upcomingQty: 10000, minQtyRequest: 2000,
    dominantTerpene: 'Myrcene, Pinene, Caryophyllene',
    aromas: 'Earthy, woody, mild citrus',
    budSizePopcorn: 8, budSizeSmall: 22, budSizeMedium: 38, budSizeLarge: 25, budSizeXLarge: 7,
    description: 'High-CBD Cannatonic for medical applications. Near 1:2 THC:CBD ratio. Gentle, clear-headed effects.',
  },
  {
    name: 'Jack Herer', type: 'Sativa', category: 'Dried Flower', certification: 'GACP',
    licensedProducer: 'HEXO Corp', lineage: 'Haze × Northern Lights #5 × Shiva Skunk',
    thcMin: 18, thcMax: 23, cbdMin: 0.03, cbdMax: 0.1, pricePerUnit: 3.00,
    gramsAvailable: 32000, upcomingQty: 20000, minQtyRequest: 3000,
    dominantTerpene: 'Terpinolene, Pinene, Myrcene',
    aromas: 'Pine, woody, spicy, herbal',
    budSizePopcorn: 4, budSizeSmall: 14, budSizeMedium: 34, budSizeLarge: 34, budSizeXLarge: 14,
    description: 'Classic Jack Herer sativa named after the cannabis activist. Blissful, creative, and focused effects.',
  },
  {
    name: 'Gorilla Glue #4', type: 'Hybrid', category: 'Dried Flower', certification: 'GMP1',
    licensedProducer: 'Canopy Growth', lineage: 'Chem\'s Sister × Sour Dubb × Chocolate Diesel',
    thcMin: 23, thcMax: 29, cbdMin: 0.05, cbdMax: 0.1, pricePerUnit: 4.25,
    gramsAvailable: 10000, upcomingQty: 6000, minQtyRequest: 2000,
    dominantTerpene: 'Caryophyllene, Myrcene, Limonene',
    aromas: 'Pine, earthy, pungent, diesel',
    budSizePopcorn: 2, budSizeSmall: 8, budSizeMedium: 25, budSizeLarge: 40, budSizeXLarge: 25,
    description: 'Extremely potent GG#4 hybrid. Sticky, resin-coated buds. Heavy-hitting euphoria and relaxation.',
  },
  {
    name: 'Harlequin', type: 'Sativa', category: 'Dried Flower', certification: 'GPP',
    licensedProducer: 'Aphria', lineage: 'Colombian Gold × Thai × Swiss Landrace',
    thcMin: 4, thcMax: 7, cbdMin: 8, cbdMax: 14, pricePerUnit: 3.15,
    gramsAvailable: 20000, upcomingQty: 14000, minQtyRequest: 3000,
    dominantTerpene: 'Myrcene, Pinene, Caryophyllene',
    aromas: 'Earthy, mango, musky',
    budSizePopcorn: 6, budSizeSmall: 20, budSizeMedium: 40, budSizeLarge: 28, budSizeXLarge: 6,
    description: 'CBD-dominant Harlequin sativa. 2:1 CBD:THC ratio. Ideal for medical patients seeking relief without strong psychoactivity.',
  },
  {
    name: 'Gelato', type: 'Hybrid', category: 'Dried Flower', certification: 'GMP2',
    licensedProducer: 'Organigram', lineage: 'Sunset Sherbet × Thin Mint GSC',
    thcMin: 20, thcMax: 25, cbdMin: 0.1, cbdMax: 0.2, pricePerUnit: 3.65,
    gramsAvailable: 22000, upcomingQty: 15000, minQtyRequest: 3000,
    dominantTerpene: 'Limonene, Caryophyllene, Humulene',
    aromas: 'Sweet, citrus, berry, lavender',
    budSizePopcorn: 3, budSizeSmall: 10, budSizeMedium: 30, budSizeLarge: 38, budSizeXLarge: 19,
    description: 'Dessert-quality Gelato hybrid. Dense purple-hued buds. Sweet citrus and berry flavor profile with potent balanced effects.',
  },
  {
    name: 'ACDC', type: 'Hybrid', category: 'Dried Flower', certification: 'GMP1',
    licensedProducer: 'Cronos Group', lineage: 'Cannatonic phenotype',
    thcMin: 1, thcMax: 3, cbdMin: 14, cbdMax: 20, pricePerUnit: 3.40,
    gramsAvailable: 12000, upcomingQty: 8000, minQtyRequest: 2000,
    dominantTerpene: 'Myrcene, Pinene, Caryophyllene',
    aromas: 'Earthy, sweet, woody, cherry',
    budSizePopcorn: 10, budSizeSmall: 25, budSizeMedium: 35, budSizeLarge: 22, budSizeXLarge: 8,
    description: 'Ultra-high CBD ACDC strain. Near-zero psychoactive effects. Top choice for epilepsy, anxiety, and pain management.',
  },
];

// ─── Main ───

async function main() {
  console.log('🌱 Starting seed...\n');

  // Find existing seller to link products to
  const seller = await prisma.user.findFirst({
    where: { contactType: { contains: 'Seller' } },
  });

  if (!seller) {
    console.error('❌ No seller user found in database. Please sign in first.');
    process.exit(1);
  }

  console.log(`📦 Using seller: ${seller.firstName} ${seller.lastName} (${seller.email})\n`);

  // Try Zoho first
  let zohoProducts: any[] = [];
  try {
    console.log('🔗 Attempting to fetch products from Zoho CRM (read-only)...');
    const token = await getZohoToken();
    zohoProducts = await fetchZohoProducts(token);
    console.log(`✅ Fetched ${zohoProducts.length} products from Zoho\n`);
  } catch (err: any) {
    console.log(`⚠️  Zoho fetch failed: ${err.message}`);
    console.log('📋 Falling back to demo products\n');
  }

  let seeded = 0;
  let skipped = 0;

  if (zohoProducts.length > 0) {
    // Insert Zoho products
    for (const zp of zohoProducts) {
      const mapped = mapZohoProduct(zp);
      try {
        await prisma.product.upsert({
          where: { zohoProductId: mapped.zohoProductId },
          update: { ...mapped, sellerId: seller.id },
          create: { ...mapped, sellerId: seller.id },
        });
        seeded++;
        console.log(`  ✓ ${mapped.name}`);
      } catch (err: any) {
        skipped++;
        console.log(`  ✗ ${mapped.name}: ${err.message.slice(0, 80)}`);
      }
    }
  }

  // Always add demo products to fill out the catalog
  console.log('\n📋 Adding demo products...');
  for (let i = 0; i < DEMO_PRODUCTS.length; i++) {
    const dp = DEMO_PRODUCTS[i];
    const zohoId = `demo_seed_${i + 1}`;

    try {
      await prisma.product.upsert({
        where: { zohoProductId: zohoId },
        update: {
          ...dp,
          isActive: true,
          requestPending: false,
          source: 'manual',
          sellerId: seller.id,
        },
        create: {
          zohoProductId: zohoId,
          ...dp,
          isActive: true,
          requestPending: false,
          source: 'manual',
          sellerId: seller.id,
          imageUrls: [],
          coaUrls: [],
        },
      });
      seeded++;
      console.log(`  ✓ ${dp.name}`);
    } catch (err: any) {
      skipped++;
      console.log(`  ✗ ${dp.name}: ${err.message.slice(0, 80)}`);
    }
  }

  // Also activate any existing inactive products
  const activated = await prisma.product.updateMany({
    where: { isActive: false },
    data: { isActive: true },
  });

  console.log(`\n✅ Seed complete: ${seeded} seeded, ${skipped} skipped, ${activated.count} activated`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
