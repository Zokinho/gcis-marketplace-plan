import { zohoRequest } from './zohoAuth';
import { prisma } from '../index';
import { calculateProximity } from '../utils/proximity';

// ─── Product field list for sync ───

const PRODUCT_FIELDS = [
  'Product_Name', 'Product_Code', 'Description', 'Product_Category', 'Type',
  'Product_Active', 'Request_pending', 'Unit_Price', 'Min_QTY_Request',
  'Grams_Available', 'Upcoming_QTY', 'THC_min', 'THC_max', 'CBD_min', 'CBD_max',
  'Certification', 'Harvest_Date', 'Licensed_Producer', 'Lineage', 'Growth_Medium',
  'Terpen', 'Highest_Terpenes', 'Aromas',
  'X0_1_cm_Popcorn', 'X1_2_cm_Small', 'X2_3_cm_Medium', 'X3_5_cm_Large', 'X5_cm_X_Large',
  'Contact_Name',
].join(',');

const CONTACT_FIELDS = [
  'First_Name', 'Last_Name', 'Email', 'Company', 'Title', 'Contact_Type',
  'Account_Confirmed', 'Mailing_Country', 'Phone', 'User_UID',
].join(',');

// ─── Read helpers ───

/**
 * Fetch products from Zoho CRM (paginated).
 * Returns all active products across all pages.
 */
export async function fetchAllProducts(): Promise<any[]> {
  const allProducts: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await zohoRequest('GET', '/Products', {
        params: {
          fields: PRODUCT_FIELDS,
          page,
          per_page: 200,
        },
      });

      const products = response?.data || [];
      allProducts.push(...products);
      hasMore = response?.info?.more_records || false;
      page++;
    } catch (err: any) {
      // 204 = no records
      if (err?.response?.status === 204) break;
      throw err;
    }
  }

  return allProducts;
}

/**
 * Fetch all contacts from Zoho CRM that have a User_UID (marketplace users).
 */
export async function fetchMarketplaceContacts(): Promise<any[]> {
  const allContacts: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await zohoRequest('GET', '/Contacts/search', {
        params: {
          criteria: '(User_UID:is_not_empty:true)',
          fields: CONTACT_FIELDS,
          page,
          per_page: 200,
        },
      });

      const contacts = response?.data || [];
      allContacts.push(...contacts);
      hasMore = response?.info?.more_records || false;
      page++;
    } catch (err: any) {
      if (err?.response?.status === 204) break;
      throw err;
    }
  }

  return allContacts;
}

// ─── Write helpers ───

/**
 * Push seller-editable product fields back to Zoho.
 */
export async function pushProductUpdate(
  productId: string,
  updates: { pricePerUnit?: number; gramsAvailable?: number; upcomingQty?: number },
) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error(`Product ${productId} not found`);

  // Update local DB
  await prisma.product.update({
    where: { id: productId },
    data: updates,
  });

  // Build Zoho update payload — only include fields that were actually changed
  const zohoFields: Record<string, any> = {};
  if (updates.pricePerUnit !== undefined) zohoFields.Unit_Price = updates.pricePerUnit;
  if (updates.gramsAvailable !== undefined) zohoFields.Grams_Available = updates.gramsAvailable;
  if (updates.upcomingQty !== undefined) zohoFields.Upcoming_QTY = updates.upcomingQty;

  if (Object.keys(zohoFields).length > 0) {
    await zohoRequest('PUT', `/Products/${product.zohoProductId}`, {
      data: { data: [zohoFields], trigger: [] },
    });
  }
}

/**
 * Create a Zoho Task when a buyer places a bid.
 */
