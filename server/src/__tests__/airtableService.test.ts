import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  isAirtableConfigured,
  formatCannabinoids,
  parseTerpenesMultiSelect,
  computeTotalTerpenePercent,
  formatProductOffering,
  buildAirtableFields,
  pushToAirtable,
} from '../services/airtableService';
import type { AirtablePushInput } from '../services/airtableService';

vi.mock('axios', () => ({
  default: { post: vi.fn().mockResolvedValue({ data: { records: [] } }) },
}));

vi.mock('../utils/s3', () => ({
  isS3Configured: vi.fn().mockReturnValue(false),
  uploadFile: vi.fn().mockResolvedValue(null),
  getSignedFileUrl: vi.fn().mockResolvedValue(null),
}));

const baseMappedFields = {
  name: 'Pink Kush',
  labName: 'TestLab',
  testDate: new Date('2025-03-15'),
  reportNumber: 'RPT-001',
  type: 'Indica',
  productCode: 'LOT-123',
  licensedProducer: 'LP Corp',
  thcMin: 20,
  thcMax: 25,
  cbdMin: null,
  cbdMax: 0.5,
  dominantTerpene: 'Myrcene; Limonene; Caryophyllene',
  highestTerpenes: 'Myrcene: 1.2%\nLimonene: 0.8%',
  testResults: {
    terpenes: {
      data: {
        Myrcene: { result: '1.2', unit: '%' },
        Limonene: { result: '0.8', unit: '%' },
        Caryophyllene: { result: '0.3', unit: '%' },
      },
    },
  },
};

function makeInput(overrides?: Partial<AirtablePushInput>): AirtablePushInput {
  return {
    mappedFields: baseMappedFields,
    overrides: undefined,
    coaProductId: 'coa-123',
    companyName: 'Seller Co',
    isHarvex: true,
    getPdfBuffer: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('isAirtableConfigured', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns false when env vars are missing', () => {
    delete process.env.AIRTABLE_API_KEY;
    delete process.env.AIRTABLE_BASE_ID;
    delete process.env.AIRTABLE_TABLE_ID;
    expect(isAirtableConfigured()).toBe(false);
  });

  it('returns false when only some vars are set', () => {
    process.env.AIRTABLE_API_KEY = 'pat123';
    delete process.env.AIRTABLE_BASE_ID;
    delete process.env.AIRTABLE_TABLE_ID;
    expect(isAirtableConfigured()).toBe(false);
  });

  it('returns true when all vars are set', () => {
    process.env.AIRTABLE_API_KEY = 'pat123';
    process.env.AIRTABLE_BASE_ID = 'appXYZ';
    process.env.AIRTABLE_TABLE_ID = 'tblABC';
    expect(isAirtableConfigured()).toBe(true);
  });
});

describe('formatCannabinoids', () => {
  it('formats both THC and CBD', () => {
    expect(formatCannabinoids(25, 0.5)).toBe('THC: 25% / CBD: 0.5%');
  });

  it('formats THC only', () => {
    expect(formatCannabinoids(22, null)).toBe('THC: 22%');
  });

  it('formats CBD only', () => {
    expect(formatCannabinoids(null, 1.2)).toBe('CBD: 1.2%');
  });

  it('returns null when both are null', () => {
    expect(formatCannabinoids(null, null)).toBeNull();
  });
});

