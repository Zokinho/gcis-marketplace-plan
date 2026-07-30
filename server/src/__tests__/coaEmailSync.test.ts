import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../index';

const mockCoaClient = {
  listEmailIngestions: vi.fn(),
  getJobStatus: vi.fn(),
  getJobProduct: vi.fn(),
  getProductDetail: vi.fn(),
};

vi.mock('../services/coaClient', () => ({
  getCoaClient: () => mockCoaClient,
}));

vi.mock('../services/sellerDetection', () => ({
  detectSeller: vi.fn().mockResolvedValue(null),
}));

vi.mock('../utils/coaMapper', () => ({
  mapCoaToProductFields: vi.fn().mockReturnValue({ name: 'Blue Dream' }),
}));

import { pollEmailIngestions } from '../services/coaEmailSync';

const ingestion = (overrides: Record<string, any> = {}) => ({
  id: 'ing-1',
  sender: 'supplier@example.com',
  subject: 'Inventory',
  suggested_client: null,
  confirmed_client: null,
  extracted_products: null,
  attachments: [
    { id: 'att-1', attachment_type: 'coa_pdf', job_id: 'job-1' },
  ],
  ...overrides,
});

const productDetail = {
  id: 'cprod-1',
  name: 'Blue Dream',
  strain_type: 'Hybrid',
  lot_number: 'LOT-1',
  producer: 'Northern Fields',
  lab: 'Eurofins',
  test_date: '2026-07-01',
  report_number: 'R-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.coaSyncRecord.findUnique).mockResolvedValue(null as any);
  vi.mocked(prisma.coaSyncRecord.findFirst).mockResolvedValue(null as any);
  vi.mocked(prisma.coaSyncRecord.create).mockResolvedValue({} as any);
  mockCoaClient.getProductDetail.mockResolvedValue(productDetail);
});

describe('pollEmailIngestions — multi-product flag propagation', () => {
  it('carries a flagged job\'s reason into rawData', async () => {
    const flagMessage =
      '2 products detected in one PDF. Published: Blue Dream [LOT-1] p1-2. ' +
      'Not published: Pink Kush [LOT-2] p3. Split the PDF and re-upload the remaining products.';

    mockCoaClient.listEmailIngestions.mockResolvedValue([ingestion()]);
    mockCoaClient.getJobStatus.mockResolvedValue({
      id: 'job-1',
      status: 'flagged',
      product_id: 'cprod-1',
      error_message: flagMessage,
    });

    const result = await pollEmailIngestions();

    expect(result.processed).toBe(1);
    const created = vi.mocked(prisma.coaSyncRecord.create).mock.calls[0][0] as any;
    expect(created.data.rawData.jobFlag).toBe(flagMessage);
    // A flagged job still produced a usable product — it must stay actionable
    expect(created.data.status).toBe('ready');
  });

  it('omits jobFlag for a normal review-status job', async () => {
    mockCoaClient.listEmailIngestions.mockResolvedValue([ingestion()]);
    mockCoaClient.getJobStatus.mockResolvedValue({
      id: 'job-1',
      status: 'review',
      product_id: 'cprod-1',
      error_message: null,
    });

    await pollEmailIngestions();

    const created = vi.mocked(prisma.coaSyncRecord.create).mock.calls[0][0] as any;
    expect(created.data.rawData.jobFlag).toBeUndefined();
    expect(created.data.rawData.coaProductId).toBe('cprod-1');
  });

  it('omits jobFlag when a job is flagged without a reason', async () => {
    mockCoaClient.listEmailIngestions.mockResolvedValue([ingestion()]);
    mockCoaClient.getJobStatus.mockResolvedValue({
      id: 'job-1',
      status: 'flagged',
      product_id: 'cprod-1',
      error_message: null,
    });

    await pollEmailIngestions();

    const created = vi.mocked(prisma.coaSyncRecord.create).mock.calls[0][0] as any;
    expect(created.data.rawData.jobFlag).toBeUndefined();
  });

  it('skips product_photo attachments', async () => {
    mockCoaClient.listEmailIngestions.mockResolvedValue([
      ingestion({
        attachments: [{ id: 'att-1', attachment_type: 'product_photo', job_id: 'job-1' }],
      }),
    ]);

    const result = await pollEmailIngestions();

    expect(result.processed).toBe(0);
    expect(prisma.coaSyncRecord.create).not.toHaveBeenCalled();
  });

  it('does not re-create a record for a job already synced', async () => {
    vi.mocked(prisma.coaSyncRecord.findUnique).mockResolvedValue({ id: 'existing' } as any);
    mockCoaClient.listEmailIngestions.mockResolvedValue([ingestion()]);

    const result = await pollEmailIngestions();

    expect(result.processed).toBe(0);
    expect(prisma.coaSyncRecord.create).not.toHaveBeenCalled();
  });
});