export async function createBidTask(bid: {
  id: string;
  pricePerUnit: number;
  quantity: number;
  totalValue: number;
  notes: string | null;
}, product: {
  name: string;
  zohoProductId: string;
  pricePerUnit: number | null;
}, buyer: {
  companyName: string | null;
  zohoContactId: string;
}) {
  const proximityScore = calculateProximity(bid.pricePerUnit, product.pricePerUnit || 0);

  const taskData = {
    data: [{
      Subject: `New Bid — ${product.name} — ${buyer.companyName || 'Unknown'}`,
      Status: 'Not Started',
      Priority: proximityScore > 80 ? 'High' : 'Normal',
      What_Id: product.zohoProductId,
      Who_Id: buyer.zohoContactId,
      Description: [
        `Product: ${product.name}`,
        `Bid: $${bid.pricePerUnit}/unit x ${bid.quantity}g = $${bid.totalValue}`,
        `Seller Asking: $${product.pricePerUnit || 'N/A'}/unit`,
        `Proximity: ${proximityScore}%`,
        bid.notes ? `Buyer Notes: ${bid.notes}` : '',
      ].filter(Boolean).join('\n'),
      Bid_Amount: bid.pricePerUnit,
      Bid_Quantity: bid.quantity,
      Bid_Status: 'Pending',
      Proximity_Score: proximityScore,
    }],
    trigger: [],
  };

  const response = await zohoRequest('POST', '/Tasks', { data: taskData });
  const zohoTaskId = response?.data?.[0]?.details?.id;

  // Save Zoho Task ID and proximity score back to local bid
  await prisma.bid.update({
    where: { id: bid.id },
    data: { zohoTaskId, proximityScore },
  });

  return { zohoTaskId, proximityScore };
}

// ─── Bid Task Status/Outcome ───

/**
 * Update a Zoho Task status when a bid is accepted or rejected.
 */
export async function updateBidTaskStatus(
  zohoTaskId: string,
  action: 'accept' | 'reject',
) {
  const statusMap = { accept: 'Completed', reject: 'Completed' };
  const bidStatusMap = { accept: 'Accepted', reject: 'Rejected' };

  await zohoRequest('PUT', `/Tasks/${zohoTaskId}`, {
    data: {
      data: [{
        Status: statusMap[action],
        Bid_Status: bidStatusMap[action],
      }],
      trigger: [],
    },
  });
}

/**
 * Append delivery outcome details to a Zoho Task description.
 */
export async function updateBidTaskOutcome(
  zohoTaskId: string,
  outcome: {
    actualQuantityDelivered?: number;
    deliveryOnTime?: boolean;
    qualityAsExpected?: boolean;
    outcomeNotes?: string;
  },
) {
  // Fetch current task to get existing description
  const response = await zohoRequest('GET', `/Tasks/${zohoTaskId}`);
  const currentDesc = response?.data?.[0]?.Description || '';

  const outcomeLines = [
    '\n--- Delivery Outcome ---',
    outcome.actualQuantityDelivered != null ? `Quantity Delivered: ${outcome.actualQuantityDelivered}g` : '',
    outcome.deliveryOnTime != null ? `On Time: ${outcome.deliveryOnTime ? 'Yes' : 'No'}` : '',
    outcome.qualityAsExpected != null ? `Quality As Expected: ${outcome.qualityAsExpected ? 'Yes' : 'No'}` : '',
    outcome.outcomeNotes ? `Notes: ${outcome.outcomeNotes}` : '',
  ].filter(Boolean).join('\n');

  await zohoRequest('PUT', `/Tasks/${zohoTaskId}`, {
    data: {
      data: [{ Description: currentDesc + outcomeLines }],
      trigger: [],
    },
  });
}

// ─── Deal Creation/Update (gated by ZOHO_DEALS_ENABLED) ───

/**
 * Create a Zoho Deal when a bid is accepted.
 * Gated by ZOHO_DEALS_ENABLED env var (default: false).
 */
export async function createDeal(params: {
  productName: string;
  buyerCompany: string | null;
  buyerZohoContactId: string;
  sellerZohoContactId: string;
  amount: number;
  quantity: number;
}): Promise<string | null> {
  if (process.env.ZOHO_DEALS_ENABLED !== 'true') return null;

  const response = await zohoRequest('POST', '/Deals', {
    data: {
      data: [{
        Deal_Name: `${params.productName} — ${params.buyerCompany || 'Buyer'}`,
        Stage: 'Closed Won',
        Amount: params.amount,
        Contact_Name: params.buyerZohoContactId,
        Description: [
          `Product: ${params.productName}`,
          `Quantity: ${params.quantity}g`,
          `Total Value: $${params.amount}`,
        ].join('\n'),
      }],
      trigger: [],
    },
  });

  return response?.data?.[0]?.details?.id || null;
}

