import axios from 'axios';
import logger from '../utils/logger';
import { uploadFile, getSignedFileUrl, isS3Configured } from '../utils/s3';
import { MappedProductFields } from '../utils/coaMapper';

// ─── Types ───

interface AirtableRecord {
  fields: Record<string, any>;
}

export interface AirtablePushInput {
  mappedFields: MappedProductFields;
  overrides?: Record<string, any>;
  coaProductId: string | null;
  companyName: string | null;
  isHarvex: boolean;
  /** PDF download function — returns buffer or null */
  getPdfBuffer: () => Promise<Buffer | null>;
}

// ─── Airtable field IDs ───

const FIELD = {
  PRODUCT_OFFERING: 'fldK33FSV91BPtOfR',
  PRODUCT_NAME: 'fldJfRUUs0zokx62l',
  CANNABINOIDS: 'fldQjPHhOecYy3xT7',
  DOMINANT_TERPENES: 'fldkjZlN5F2sV0mz4',
  TERPENE_PCT: 'fldTLmirHlxhsEixX',
  QUANTITY_KG: 'fldjWwLYAjTTTIFNG',
  PRICE: 'fldd3zHJk5y3iSasd',
  DOCUMENTATION: 'fldNbhytnGaTaRH2B',
  COMPANY: 'fldQ1PK4FJOpIujtt',
  DATE_UPLOADED: 'fldLwTB4iTcvjHzQe',
  HARVEST_DATE: 'fldvfLVPzv7y0uK1f',
  HARVEX: 'fldHphfVedVXd4TD7',
} as const;

// ─── Config check ───

export function isAirtableConfigured(): boolean {
  return !!(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID && process.env.AIRTABLE_TABLE_ID);
}

// ─── Field mapping helpers ───

export function formatCannabinoids(thcMax: number | null, cbdMax: number | null): string | null {
  const parts: string[] = [];
  if (thcMax != null) parts.push(`THC: ${thcMax}%`);
  if (cbdMax != null) parts.push(`CBD: ${cbdMax}%`);
  return parts.length > 0 ? parts.join(' / ') : null;
}

export function parseTerpenesMultiSelect(dominantTerpene: string | null): Array<{ name: string }> | null {
  if (!dominantTerpene) return null;
  const names = dominantTerpene.split('; ').map((t) => t.trim()).filter(Boolean);
  return names.length > 0 ? names.map((name) => ({ name })) : null;
}

export function computeTotalTerpenePercent(testResults: Record<string, any> | null): number | null {
  if (!testResults) return null;

  const terpeneSection = testResults['terpenes'];
  if (!terpeneSection?.data) return null;

  let total = 0;
  let found = false;

  for (const [key, val] of Object.entries(terpeneSection.data)) {
    if (key === 'overall_result' || key === 'status') continue;
    const result = typeof val === 'object' && val !== null ? (val as any).result : val;
    const num = parseFloat(String(result));
    if (!isNaN(num) && num > 0) {
      total += num;
      found = true;
    }
  }

  return found ? Math.round(total * 100) / 100 : null;
}

export function formatProductOffering(type: string | null, name: string): string {
  return type ? `${type} - ${name}` : name;
}

/**
 * Build Airtable fields record from CoA mapped data.
 * Null fields are omitted (Airtable ignores missing fields).
 */
export function buildAirtableFields(input: AirtablePushInput): Record<string, any> {
  const { mappedFields, overrides, companyName, isHarvex } = input;

  const fields: Record<string, any> = {};

  // Product Offering — "type - name"
  const productName = (overrides?.name as string) || mappedFields.name;
  const productType = (overrides?.type as string) || mappedFields.type;
  fields[FIELD.PRODUCT_OFFERING] = formatProductOffering(productType, productName);

  // Product Name
  fields[FIELD.PRODUCT_NAME] = productName;

  // Cannabinoids %
  const thcMax = (overrides?.thcMax as number) ?? mappedFields.thcMax;
  const cbdMax = (overrides?.cbdMax as number) ?? mappedFields.cbdMax;
  const cannabinoids = formatCannabinoids(thcMax, cbdMax);
  if (cannabinoids) fields[FIELD.CANNABINOIDS] = cannabinoids;

  // Dominant Terpenes (multi-select)
  const dominantTerpene = (overrides?.dominantTerpene as string) ?? mappedFields.dominantTerpene;
  const terpeneSelect = parseTerpenesMultiSelect(dominantTerpene);
  if (terpeneSelect) fields[FIELD.DOMINANT_TERPENES] = terpeneSelect;

  // Terpene % (total)
  const terpenePct = computeTotalTerpenePercent(mappedFields.testResults);
  if (terpenePct != null) fields[FIELD.TERPENE_PCT] = terpenePct;

  // Quantity (Kg) — gramsAvailable / 1000
  const grams = overrides?.gramsAvailable as number | undefined;
  if (grams != null) fields[FIELD.QUANTITY_KG] = grams / 1000;

  // Price ($)
  const price = overrides?.pricePerUnit as number | undefined;
  if (price != null) fields[FIELD.PRICE] = price;

  // Company
  const company = (overrides?.licensedProducer as string) || mappedFields.licensedProducer || companyName;
  if (company) fields[FIELD.COMPANY] = company;

  // Date Uploaded (today)
  fields[FIELD.DATE_UPLOADED] = new Date().toISOString().split('T')[0];

  // Harvest Date
  const harvestDate = overrides?.harvestDate || mappedFields.testDate;
  if (harvestDate) {
    const d = harvestDate instanceof Date ? harvestDate : new Date(harvestDate);
    if (!isNaN(d.getTime())) fields[FIELD.HARVEST_DATE] = d.toISOString().split('T')[0];
  }

  // Harvex checkbox
  fields[FIELD.HARVEX] = isHarvex;

  return fields;
}

// ─── Push to Airtable (fire-and-forget) ───

/**
 * Push a product record to Airtable. Logs errors but never throws.
 * Designed for fire-and-forget usage.
 */
export async function pushToAirtable(input: AirtablePushInput): Promise<void> {
  if (!isAirtableConfigured()) {
    logger.warn('[AIRTABLE] Not configured — skipping push');
    return;
  }

  try {
    const fields = buildAirtableFields(input);

    // Attempt PDF attachment via S3 presigned URL
    if (input.coaProductId && isS3Configured()) {
      try {
        const pdfBuffer = await input.getPdfBuffer();
        if (pdfBuffer) {
          const s3Key = `airtable-temp/${input.coaProductId}.pdf`;
          const uploaded = await uploadFile(s3Key, pdfBuffer, 'application/pdf');
          if (uploaded) {
            const presignedUrl = await getSignedFileUrl(s3Key);
            if (presignedUrl) {
              fields[FIELD.DOCUMENTATION] = [{ url: presignedUrl }];
            }
          }
        }
      } catch (pdfErr) {
        logger.warn({ err: pdfErr instanceof Error ? pdfErr : { message: String(pdfErr) } }, '[AIRTABLE] PDF attachment failed (non-critical)');
      }
    }

    const baseId = process.env.AIRTABLE_BASE_ID!;
    const tableId = process.env.AIRTABLE_TABLE_ID!;
    const apiKey = process.env.AIRTABLE_API_KEY!;

    const record: AirtableRecord = { fields };

    await axios.post(
      `https://api.airtable.com/v0/${baseId}/${tableId}`,
      { records: [record] },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      },
    );

    logger.info({ productName: fields[FIELD.PRODUCT_NAME], isHarvex: input.isHarvex }, '[AIRTABLE] Product pushed successfully');
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[AIRTABLE] Push failed (non-critical)');
  }
}
