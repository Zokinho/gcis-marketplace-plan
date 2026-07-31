import express from 'express';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';

/**
 * Commercial values the AI pulled out of an email body (price, quantity,
 * category, harvest date) have no slot in MappedProductFields. The queue card
 * displays them, but buildOverrides() only sends fields the admin edited — so
 * agreeing with what is on screen must not discard them.
 */

vi.mock('../services/zohoSync', () => ({
  runFullSync: vi.fn(), syncProducts: vi.fn(), syncContacts: vi.fn(),
  syncProductsDelta: vi.fn(), clearSellerCache: vi.fn(),
}));
vi.mock('../services/auditService', () => ({
  logAudit: vi.fn(), getRequestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('../services/notificationService', () => ({
  createNotification: vi.fn(), createNotificationBatch: vi.fn(),
}));
vi.mock('../services/coaEmailSync', () => ({ pollEmailIngestions: vi.fn() }));
vi.mock('../services/sellerDetection', () => ({ detectSeller: vi.fn() }));
vi.mock('../services/emailService', () => ({
  isEmailConfigured: vi.fn().mockReturnValue(false),
  sendAccountApprovedEmail: vi.fn(), sendAccountRejectedEmail: vi.fn(),
  sendOnboardingReminderEmail: vi.fn(),
}));
vi.mock('../services/zohoApi', () => ({
  pushProductUpdate: vi.fn(), downloadZohoFile: vi.fn(),
  createZohoProduct: vi.fn().mockResolvedValue('zoho-1'), uploadProductFiles: vi.fn(),
}));
vi.mock('../services/coaRedactor', () => ({
  applyRedactions: vi.fn(), generatePageImages: vi.fn(),
}));
vi.mock('../utils/s3', () => ({
  isS3Configured: vi.fn().mockReturnValue(false), uploadFile: vi.fn(),
  deleteFile: vi.fn(), getSignedFileUrl: vi.fn(),
}));
const { mockPushToAirtable, mockCoa, mockMapCoa } = vi.hoisted(() => ({
  mockPushToAirtable: vi.fn(),
  mockMapCoa: vi.fn(),
  mockCoa: {
    getProductDetail: vi.fn(),
    getJobProduct: vi.fn(),
    getProductPdfUrl: vi.fn(),
    getJobOriginalPdf: vi.fn(),
    getJobRedactions: vi.fn(),
    uploadApprovedPdfToSharePoint: vi.fn(),
  },
}));

vi.mock('../services/coaClient', () => ({ getCoaClient: () => mockCoa }));
vi.mock('../services/airtableService', () => ({ pushToAirtable: mockPushToAirtable }));
vi.mock('../utils/coaMapper', () => ({ mapCoaToProductFields: mockMapCoa }));

import adminRouter from '../routes/admin';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).user = { id: 'admin-1', email: 'a@example.com' }; next(); });
  a.use('/', adminRouter);
  return a;
}

/** An email-body record as coaEmailSync writes it. */
const bodyRecord = (mappedOverrides: Record<string, any> = {}) => ({
  id: 'sync-1',
  status: 'ready',
  sourceType: 'email_body',
  coaJobId: null,
  coaProductId: null,
  coaProductName: 'Blue Dream',
  createdAt: new Date(),
  rawData: {
    emailExtracted: true,
    mappedFields: {
      type: 'Hybrid',
      thcMax: 22.5,
      cbdMax: 0.1,
      licensedProducer: 'Northern Fields',
      category: 'Cannabis flowers (mix sizes)',
      pricePerUnit: 3.1,
      gramsAvailable: 5000,
      certification: 'GACP',
      harvestDate: '2026-05-01',
      ...mappedOverrides,
    },
    rawEmailProduct: {
      product_name: 'Blue Dream',
      strain_type: 'Hybrid',
      producer: 'Northern Fields',
      thc_percent: 22.5,
      cbd_percent: 0.1,
      price_per_gram: 3.1,
      quantity_grams: 5000,
      category: 'Cannabis flowers (mix sizes)',
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCoa.getProductDetail.mockResolvedValue(null);
  mockCoa.getJobProduct.mockResolvedValue(null);
  mockCoa.getProductPdfUrl.mockReturnValue('http://coa/pdf');
  mockCoa.getJobOriginalPdf.mockResolvedValue(null);
  mockCoa.getJobRedactions.mockResolvedValue([]);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'seller-1', zohoContactId: null, companyName: 'Seller Corp',
  } as any);
  vi.mocked(prisma.product.create).mockResolvedValue({ id: 'prod-1', name: 'Blue Dream' } as any);
  vi.mocked(prisma.product.update).mockResolvedValue({} as any);
  vi.mocked(prisma.coaSyncRecord.update).mockResolvedValue({} as any);
});

