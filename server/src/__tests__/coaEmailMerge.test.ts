import express from 'express';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';

/**
 * Merging queue records from one email. The record selected FIRST is primary and
 * its values win; the others only fill fields it left empty.
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
vi.mock('../services/zohoApi', () => ({
  pushProductUpdate: vi.fn(), downloadZohoFile: vi.fn(),
  createZohoProduct: vi.fn(), uploadProductFiles: vi.fn(),
}));
vi.mock('../services/coaRedactor', () => ({ applyRedactions: vi.fn(), generatePageImages: vi.fn() }));
vi.mock('../utils/s3', () => ({
  isS3Configured: vi.fn().mockReturnValue(false), uploadFile: vi.fn(),
  deleteFile: vi.fn(), getSignedFileUrl: vi.fn(),
}));
vi.mock('../services/coaClient', () => ({ getCoaClient: () => ({}) }));
vi.mock('../utils/coaMapper', () => ({ mapCoaToProductFields: vi.fn() }));

import adminRouter from '../routes/admin';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).user = { id: 'admin-1', email: 'a@example.com' }; next(); });
  a.use('/', adminRouter);
  return a;
}

const coaRec = (over: Record<string, any> = {}) => ({
  id: 'coa-1', status: 'ready', sourceType: 'coa_pdf',
  coaJobId: 'job-1', coaProductId: 'cprod-1', coaProductName: 'Blue Dream',
  emailIngestionId: 'ing-1', sentToMarketplace: false, sentToAirtable: false,
  mergedIntoId: null,
  rawData: { mappedFields: { name: 'Blue Dream', labName: 'Eurofins', thcMax: 22.5, dominantTerpene: 'Limonene' } },
  ...over,
});

const bodyRec = (over: Record<string, any> = {}) => ({
  id: 'body-1', status: 'ready', sourceType: 'email_body',
  coaJobId: null, coaProductId: null, coaProductName: 'Blue Dream (price list)',
  emailIngestionId: 'ing-1', sentToMarketplace: false, sentToAirtable: false,
  mergedIntoId: null,
  rawData: { mappedFields: { name: 'Blue Dream', pricePerUnit: 3.1, gramsAvailable: 5000, thcMax: 21 } },
  ...over,
});

/** Capture what the transaction wrote. */
let txUpdates: Array<{ where: any; data: any }>;

beforeEach(() => {
  vi.clearAllMocks();
  txUpdates = [];
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn({
    coaSyncRecord: {
      update: vi.fn(async (args: any) => { txUpdates.push(args); return { id: args.where.id, ...args.data }; }),
    },
  }));
});

async function merge(primary: string, ids: string[]) {
  return request(app()).post('/coa-email-merge').send({
    primarySyncRecordId: primary, mergeSyncRecordIds: ids,
  });
}

