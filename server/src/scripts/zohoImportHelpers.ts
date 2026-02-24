/**
 * Zoho CRM read-only helpers for the V1 data import script.
 *
 * IMPORTANT: This file deliberately imports ONLY from zohoAuth.ts to avoid
 * pulling in the Express app (zohoApi.ts imports `prisma` from `../index`).
 * This keeps the import script fully standalone — no Express server, no
 * notification services, no cron jobs.
 */
import { zohoRequest } from '../services/zohoAuth';

// ─── Field lists (copied from zohoApi.ts) ───

export const PRODUCT_FIELDS = [
  'Product_Name', 'Product_Code', 'Description', 'Product_Category', 'Categories',
  'Product_Active', 'Request_pending', 'Min_Request_G_Including_5_markup', 'Min_QTY_Request',
  'Grams_Available_When_submitted', 'Upcoming_QTY_3_Months', 'THC_as_is', 'THC_max', 'CBD_as_is', 'CBD_max',
  'Certification', 'Harvest_Date', 'Manufacturer_name', 'Lineage', 'Growth_Medium',
  'Terpen', 'Highest_Terpenes', 'Aromas',
  'cm_Popcorn', 'cm_Small', 'cm_Medium', 'cm_Large', 'cm_X_Large',
  'Contact_Name',
].join(',');

export const CONTACT_FIELDS = [
  'First_Name', 'Last_Name', 'Email', 'Company', 'Title', 'Contact_Type',
  'Account_Confirmed', 'Mailing_Country', 'Phone', 'User_UID',
].join(',');

// ─── Fetch all contacts (paginated) ───

export async function fetchAllContacts(): Promise<any[]> {
  const allContacts: any[] = [];
  let page = 1;
  let hasMore = true;

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

// ─── Fetch all products (paginated) ───

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
      if (err?.response?.status === 204) break;
      throw err;
    }
  }

  return allProducts;
}

// ─── File URL helpers ───

function extractFileUrls(fieldValue: any, zohoProductId: string): string[] {
  if (!fieldValue) return [];

  const items = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
  const urls: string[] = [];

  for (const item of items) {
    if (typeof item === 'string') {
      urls.push(item);
    } else if (item?.id) {
      urls.push(`/api/zoho-files/${zohoProductId}/${item.id}`);
    }
  }

  return urls;
}

export async function fetchProductFileUrls(
  zohoProductId: string,
): Promise<{ imageUrls: string[]; coaUrls: string[] }> {
  const imageFields = ['Image_1', 'Image_2', 'Image_3', 'Image_4'];
  const coaFields = ['CoAs', 'CoAs_2', 'CoAs_3'];

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
