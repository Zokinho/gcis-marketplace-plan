import express from 'express';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';

/**
 * The CoA-email path must go through the same redaction zone-approval gate as any
 * other pending product: nothing leaves for Zoho or SharePoint until an admin has
 * approved the zones and they have been burned into the PDF.
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
vi.mock('../services/airtableService', () => ({ pushToAirtable: vi.fn() }));
vi.mock('../services/emailService', () => ({
  isEmailConfigured: vi.fn().mockReturnValue(false),
  sendAccountApprovedEmail: vi.fn(), sendAccountRejectedEmail: vi.fn(),
  sendOnboardingReminderEmail: vi.fn(),
}));

// vi.mock factories are hoisted above module-level consts, so the shared spies
// have to be created inside vi.hoisted().
const {
  mockUploadProductFiles, mockApplyRedactions, mockGeneratePageImages, mockS3Upload,
  mockAxiosGet, mockCoa,
} = vi.hoisted(() => ({
  mockUploadProductFiles: vi.fn(),
  mockApplyRedactions: vi.fn(),
  mockGeneratePageImages: vi.fn(),
  mockS3Upload: vi.fn(),
  mockAxiosGet: vi.fn(),
  mockCoa: {
    getProductDetail: vi.fn(),
    getJobProduct: vi.fn(),
    getProductPdfUrl: vi.fn(),
    getJobOriginalPdf: vi.fn(),
    getJobRedactions: vi.fn(),
    uploadToSharePoint: vi.fn(),
    uploadApprovedPdfToSharePoint: vi.fn(),
  },
}));

vi.mock('../services/zohoApi', () => ({
  pushProductUpdate: vi.fn(),
  downloadZohoFile: vi.fn(),
  createZohoProduct: vi.fn().mockResolvedValue('zoho-1'),
  uploadProductFiles: mockUploadProductFiles,
}));

vi.mock('../services/coaRedactor', () => ({
  applyRedactions: mockApplyRedactions,
  generatePageImages: mockGeneratePageImages,
}));

vi.mock('../utils/s3', () => ({
  isS3Configured: vi.fn().mockReturnValue(true),
  uploadFile: mockS3Upload,
  deleteFile: vi.fn(),
  getSignedFileUrl: vi.fn().mockResolvedValue('https://s3/original.pdf'),
}));

vi.mock('../services/coaClient', () => ({ getCoaClient: () => mockCoa }));

// The approve handler dynamically imports axios to fetch the stored original
vi.mock('axios', () => ({
  default: { get: mockAxiosGet, post: vi.fn(), put: vi.fn() },
  get: mockAxiosGet,
}));

vi.mock('../utils/coaMapper', () => ({
  mapCoaToProductFields: vi.fn().mockReturnValue({ name: 'Blue Dream', labName: 'Eurofins' }),
}));

import adminRouter from '../routes/admin';

const admin = { id: 'admin-1', email: 'admin@example.com' };

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).user = admin; next(); });
  a.use('/', adminRouter);
  return a;
}

const SOURCE_PDF = Buffer.from('%PDF-source');

beforeEach(() => {
  vi.clearAllMocks();
  mockCoa.getProductDetail.mockResolvedValue({ name: 'Blue Dream', lab: 'Eurofins' });
  mockCoa.getJobProduct.mockResolvedValue(null);
  mockCoa.getJobOriginalPdf.mockResolvedValue(SOURCE_PDF);
  mockCoa.getJobRedactions.mockResolvedValue([]);
  mockCoa.uploadApprovedPdfToSharePoint.mockResolvedValue({ id: 'sp-1' });
  mockGeneratePageImages.mockResolvedValue({ images: [Buffer.from('png')], pageCount: 1 });
  mockS3Upload.mockResolvedValue(true);
  mockAxiosGet.mockResolvedValue({ data: SOURCE_PDF });
  mockUploadProductFiles.mockResolvedValue(undefined);
  vi.mocked(prisma.product.create).mockResolvedValue({ id: 'prod-1', name: 'Blue Dream' } as any);
  vi.mocked(prisma.product.update).mockResolvedValue({} as any);
  vi.mocked(prisma.coaSyncRecord.update).mockResolvedValue({} as any);
  vi.mocked(prisma.redactionRegion.createMany).mockResolvedValue({ count: 0 } as any);
  vi.mocked(prisma.redactionTemplate.findUnique).mockResolvedValue(null as any);
  vi.mocked(prisma.redactionTemplate.update).mockResolvedValue({} as any);
  vi.mocked(prisma.coaSyncRecord.findUnique).mockResolvedValue({
    id: 'sync-1', status: 'ready', coaJobId: 'job-1', coaProductId: 'cprod-1', createdAt: new Date(),
  } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'seller-1', zohoContactId: null, companyName: 'Seller Corp',
  } as any);
});

async function confirm(body: Record<string, any> = {}) {
  const res = await request(app())
    .post('/coa-email-confirm')
    .send({ syncRecordId: 'sync-1', sellerId: 'seller-1', ...body });
  await new Promise((r) => setTimeout(r, 60));
  return res;
}

describe('confirm — seeds redaction review', () => {
  it('stores the UNREDACTED source PDF as the redaction original', async () => {
    const res = await confirm();

    expect(res.status).toBe(200);
    // Must be the clean source: the preview has AI blackouts burned in, which
    // would leave a reviewer unable to reject a false positive.
    expect(mockCoa.getJobOriginalPdf).toHaveBeenCalledWith('job-1');
    const originalUpload = mockS3Upload.mock.calls.find((c) => String(c[0]).endsWith('_original.pdf'));
    expect(originalUpload).toBeDefined();
    expect(originalUpload![1]).toBe(SOURCE_PDF);

    // coaOriginalKey is what the approve handler gates its redaction step on
    const update = vi.mocked(prisma.product.update).mock.calls.find(
      (c) => (c[0] as any).data?.coaOriginalKey,
    );
    expect(update).toBeDefined();
    expect((update![0] as any).data.coaPageCount).toBe(1);
  });

  it('seeds regions from the per-lab template when one matches', async () => {
    vi.mocked(prisma.redactionTemplate.findUnique).mockResolvedValue({
      labName: 'eurofins',
      pageCount: 1,
      regions: [{ page: 0, xPct: 5, yPct: 5, wPct: 20, hPct: 8, reason: 'Client name' }],
      useCount: 3,
    } as any);

    await confirm();

    // The template is the cost lever — human corrections get reused per lab
    const created = vi.mocked(prisma.redactionRegion.createMany).mock.calls[0][0] as any;
    expect(created.data).toHaveLength(1);
    expect(created.data[0].source).toBe('template');
    expect(created.data[0].reason).toBe('Client name');
    // AI output is not consulted when a template hit
    expect(mockCoa.getJobRedactions).not.toHaveBeenCalled();
  });

  it('ignores a template whose page count does not match', async () => {
    vi.mocked(prisma.redactionTemplate.findUnique).mockResolvedValue({
      labName: 'eurofins', pageCount: 4, regions: [{ page: 3, xPct: 1, yPct: 1, wPct: 1, hPct: 1, reason: 'x' }], useCount: 1,
    } as any);
    mockCoa.getJobRedactions.mockResolvedValue([
      { id: 'r1', page: 0, x_pct: 10, y_pct: 10, w_pct: 30, h_pct: 5, reason: 'Client', confidence: 'high', approved: true },
    ]);

    await confirm();

    const created = vi.mocked(prisma.redactionRegion.createMany).mock.calls[0][0] as any;
    expect(created.data[0].source).toBe('ai');
  });

  it('falls back to AI detections when no template exists', async () => {
    mockCoa.getJobRedactions.mockResolvedValue([
      { id: 'r1', page: 0, x_pct: 10, y_pct: 20, w_pct: 30, h_pct: 5, reason: 'Client name', confidence: 'medium', approved: true },
    ]);

    await confirm();

    const created = vi.mocked(prisma.redactionRegion.createMany).mock.calls[0][0] as any;
    expect(created.data).toEqual([
      expect.objectContaining({
        productId: 'prod-1', page: 0, xPct: 10, yPct: 20, wPct: 30, hPct: 5,
        reason: 'Client name', confidence: 'medium', source: 'ai', approved: true,
      }),
    ]);
  });

  it('does not distribute the CoA at confirm time', async () => {
    await confirm();

    expect(mockUploadProductFiles).not.toHaveBeenCalled();
    expect(mockCoa.uploadApprovedPdfToSharePoint).not.toHaveBeenCalled();
    expect(mockCoa.uploadToSharePoint).not.toHaveBeenCalled();
  });

  it('confirms even when there is no source PDF to seed from', async () => {
    mockCoa.getJobOriginalPdf.mockResolvedValue(null);

    const res = await confirm();

    expect(res.status).toBe(200);
    expect(prisma.redactionRegion.createMany).not.toHaveBeenCalled();
  });
});

describe('approve — distributes only the approved PDF', () => {
  const REDACTED = Buffer.from('%PDF-redacted');

  beforeEach(() => {
    mockApplyRedactions.mockResolvedValue(REDACTED);
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'prod-1', name: 'Blue Dream', requestPending: true,
      coaOriginalKey: 'products/prod-1/coa/abc_original.pdf',
      coaJobId: 'job-1', zohoProductId: 'zoho-1', zohoReviewTaskId: null,
    } as any);
    vi.mocked(prisma.redactionRegion.findMany).mockResolvedValue([
      { page: 0, xPct: 5, yPct: 5, wPct: 20, hPct: 8, approved: true },
    ] as any);
    vi.mocked(prisma.product.update).mockResolvedValue({
      id: 'prod-1', name: 'Blue Dream', requestPending: false, marketplaceVisible: true,
    } as any);
  });

  async function approve() {
    const res = await request(app()).post('/products/prod-1/approve').send({});
    await new Promise((r) => setTimeout(r, 80));
    return res;
  }

  it('sends the redacted buffer to Zoho and SharePoint, not the original', async () => {
    const res = await approve();
    expect(res.status).toBe(200);

    expect(mockUploadProductFiles).toHaveBeenCalledTimes(1);
    const [zohoId, images, coas] = mockUploadProductFiles.mock.calls[0];
    expect(zohoId).toBe('zoho-1');
    expect(images).toEqual([]);
    expect(coas[0].buffer).toBe(REDACTED);

    expect(mockCoa.uploadApprovedPdfToSharePoint).toHaveBeenCalledWith(
      'job-1', REDACTED, expect.stringContaining('Blue Dream'),
    );
  });

  it('applies only approved regions', async () => {
    await approve();

    // The query itself filters on approved — rejected zones must not be burned in
    const findArgs = vi.mocked(prisma.redactionRegion.findMany).mock.calls[0][0] as any;
    expect(findArgs.where).toMatchObject({ productId: 'prod-1', approved: true });
    expect(mockApplyRedactions).toHaveBeenCalled();
  });

  it('does not distribute when redaction was never set up', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'prod-1', name: 'Blue Dream', requestPending: true,
      coaOriginalKey: null, coaJobId: 'job-1', zohoProductId: 'zoho-1', zohoReviewTaskId: null,
    } as any);

    const res = await approve();

    expect(res.status).toBe(200);
    expect(mockUploadProductFiles).not.toHaveBeenCalled();
    expect(mockCoa.uploadApprovedPdfToSharePoint).not.toHaveBeenCalled();
  });

  it('a Zoho upload failure does not prevent the SharePoint push', async () => {
    mockUploadProductFiles.mockRejectedValueOnce(new Error('Zoho rejected file attach'));

    const res = await approve();

    expect(res.status).toBe(200);
    expect(mockCoa.uploadApprovedPdfToSharePoint).toHaveBeenCalled();
  });
});