describe('parseTerpenesMultiSelect', () => {
  it('splits semicolon-separated terpenes into name objects', () => {
    expect(parseTerpenesMultiSelect('Myrcene; Limonene; Caryophyllene')).toEqual([
      { name: 'Myrcene' },
      { name: 'Limonene' },
      { name: 'Caryophyllene' },
    ]);
  });

  it('returns null for null input', () => {
    expect(parseTerpenesMultiSelect(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTerpenesMultiSelect('')).toBeNull();
  });

  it('handles single terpene', () => {
    expect(parseTerpenesMultiSelect('Myrcene')).toEqual([{ name: 'Myrcene' }]);
  });
});

describe('computeTotalTerpenePercent', () => {
  it('sums terpene values from test results', () => {
    const result = computeTotalTerpenePercent({
      terpenes: {
        data: {
          Myrcene: { result: '1.2', unit: '%' },
          Limonene: { result: '0.8', unit: '%' },
        },
      },
    });
    expect(result).toBe(2);
  });

  it('skips status/overall_result keys', () => {
    const result = computeTotalTerpenePercent({
      terpenes: {
        data: {
          Myrcene: { result: '1.0', unit: '%' },
          overall_result: 'pass',
          status: 'complete',
        },
      },
    });
    expect(result).toBe(1);
  });

  it('returns null when no terpenes section', () => {
    expect(computeTotalTerpenePercent({})).toBeNull();
    expect(computeTotalTerpenePercent(null)).toBeNull();
  });

  it('returns null when terpene data is empty', () => {
    expect(computeTotalTerpenePercent({ terpenes: { data: {} } })).toBeNull();
  });
});

describe('formatProductOffering', () => {
  it('combines type and name', () => {
    expect(formatProductOffering('Indica', 'Pink Kush')).toBe('Indica - Pink Kush');
  });

  it('returns name only when type is null', () => {
    expect(formatProductOffering(null, 'Pink Kush')).toBe('Pink Kush');
  });
});

describe('buildAirtableFields', () => {
  it('maps all available fields', () => {
    const input = makeInput({ overrides: { gramsAvailable: 5000, pricePerUnit: 4.5 } });
    const fields = buildAirtableFields(input);

    expect(fields['fldK33FSV91BPtOfR']).toBe('Indica - Pink Kush'); // Product Offering
    expect(fields['fldJfRUUs0zokx62l']).toBe('Pink Kush'); // Product Name
    expect(fields['fldQjPHhOecYy3xT7']).toBe('THC: 25% / CBD: 0.5%'); // Cannabinoids
    expect(fields['fldkjZlN5F2sV0mz4']).toEqual([
      { name: 'Myrcene' },
      { name: 'Limonene' },
      { name: 'Caryophyllene' },
    ]); // Dominant Terpenes
    expect(fields['fldTLmirHlxhsEixX']).toBe(2.3); // Terpene %
    expect(fields['fldjWwLYAjTTTIFNG']).toBe(5); // Quantity Kg (5000g / 1000)
    expect(fields['fldd3zHJk5y3iSasd']).toBe(4.5); // Price
    expect(fields['fldQ1PK4FJOpIujtt']).toBe('LP Corp'); // Company (from LP)
    expect(fields['fldLwTB4iTcvjHzQe']).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Date Uploaded
    expect(fields['fldvfLVPzv7y0uK1f']).toBe('2025-03-15'); // Harvest Date
    expect(fields['fldHphfVedVXd4TD7']).toBe(true); // Harvex
  });

  it('omits null fields', () => {
    const input = makeInput({
      mappedFields: {
        ...baseMappedFields,
        thcMax: null,
        cbdMax: null,
        dominantTerpene: null,
        testResults: null,
        licensedProducer: null,
        testDate: null,
      },
      companyName: null,
    });
    const fields = buildAirtableFields(input);

    expect(fields['fldQjPHhOecYy3xT7']).toBeUndefined(); // Cannabinoids omitted
    expect(fields['fldkjZlN5F2sV0mz4']).toBeUndefined(); // Terpenes omitted
    expect(fields['fldTLmirHlxhsEixX']).toBeUndefined(); // Terpene % omitted
    expect(fields['fldQ1PK4FJOpIujtt']).toBeUndefined(); // Company omitted
    expect(fields['fldvfLVPzv7y0uK1f']).toBeUndefined(); // Harvest date omitted
    expect(fields['fldjWwLYAjTTTIFNG']).toBeUndefined(); // Quantity omitted
    expect(fields['fldd3zHJk5y3iSasd']).toBeUndefined(); // Price omitted
  });

  it('uses overrides over mapped fields', () => {
    const input = makeInput({
      overrides: { name: 'Override Name', type: 'Sativa', thcMax: 30 },
    });
    const fields = buildAirtableFields(input);

    expect(fields['fldJfRUUs0zokx62l']).toBe('Override Name');
    expect(fields['fldK33FSV91BPtOfR']).toBe('Sativa - Override Name');
    expect(fields['fldQjPHhOecYy3xT7']).toBe('THC: 30% / CBD: 0.5%');
  });

  it('falls back to companyName when licensedProducer is null', () => {
    const input = makeInput({
      mappedFields: { ...baseMappedFields, licensedProducer: null },
      companyName: 'Fallback Corp',
    });
    const fields = buildAirtableFields(input);
    expect(fields['fldQ1PK4FJOpIujtt']).toBe('Fallback Corp');
  });

  it('converts grams to kg', () => {
    const input = makeInput({ overrides: { gramsAvailable: 2500 } });
    const fields = buildAirtableFields(input);
    expect(fields['fldjWwLYAjTTTIFNG']).toBe(2.5);
  });
});

describe('pushToAirtable', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('skips when not configured', async () => {
    delete process.env.AIRTABLE_API_KEY;
    const axios = await import('axios');
    await pushToAirtable(makeInput());
    expect(axios.default.post).not.toHaveBeenCalled();
  });

  it('catches errors without throwing', async () => {
    process.env.AIRTABLE_API_KEY = 'pat123';
    process.env.AIRTABLE_BASE_ID = 'appXYZ';
    process.env.AIRTABLE_TABLE_ID = 'tblABC';

    const axios = await import('axios');
    vi.mocked(axios.default.post).mockRejectedValue(new Error('API down'));

    // Should not throw
    await expect(pushToAirtable(makeInput())).resolves.toBeUndefined();
  });

  it('calls Airtable API when configured', async () => {
    process.env.AIRTABLE_API_KEY = 'pat123';
    process.env.AIRTABLE_BASE_ID = 'appXYZ';
    process.env.AIRTABLE_TABLE_ID = 'tblABC';

    const axios = await import('axios');

    await pushToAirtable(makeInput());

    expect(axios.default.post).toHaveBeenCalledWith(
      'https://api.airtable.com/v0/appXYZ/tblABC',
      expect.objectContaining({
        records: [expect.objectContaining({ fields: expect.any(Object) })],
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer pat123',
        }),
      }),
    );
  });
});