async function confirm(record: any, body: Record<string, any> = {}) {
  vi.mocked(prisma.coaSyncRecord.findUnique).mockResolvedValue(record);
  const res = await request(app())
    .post('/coa-email-confirm')
    .send({ syncRecordId: 'sync-1', sellerId: 'seller-1', ...body });
  await new Promise((r) => setTimeout(r, 30));
  return res;
}

describe('email-body confirm — extracted commercial fields survive', () => {
  it('carries price, quantity and category onto the Product when the admin edits nothing', async () => {
    const res = await confirm(bodyRecord());

    expect(res.status).toBe(200);
    const created = (vi.mocked(prisma.product.create).mock.calls[0][0] as any).data;
    expect(created.pricePerUnit).toBe(3.1);
    expect(created.gramsAvailable).toBe(5000);
    expect(created.category).toBe('Cannabis flowers (mix sizes)');
  });

  it('parses the extracted harvest date into a Date', async () => {
    await confirm(bodyRecord());

    const created = (vi.mocked(prisma.product.create).mock.calls[0][0] as any).data;
    expect(created.harvestDate).toBeInstanceOf(Date);
    expect((created.harvestDate as Date).toISOString().slice(0, 10)).toBe('2026-05-01');
  });

  it('drops an unparseable harvest date rather than storing Invalid Date', async () => {
    await confirm(bodyRecord({ harvestDate: 'last summer sometime' }));

    const created = (vi.mocked(prisma.product.create).mock.calls[0][0] as any).data;
    expect(created.harvestDate).toBeNull();
  });

  it('admin edits still win over the extracted values', async () => {
    await confirm(bodyRecord(), {
      overrides: { pricePerUnit: 2.75, category: 'Milled Flower' },
    });

    const created = (vi.mocked(prisma.product.create).mock.calls[0][0] as any).data;
    expect(created.pricePerUnit).toBe(2.75);
    expect(created.category).toBe('Milled Flower');
    // Untouched field keeps the extracted value
    expect(created.gramsAvailable).toBe(5000);
  });

  it('an explicitly cleared field stays cleared', async () => {
    await confirm(bodyRecord(), { overrides: { pricePerUnit: null } });

    const created = (vi.mocked(prisma.product.create).mock.calls[0][0] as any).data;
    expect(created.pricePerUnit).toBeNull();
  });

  it('falls back to rawEmailProduct when rawData.mappedFields is absent', async () => {
    const record = bodyRecord();
    delete (record.rawData as any).mappedFields;

    await confirm(record);

    const created = (vi.mocked(prisma.product.create).mock.calls[0][0] as any).data;
    expect(created.pricePerUnit).toBe(3.1);
    expect(created.gramsAvailable).toBe(5000);
  });

  it('sends the same values to Airtable — buildAirtableFields reads them from overrides', async () => {
    await confirm(bodyRecord());

    expect(mockPushToAirtable).toHaveBeenCalledTimes(1);
    const pushed = mockPushToAirtable.mock.calls[0][0];
    expect(pushed.overrides).toMatchObject({
      pricePerUnit: 3.1,
      gramsAvailable: 5000,
      category: 'Cannabis flowers (mix sizes)',
    });
  });

  it('sends them to Airtable on the airtable-only path too', async () => {
    await confirm(bodyRecord(), { destination: 'airtable' });

    const pushed = mockPushToAirtable.mock.calls[0][0];
    expect(pushed.isHarvex).toBe(false);
    expect(pushed.overrides).toMatchObject({ pricePerUnit: 3.1, gramsAvailable: 5000 });
  });
});

describe('CoA-sourced confirm — unchanged', () => {
  const coaRecord = {
    id: 'sync-1', status: 'ready', sourceType: 'coa_pdf',
    coaJobId: 'job-1', coaProductId: 'cprod-1', coaProductName: 'Blue Dream',
    createdAt: new Date(), rawData: {},
  };

  it('seeds no commercial defaults, so overrides remain the only source', async () => {
    mockMapCoa.mockReturnValue({ name: 'Blue Dream', labName: 'Eurofins' });
    mockCoa.getJobProduct.mockResolvedValue({ name: 'Blue Dream', lab: 'Eurofins' });

    await confirm(coaRecord as any, { overrides: { pricePerUnit: 4.2 } });

    const created = (vi.mocked(prisma.product.create).mock.calls[0][0] as any).data;
    expect(created.pricePerUnit).toBe(4.2);
    // No email body to draw from — these stay absent rather than being invented
    expect(created.gramsAvailable).toBeUndefined();
  });
});