/**
 * Update a Zoho Deal stage on transaction outcome.
 * Gated by ZOHO_DEALS_ENABLED env var.
 */
export async function updateDealStage(
  zohoDealId: string,
  stage: 'Closed Won' | 'Closed Lost',
) {
  if (process.env.ZOHO_DEALS_ENABLED !== 'true') return;

  await zohoRequest('PUT', `/Deals/${zohoDealId}`, {
    data: {
      data: [{ Stage: stage }],
      trigger: [],
    },
  });
}

// ─── Onboarding Milestone ───

/**
 * Push onboarding milestone to Zoho Contact.
 */
export async function pushOnboardingMilestone(
  zohoContactId: string,
  milestone: 'eula_accepted' | 'agreement_uploaded',
) {
  const fields: Record<string, any> = {};

  if (milestone === 'eula_accepted') {
    fields.EULA_Accepted = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  } else if (milestone === 'agreement_uploaded') {
    fields.Agreement_Uploaded = true;
  }

  await zohoRequest('PUT', `/Contacts/${zohoContactId}`, {
    data: {
      data: [fields],
      trigger: [],
    },
  });
}

// ─── Manual Listing → Zoho Product ───

/**
 * Create a new Zoho Product from a manual listing.
 * Returns the Zoho Product ID.
 */
export async function createZohoProduct(fields: {
  name: string;
  description?: string | null;
  category?: string | null;
  type?: string | null;
  licensedProducer?: string | null;
  lineage?: string | null;
  growthMedium?: string | null;
  harvestDate?: Date | null;
  certification?: string | null;
  thcMin?: number | null;
  thcMax?: number | null;
  cbdMin?: number | null;
  cbdMax?: number | null;
  dominantTerpene?: string | null;
  gramsAvailable?: number | null;
  upcomingQty?: number | null;
  minQtyRequest?: number | null;
  pricePerUnit?: number | null;
  budSizePopcorn?: number | null;
  budSizeSmall?: number | null;
  budSizeMedium?: number | null;
  budSizeLarge?: number | null;
  budSizeXLarge?: number | null;
  sellerZohoContactId: string;
}): Promise<string> {
  const zohoFields: Record<string, any> = {
    Product_Name: fields.name,
    Product_Active: false,
    Request_pending: true,
    Contact_Name: fields.sellerZohoContactId,
  };

  if (fields.description) zohoFields.Description = fields.description;
  if (fields.category) zohoFields.Product_Category = fields.category;
  if (fields.type) zohoFields.Type = fields.type;
  if (fields.licensedProducer) zohoFields.Licensed_Producer = fields.licensedProducer;
  if (fields.lineage) zohoFields.Lineage = fields.lineage;
  if (fields.growthMedium) zohoFields.Growth_Medium = fields.growthMedium;
  if (fields.harvestDate) zohoFields.Harvest_Date = fields.harvestDate.toISOString().split('T')[0];
  if (fields.certification) zohoFields.Certification = fields.certification;
  if (fields.thcMin != null) zohoFields.THC_min = fields.thcMin;
  if (fields.thcMax != null) zohoFields.THC_max = fields.thcMax;
  if (fields.cbdMin != null) zohoFields.CBD_min = fields.cbdMin;
  if (fields.cbdMax != null) zohoFields.CBD_max = fields.cbdMax;
  if (fields.dominantTerpene) zohoFields.Terpen = fields.dominantTerpene;
  if (fields.gramsAvailable != null) zohoFields.Grams_Available = fields.gramsAvailable;
  if (fields.upcomingQty != null) zohoFields.Upcoming_QTY = fields.upcomingQty;
  if (fields.minQtyRequest != null) zohoFields.Min_QTY_Request = fields.minQtyRequest;
  if (fields.pricePerUnit != null) zohoFields.Unit_Price = fields.pricePerUnit;
  if (fields.budSizePopcorn != null) zohoFields.X0_1_cm_Popcorn = fields.budSizePopcorn;
  if (fields.budSizeSmall != null) zohoFields.X1_2_cm_Small = fields.budSizeSmall;
  if (fields.budSizeMedium != null) zohoFields.X2_3_cm_Medium = fields.budSizeMedium;
  if (fields.budSizeLarge != null) zohoFields.X3_5_cm_Large = fields.budSizeLarge;
  if (fields.budSizeXLarge != null) zohoFields.X5_cm_X_Large = fields.budSizeXLarge;

  const response = await zohoRequest('POST', '/Products', {
    data: { data: [zohoFields], trigger: [] },
  });

  const zohoProductId = response?.data?.[0]?.details?.id;
  if (!zohoProductId) {
    throw new Error('Zoho did not return a Product ID');
  }

  return zohoProductId;
}