describe('POST /coa-email-merge', () => {
  it('primary values win and secondaries fill the gaps', async () => {
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([coaRec(), bodyRec()] as any);

    const res = await merge('coa-1', ['body-1']);
    expect(res.status).toBe(200);

    const primaryWrite = txUpdates.find((u) => u.where.id === 'coa-1')!;
    const merged = primaryWrite.data.rawData.mappedFields;
    // CoA is primary, so its THC wins over the body's
    expect(merged.thcMax).toBe(22.5);
    expect(merged.labName).toBe('Eurofins');
    // Body fills what the CoA never had
    expect(merged.pricePerUnit).toBe(3.1);
    expect(merged.gramsAvailable).toBe(5000);
  });

  it('honours selection order — a body record chosen first wins', async () => {
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([coaRec(), bodyRec()] as any);

    const res = await merge('body-1', ['coa-1']);
    expect(res.status).toBe(200);

    const merged = txUpdates.find((u) => u.where.id === 'body-1')!.data.rawData.mappedFields;
    // The email carried a correction — 21, not the CoA's 22.5
    expect(merged.thcMax).toBe(21);
    // and still inherits what only the CoA had
    expect(merged.labName).toBe('Eurofins');
  });

  it('inherits the CoA linkage even when a body record is primary', async () => {
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([coaRec(), bodyRec()] as any);

    await merge('body-1', ['coa-1']);

    const primaryWrite = txUpdates.find((u) => u.where.id === 'body-1')!;
    // Without this the PDF and the whole redaction gate would be forfeited
    expect(primaryWrite.data.coaJobId).toBe('job-1');
    expect(primaryWrite.data.coaProductId).toBe('cprod-1');
    expect(primaryWrite.data.sourceType).toBe('coa_pdf');

    // coaJobId is unique — the secondary must release it first
    const secondaryWrite = txUpdates.find((u) => u.where.id === 'coa-1')!;
    expect(secondaryWrite.data.coaJobId).toBeNull();
    expect(txUpdates.indexOf(secondaryWrite)).toBeLessThan(txUpdates.indexOf(primaryWrite));
  });

  it('a null on the primary does not mask a real value from a secondary', async () => {
    const primary = coaRec({ rawData: { mappedFields: { name: 'Blue Dream', pricePerUnit: null } } });
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([primary, bodyRec()] as any);

    await merge('coa-1', ['body-1']);

    const merged = txUpdates.find((u) => u.where.id === 'coa-1')!.data.rawData.mappedFields;
    expect(merged.pricePerUnit).toBe(3.1);
  });

  it('marks absorbed records merged and points them at the survivor', async () => {
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([coaRec(), bodyRec()] as any);

    const res = await merge('coa-1', ['body-1']);

    const secondary = txUpdates.find((u) => u.where.id === 'body-1')!;
    expect(secondary.data.status).toBe('merged');
    expect(secondary.data.mergedIntoId).toBe('coa-1');
    expect(res.body.mergedFrom).toEqual([
      { id: 'body-1', coaProductName: 'Blue Dream (price list)', sourceType: 'email_body' },
    ]);
  });

  it('records what was absorbed on the primary for display', async () => {
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([coaRec(), bodyRec()] as any);

    await merge('coa-1', ['body-1']);

    const mergedFrom = txUpdates.find((u) => u.where.id === 'coa-1')!.data.rawData.mergedFrom;
    expect(mergedFrom).toHaveLength(1);
    expect(mergedFrom[0]).toMatchObject({ id: 'body-1', sourceType: 'email_body' });
    // The absorbed original is kept so the merge stays auditable
    expect(mergedFrom[0].rawData).toBeTruthy();
  });

  it('reports the extra PDF when the selection has more than one CoA', async () => {
    const second = coaRec({ id: 'coa-2', coaJobId: 'job-2', coaProductName: 'Second CoA' });
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([coaRec(), second] as any);

    const res = await merge('coa-1', ['coa-2']);

    expect(res.status).toBe(200);
    // Product.coaJobId holds one value — the caller must be told, not silently lose it
    expect(res.body.droppedCoaJobIds).toEqual(['job-2']);
  });

  it('rejects merging across different emails', async () => {
    const other = bodyRec({ emailIngestionId: 'ing-2' });
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([coaRec(), other] as any);

    const res = await merge('coa-1', ['body-1']);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/same email/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a record that has already been sent', async () => {
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([
      coaRec(), bodyRec({ sentToMarketplace: true }),
    ] as any);

    const res = await merge('coa-1', ['body-1']);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been sent/i);
  });

  it('rejects a record that was already merged elsewhere', async () => {
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([
      coaRec(), bodyRec({ status: 'merged', mergedIntoId: 'other' }),
    ] as any);

    const res = await merge('coa-1', ['body-1']);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already merged/i);
  });

  it('rejects a dismissed record', async () => {
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([
      coaRec(), bodyRec({ status: 'dismissed' }),
    ] as any);

    const res = await merge('coa-1', ['body-1']);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dismissed/i);
  });

  it('404s when a selected record does not exist', async () => {
    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue([coaRec()] as any);

    const res = await merge('coa-1', ['ghost-1']);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/ghost-1/);
  });

  it('400s when only the primary is supplied', async () => {
    const res = await merge('coa-1', ['coa-1']);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nothing to merge/i);
    expect(prisma.coaSyncRecord.findMany).not.toHaveBeenCalled();
  });

  it('rejects an empty merge list at validation', async () => {
    const res = await merge('coa-1', []);
    expect(res.status).toBe(400);
  });
});
