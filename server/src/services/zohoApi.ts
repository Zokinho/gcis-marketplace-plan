import fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';
import { zohoRequest, getAccessToken, ZOHO_API_URL } from './zohoAuth';
import { prisma } from '../index';
import { calculateProximity } from '../utils/proximity';
import logger from '../utils/logger';

// ─── Product field list for sync ───

const PRODUCT_FIELDS = [
  'Product_Name', 'Product_Code', 'Description', 'Product_Category', 'Categories',
  'Product_Active', 'Request_pending', 'Min_Request_G_Including_5_markup', 'Min_QTY_Request',
  'Grams_Available_When_submitted', 'Upcoming_QTY_3_Months', 'THC_as_is', 'THC_max', 'CBD_as_is', 'CBD_max',
  'Certification', 'Harvest_Date', 'Manufacturer_name', 'Lineage', 'Growth_Medium',
  'Terpen', 'Highest_Terpenes', 'Aromas',
  'cm_Popcorn', 'cm_Small', 'cm_Medium', 'cm_Large', 'cm_X_Large',
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

  // Fetch all contacts and filter for those with a User_UID (marketplace users).
  // Zoho v7 search doesn't support "is_not_empty" operator.
  while (hasMore) {
    try {
      const response = await zohoRequest('GET', '/Contacts', {
        params: {
          fields: CONTACT_FIELDS,
          page,
          per_page: 200,
        },
      });

      const contacts = response?.data || [];
      // Only include contacts that have a Clerk User_UID
      for (const c of contacts) {
        if (c.User_UID) allContacts.push(c);
      }
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
  updates: { pricePerUnit?: number; gramsAvailable?: number; upcomingQty?: number; minQtyRequest?: number; description?: string },
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
  if (updates.pricePerUnit !== undefined) zohoFields.Min_Request_G_Including_5_markup = updates.pricePerUnit;
  if (updates.gramsAvailable !== undefined) zohoFields.Grams_Available_When_submitted = updates.gramsAvailable;
  if (updates.upcomingQty !== undefined) zohoFields.Upcoming_QTY_3_Months = updates.upcomingQty;
  if (updates.minQtyRequest !== undefined) zohoFields.Min_QTY_Request = updates.minQtyRequest;
  if (updates.description !== undefined) zohoFields.Description = updates.description;

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
  zohoContactId: string | null;
}) {
  const proximityScore = calculateProximity(bid.pricePerUnit, product.pricePerUnit || 0);

  const taskData = {
    data: [{
      Subject: `New Bid — ${product.name} — ${buyer.companyName || 'Unknown'}`,
      Status: 'Not Started',
      Priority: proximityScore > 80 ? 'High' : 'Normal',
      What_Id: product.zohoProductId,
      ...(buyer.zohoContactId ? { Who_Id: buyer.zohoContactId } : {}),
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
  buyerZohoContactId: string | null;
  sellerZohoContactId: string | null;
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
        ...(params.buyerZohoContactId ? { Contact_Name: params.buyerZohoContactId } : {}),
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
  if (fields.type) zohoFields.Categories = [fields.type];
  if (fields.licensedProducer) zohoFields.Manufacturer_name = fields.licensedProducer;
  if (fields.lineage) zohoFields.Lineage = fields.lineage;
  if (fields.growthMedium) zohoFields.Growth_Medium = fields.growthMedium;
  if (fields.harvestDate) zohoFields.Harvest_Date = fields.harvestDate.toISOString().split('T')[0];
  if (fields.certification) zohoFields.Certification = fields.certification.split(',').map((c) => c.trim()).filter(Boolean);
  if (fields.thcMin != null) zohoFields.THC_as_is = fields.thcMin;
  if (fields.thcMax != null) zohoFields.THC_max = fields.thcMax;
  if (fields.cbdMin != null) zohoFields.CBD_as_is = fields.cbdMin;
  if (fields.cbdMax != null) zohoFields.CBD_max = fields.cbdMax;
  if (fields.dominantTerpene) zohoFields.Terpen = fields.dominantTerpene;
  if (fields.gramsAvailable != null) zohoFields.Grams_Available_When_submitted = fields.gramsAvailable;
  if (fields.upcomingQty != null) zohoFields.Upcoming_QTY_3_Months = fields.upcomingQty;
  if (fields.minQtyRequest != null) zohoFields.Min_QTY_Request = fields.minQtyRequest;
  if (fields.pricePerUnit != null) zohoFields.Min_Request_G_Including_5_markup = fields.pricePerUnit;
  if (fields.budSizePopcorn != null) zohoFields.cm_Popcorn = fields.budSizePopcorn;
  if (fields.budSizeSmall != null) zohoFields.cm_Small = fields.budSizeSmall;
  if (fields.budSizeMedium != null) zohoFields.cm_Medium = fields.budSizeMedium;
  if (fields.budSizeLarge != null) zohoFields.cm_Large = fields.budSizeLarge;
  if (fields.budSizeXLarge != null) zohoFields.cm_X_Large = fields.budSizeXLarge;

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
      $se_module: 'Products',
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

// ─── File Uploads to Zoho ───

/**
 * Upload a local file to Zoho File System (ZFS).
 * Returns the encrypted file ID for attaching to a record.
 */
async function uploadToZFS(filePath: string): Promise<string> {
  const token = await getAccessToken();
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  const response = await axios.post(`${ZOHO_API_URL}/files`, form, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...form.getHeaders(),
    },
    maxContentLength: 20 * 1024 * 1024,
  });

  const fileId = response.data?.data?.[0]?.details?.id;
  if (!fileId) throw new Error('ZFS upload did not return a file ID');
  return fileId;
}

/**
 * Upload images and CoA files to a Zoho Product record.
 * Images go to Image_1 through Image_4, CoAs go to CoAs and CoAs_2.
 * Each file is uploaded to ZFS first, then attached to the record field.
 */
export async function uploadProductFiles(
  zohoProductId: string,
  imageFiles: string[],  // local file paths
  coaFiles: string[],    // local file paths
): Promise<void> {
  const imageFieldNames = ['Image_1', 'Image_2', 'Image_3', 'Image_4'];
  const coaFieldNames = ['CoAs', 'CoAs_2'];

  const updatePayload: Record<string, any> = {};

  // Upload images
  for (let i = 0; i < Math.min(imageFiles.length, 4); i++) {
    try {
      const fileId = await uploadToZFS(imageFiles[i]);
      updatePayload[imageFieldNames[i]] = [{ file_id: fileId }];
    } catch (err: any) {
      logger.error({ err, field: imageFieldNames[i] }, '[ZOHO] Image upload failed');
    }
  }

  // Upload CoAs
  for (let i = 0; i < Math.min(coaFiles.length, 2); i++) {
    try {
      const fileId = await uploadToZFS(coaFiles[i]);
      updatePayload[coaFieldNames[i]] = [{ file_id: fileId }];
    } catch (err: any) {
      logger.error({ err, field: coaFieldNames[i] }, '[ZOHO] CoA upload failed');
    }
  }

  // Attach all uploaded files to the product record via v2 API
  // (v7 silently ignores file_id attachments on fileupload fields)
  if (Object.keys(updatePayload).length > 0) {
    const token = await getAccessToken();
    const v2BaseUrl = ZOHO_API_URL.replace('/v7', '/v2');
    await axios.put(`${v2BaseUrl}/Products/${zohoProductId}`, {
      data: [updatePayload],
      trigger: [],
    }, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    logger.info({ count: Object.keys(updatePayload).length, zohoProductId }, '[ZOHO] Uploaded files to product');
  }
}

// ─── Delta Sync ───

/**
 * Fetch products modified since a given timestamp using Zoho search API.
 */
export async function fetchProductsModifiedSince(since: Date): Promise<any[]> {
  const allProducts: any[] = [];
  let page = 1;
  let hasMore = true;

  // Zoho v7 search expects datetime as yyyy-MM-ddTHH:mm:ss+HH:mm
  const sinceStr = since.toISOString().replace(/\.\d+Z$/, '+00:00');

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

// ─── Deleted Products ───

/**
 * Fetch product IDs deleted from Zoho since a given timestamp.
 */
export async function fetchDeletedProductIds(since: Date): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await zohoRequest('GET', '/Products/deleted', {
        params: { type: 'all', page, per_page: 200 },
      });

      const records = response?.data || [];
      for (const r of records) {
        if (new Date(r.deleted_time) >= since) {
          ids.push(r.id);
        }
      }
      hasMore = response?.info?.more_records || false;
      page++;
    } catch (err: any) {
      if (err?.response?.status === 204) break;
      throw err;
    }
  }

  return ids;
}

// ─── Product File URLs ───

/**
 * Extract proxy URLs from a Zoho file upload field value.
 * Zoho returns an array of objects: [{ id, File_Id__s, File_Name__s, ... }]
 * We construct proxy URLs: /api/zoho-files/{zohoProductId}/{fileId}
 */
function extractFileUrls(fieldValue: any, zohoProductId: string): string[] {
  if (!fieldValue) return [];

  // Zoho file upload fields return arrays of file objects
  const items = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
  const urls: string[] = [];

  for (const item of items) {
    if (typeof item === 'string') {
      urls.push(item);
    } else if (item?.id) {
      // Use record-level attachment id for download_fields_attachment API
      urls.push(`/api/zoho-files/${zohoProductId}/${item.id}`);
    }
  }

  return urls;
}

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
    imageUrls.push(...extractFileUrls(record[field], zohoProductId));
  }

  const coaUrls: string[] = [];
  for (const field of coaFields) {
    coaUrls.push(...extractFileUrls(record[field], zohoProductId));
  }

  return { imageUrls, coaUrls };
}

/**
 * Download a file from a Zoho file upload field.
 * Used by the proxy endpoint to stream files to the browser.
 */
export async function downloadZohoFile(
  zohoProductId: string,
  fileId: string,
): Promise<{ data: Buffer; contentType: string; fileName: string }> {
  const token = await getAccessToken();

  const response = await axios.get(
    `${ZOHO_API_URL}/Products/${zohoProductId}/actions/download_fields_attachment`,
    {
      params: { fields_attachment_id: fileId },
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      responseType: 'arraybuffer',
    },
  );

  const contentType = response.headers['content-type'] || 'application/octet-stream';
  const disposition = response.headers['content-disposition'] || '';
  const fileNameMatch = disposition.match(/filename="?([^";\n]+)"?/);
  const fileName = fileNameMatch?.[1] || 'file';

  return { data: response.data, contentType, fileName };
}