/**
 * Create a Zoho Task for admin review of a new manual listing.
 */
export async function createProductReviewTask(params: {
  zohoProductId: string;
  sellerZohoContactId: string;
  productName: string;
  sellerCompany: string | null;
  category?: string | null;
  pricePerUnit?: number | null;
  gramsAvailable?: number | null;
}): Promise<string | null> {
  const taskData = {
    data: [{
      Subject: `Product Review — ${params.productName} — ${params.sellerCompany || 'Unknown'}`,
      Status: 'Not Started',
      Priority: 'Normal',
      What_Id: params.zohoProductId,
      Who_Id: params.sellerZohoContactId,
      Description: [
        `Product: ${params.productName}`,
        params.category ? `Category: ${params.category}` : '',
        params.pricePerUnit != null ? `Price: $${params.pricePerUnit}/g` : '',
        params.gramsAvailable != null ? `Available: ${params.gramsAvailable}g` : '',
        `Source: Manual listing`,
      ].filter(Boolean).join('\n'),
    }],
    trigger: [],
  };

  const response = await zohoRequest('POST', '/Tasks', { data: taskData });
  return response?.data?.[0]?.details?.id || null;
}

// ─── Delta Sync ───

/**
 * Fetch products modified since a given timestamp using Zoho search API.
 */
export async function fetchProductsModifiedSince(since: Date): Promise<any[]> {
  const allProducts: any[] = [];
  let page = 1;
  let hasMore = true;

  const sinceStr = since.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  while (hasMore) {
    try {
      const response = await zohoRequest('GET', '/Products/search', {
        params: {
          criteria: `(Modified_Time:greater_than:${sinceStr})`,
          fields: PRODUCT_FIELDS,
          page,
          per_page: 200,
        },
      });

      const products = response?.data || [];
      allProducts.push(...products);
      hasMore = response?.info?.more_records || false;
      page++;
    } catch (err: any) {
      if (err?.response?.status === 204) break;
      throw err;
    }
  }

  return allProducts;
}

// ─── Product File URLs ───

/**
 * Fetch image and CoA file URLs for a Zoho product.
 * Looks at Image_1 through Image_4 and CoAs/CoAs_2 file fields.
 */
export async function fetchProductFileUrls(
  zohoProductId: string,
): Promise<{ imageUrls: string[]; coaUrls: string[] }> {
  const imageFields = ['Image_1', 'Image_2', 'Image_3', 'Image_4'];
  const coaFields = ['CoAs', 'CoAs_2'];

  const response = await zohoRequest('GET', `/Products/${zohoProductId}`, {
    params: {
      fields: [...imageFields, ...coaFields].join(','),
    },
  });

  const record = response?.data?.[0];
  if (!record) return { imageUrls: [], coaUrls: [] };

  const imageUrls: string[] = [];
  for (const field of imageFields) {
    if (record[field]) {
      // File fields contain download URLs or file IDs
      const fileInfo = record[field];
      if (typeof fileInfo === 'string') {
        imageUrls.push(fileInfo);
      } else if (fileInfo?.url) {
        imageUrls.push(fileInfo.url);
      } else if (fileInfo?.id) {
        imageUrls.push(`/Products/${zohoProductId}/files/${fileInfo.id}`);
      }
    }
  }

  const coaUrls: string[] = [];
  for (const field of coaFields) {
    if (record[field]) {
      const fileInfo = record[field];
      if (typeof fileInfo === 'string') {
        coaUrls.push(fileInfo);
      } else if (fileInfo?.url) {
        coaUrls.push(fileInfo.url);
      } else if (fileInfo?.id) {
        coaUrls.push(`/Products/${zohoProductId}/files/${fileInfo.id}`);
      }
    }
  }

  return { imageUrls, coaUrls };
}
