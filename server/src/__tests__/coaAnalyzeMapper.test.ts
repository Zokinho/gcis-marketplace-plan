import { describe, it, expect } from 'vitest';
import { mapExtractedToFormFields } from '../utils/coaAnalyzeMapper';
import type { ExtractedCoaData } from '../services/coaExtractor';

function makeExtraction(overrides: Partial<ExtractedCoaData> = {}): ExtractedCoaData {
  return {
    product_name: null,
    strain_type: null,
    product_form: null,
    lot_number: null,
    producer: null,
    lab: null,
    test_date: null,
    report_number: null,
    compliance_status: null,
    potency: null,
    terpenes: null,
    microbial: null,
    pesticides: null,
    heavy_metals: null,
    residual_solvents: null,
    mycotoxins: null,
    moisture: null,
    methodologies: null,
    accreditations: null,
    redaction_regions: [],
    ...overrides,
  };
}

describe('mapExtractedToFormFields', () => {
  it('maps a full extraction to form fields', () => {
    const data = makeExtraction({
      product_name: 'Pink Kush',
      strain_type: 'Indica',
      lot_number: 'LOT-001',
      producer: 'ACME Cannabis Inc.',
      lab: 'Kaycha Labs',
      test_date: '2025-06-15',
      report_number: 'RPT-12345',
      potency: {
        total_thc_pct: 24.5,
        total_cbd_pct: 1.2,
        cannabinoids: {
          'Total THC': { result: '24.5', unit: '%' },
          'Total CBD': { result: '1.2', unit: '%' },
        },
      },
      terpenes: {
        total_pct: 3.2,
        individual: {
          'Myrcene': { result: '1.2', unit: '%' },
          'Limonene': { result: '0.8', unit: '%' },
          'Beta-Caryophyllene': { result: '0.6', unit: '%' },
        },
      },
    });

    const fields = mapExtractedToFormFields(data);
    expect(fields.name).toBe('Pink Kush');
    expect(fields.type).toBe('Indica');
    expect(fields.licensedProducer).toBe('ACME Cannabis Inc.');
    expect(fields.thc).toBe('24.5');
    expect(fields.cbd).toBe('1.2');
    expect(fields.labName).toBe('Kaycha Labs');
    expect(fields.testDate).toBe('2025-06-15');
    expect(fields.reportNumber).toBe('RPT-12345');
    expect(fields.lotNumber).toBe('LOT-001');
    expect(fields.fieldsExtracted).toBeGreaterThanOrEqual(8);
  });

  it('returns all nulls for empty extraction', () => {
    const fields = mapExtractedToFormFields(makeExtraction());
    expect(fields.name).toBeNull();
    expect(fields.type).toBeNull();
    expect(fields.thc).toBeNull();
    expect(fields.cbd).toBeNull();
    expect(fields.terpenes).toEqual([]);
    expect(fields.fieldsExtracted).toBe(0);
  });

  it('normalizes strain types', () => {
    expect(mapExtractedToFormFields(makeExtraction({ strain_type: 'sativa dominant' })).type).toBe('Sativa');
    expect(mapExtractedToFormFields(makeExtraction({ strain_type: 'INDICA' })).type).toBe('Indica');
    expect(mapExtractedToFormFields(makeExtraction({ strain_type: 'Hybrid - Balanced' })).type).toBe('Hybrid');
    // Unknown types return null (form only accepts Sativa/Indica/Hybrid)
    expect(mapExtractedToFormFields(makeExtraction({ strain_type: 'Ruderalis' })).type).toBeNull();
  });

  it('extracts THC/CBD from top-level potency fields', () => {
    const data = makeExtraction({
      potency: {
        total_thc_pct: 22.5,
        total_cbd_pct: 1.2,
        cannabinoids: {},
      },
    });
    const fields = mapExtractedToFormFields(data);
    expect(fields.thc).toBe('22.5');
    expect(fields.cbd).toBe('1.2');
  });

  it('normalizes fraction potency values to percentages', () => {
    // Some CoAs report potency as decimal fractions (0.1873 = 18.73%)
    const data = makeExtraction({
      potency: {
        total_thc_pct: 0.245,
        total_cbd_pct: 0.1873,
        cannabinoids: {},
      },
    });
    const fields = mapExtractedToFormFields(data);
    expect(fields.thc).toBe('24.5');
    expect(fields.cbd).toBe('18.73');
  });

  it('falls back to cannabinoid entries when top-level is null', () => {
    const data = makeExtraction({
      potency: {
        total_thc_pct: null,
        total_cbd_pct: null,
        cannabinoids: {
          'Total THC': { result: '19.8', unit: '%' },
          'Total CBD': { result: '1.5', unit: '%' },
          'THCA': { result: '22.1', unit: '%' },
        },
      },
    });
    const fields = mapExtractedToFormFields(data);
    expect(fields.thc).toBe('19.8');
    expect(fields.cbd).toBe('1.5');
  });

  it('sorts terpenes by value descending', () => {
    const data = makeExtraction({
      terpenes: {
        total_pct: 5.0,
        individual: {
          'Limonene': { result: '0.3', unit: '%' },
          'Myrcene': { result: '1.5', unit: '%' },
          'Pinene': { result: '0.8', unit: '%' },
        },
      },
    });
    const fields = mapExtractedToFormFields(data);
    expect(fields.terpenes[0]).toContain('Myrcene');
    expect(fields.terpenes.length).toBe(3);
    expect(parseFloat(fields.terpenePercentages[fields.terpenes[0]])).toBeGreaterThan(
      parseFloat(fields.terpenePercentages[fields.terpenes[1]])
    );
  });

  it('matches known terpene names', () => {
    const data = makeExtraction({
      terpenes: {
        total_pct: 2.0,
        individual: {
          'beta-caryophyllene': { result: '0.8', unit: '%' },
          'alpha-pinene': { result: '0.5', unit: '%' },
          'limonene': { result: '0.7', unit: '%' },
        },
      },
    });
    const fields = mapExtractedToFormFields(data);
    expect(fields.terpenes).toContain('Beta-Caryophyllene');
    expect(fields.terpenes).toContain('Alpha-Pinene');
    expect(fields.terpenes).toContain('Limonene');
  });

  it('skips terpenes with zero or negative values', () => {
    const data = makeExtraction({
      terpenes: {
        total_pct: 1.0,
        individual: {
          'Myrcene': { result: '1.0', unit: '%' },
          'Ocimene': { result: '0', unit: '%' },
          'Pinene': { result: '-0.1', unit: '%' },
          'Linalool': { result: 'ND', unit: '%' },
        },
      },
    });
    const fields = mapExtractedToFormFields(data);
    expect(fields.terpenes).toEqual(['Myrcene']);
  });

  it('formats test date as YYYY-MM-DD', () => {
    const data = makeExtraction({ test_date: '2025-06-15T00:00:00Z' });
    expect(mapExtractedToFormFields(data).testDate).toBe('2025-06-15');
  });

  it('handles invalid date gracefully', () => {
    const data = makeExtraction({ test_date: 'not-a-date' });
    expect(mapExtractedToFormFields(data).testDate).toBeNull();
  });

  it('builds testResults from extraction data', () => {
    const data = makeExtraction({
      potency: {
        total_thc_pct: 20.0,
        total_cbd_pct: 0.5,
        cannabinoids: { 'Total THC': { result: '20.0', unit: '%' } },
      },
      microbial: { 'TVC': { result: '<100', status: 'pass' } },
      heavy_metals: { 'Lead': { result: '0.01', unit: 'ppm', status: 'pass' } },
      lab: 'Test Lab',
    });

    const fields = mapExtractedToFormFields(data);
    expect(fields.testResults).not.toBeNull();
    expect(fields.testResults?.potency).toBeDefined();
    expect(fields.testResults?.potency.data['Total THC'].result).toBe('20.0');
    expect(fields.testResults?.microbial).toBeDefined();
    expect(fields.testResults?.heavy_metals).toBeDefined();
  });

  it('returns null testResults when no test data sections exist', () => {
    const fields = mapExtractedToFormFields(makeExtraction());
    expect(fields.testResults).toBeNull();
  });

  it('counts fields correctly', () => {
    // Just name → 1 field
    const data1 = makeExtraction({ product_name: 'Test' });
    expect(mapExtractedToFormFields(data1).fieldsExtracted).toBe(1);

    // Name + type + thc + cbd + lab → 5 fields
    const data5 = makeExtraction({
      product_name: 'Test',
      strain_type: 'Sativa',
      lab: 'Lab',
      potency: { total_thc_pct: 20, total_cbd_pct: 1, cannabinoids: {} },
    });
    expect(mapExtractedToFormFields(data5).fieldsExtracted).toBe(5);

    // Name + category + thc + cbd (defaulted to 0) → 4 fields
    const data4 = makeExtraction({
      product_name: 'Test',
      product_form: 'dried flower',
      potency: { total_thc_pct: 20, total_cbd_pct: null, cannabinoids: {} },
    });
    expect(mapExtractedToFormFields(data4).fieldsExtracted).toBe(4);
  });

  it('infers category from product_form', () => {
    expect(mapExtractedToFormFields(makeExtraction({ product_form: 'dried flower' })).category).toBe('Cannabis flowers (mix sizes)');
    expect(mapExtractedToFormFields(makeExtraction({ product_form: 'live rosin' })).category).toBe('Cannabis live rosin and live resin');
    expect(mapExtractedToFormFields(makeExtraction({ product_form: 'kief' })).category).toBe('Cannabis kief');
    expect(mapExtractedToFormFields(makeExtraction({ product_form: 'distillate' })).category).toBe('Cannabinoid distillates');
    expect(mapExtractedToFormFields(makeExtraction({ product_form: null })).category).toBeNull();
    expect(mapExtractedToFormFields(makeExtraction({ product_form: 'unknown stuff' })).category).toBeNull();
  });

  it('defaults CBD to 0 when potency exists but no CBD found', () => {
    // When THC is present but no CBD at all
    const data = makeExtraction({
      potency: {
        total_thc_pct: 28.5,
        total_cbd_pct: null,
        cannabinoids: {
          'THCA': { result: '32.1', unit: '%' },
          'D9-THC': { result: '0.44', unit: '%' },
        },
      },
    });
    const fields = mapExtractedToFormFields(data);
    expect(fields.cbd).toBe('0');
  });

  it('extracts totalTerpenePercent from terpenes.total_pct', () => {
    const data = makeExtraction({
      terpenes: {
        total_pct: 3.5,
        individual: { 'Myrcene': { result: '1.5', unit: '%' } },
      },
    });
    expect(mapExtractedToFormFields(data).totalTerpenePercent).toBe('3.5');
  });

  it('calculates totalTerpenePercent as sum when total_pct is null', () => {
    const data = makeExtraction({
      terpenes: {
        total_pct: null,
        individual: {
          'Myrcene': { result: '1.5', unit: '%' },
          'Limonene': { result: '0.8', unit: '%' },
        },
      },
    });
    expect(mapExtractedToFormFields(data).totalTerpenePercent).toBe('2.3');
  });

  it('includes moisture in testResults', () => {
    const data = makeExtraction({
      moisture: { result: '8.5', unit: '%' },
    });
    const fields = mapExtractedToFormFields(data);
    expect(fields.testResults?.moisture).toBeDefined();
    expect(fields.testResults?.moisture.data.moisture.result).toBe('8.5');
  });
});
