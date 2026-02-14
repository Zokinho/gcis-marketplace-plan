import { describe, it, expect } from 'vitest';
import { mapCoaToProductFields } from '../utils/coaMapper';
import type { CoaProductDetailResponse } from '../services/coaClient';

/**
 * Helper to build a minimal CoaProductDetailResponse with overrides.
 */
function makeCoaProduct(overrides: Partial<CoaProductDetailResponse> = {}): CoaProductDetailResponse {
  return {
    id: '1',
    name: 'Test Product',
    strain_type: null,
    lot_number: 'LOT-001',
    producer: 'Test Producer',
    lab: 'Test Lab',
    test_date: '2025-01-15',
    report_number: 'RPT-12345',
    tier: 'standard',
    status: 'published',
    available: true,
    tags: [],
    client_name: null,
    created_at: '2025-01-01T00:00:00Z',
    product_group_id: null,
    is_latest: true,
    test_data: [],
    ...overrides,
  };
}

describe('mapCoaToProductFields', () => {
  describe('basic product mapping', () => {
    it('maps name, lab, testDate, and reportNumber', () => {
      const coaProduct = makeCoaProduct({
        name: 'Blue Dream',
        lab: 'Kaycha Labs',
        test_date: '2025-03-10',
        report_number: 'RPT-99999',
      });

      const result = mapCoaToProductFields(coaProduct);

      expect(result.name).toBe('Blue Dream');
      expect(result.labName).toBe('Kaycha Labs');
      expect(result.testDate).toEqual(new Date('2025-03-10'));
      expect(result.reportNumber).toBe('RPT-99999');
    });

    it('maps productCode from lot_number', () => {
      const coaProduct = makeCoaProduct({ lot_number: 'LOT-ABC-123' });
      const result = mapCoaToProductFields(coaProduct);
      expect(result.productCode).toBe('LOT-ABC-123');
    });

    it('maps licensedProducer from producer', () => {
      const coaProduct = makeCoaProduct({ producer: 'Aurora Cannabis' });
      const result = mapCoaToProductFields(coaProduct);
      expect(result.licensedProducer).toBe('Aurora Cannabis');
    });

    it('defaults name to "Unknown Product" when name is empty', () => {
      const coaProduct = makeCoaProduct({ name: '' });
      const result = mapCoaToProductFields(coaProduct);
      expect(result.name).toBe('Unknown Product');
    });
  });

  describe('potency extraction', () => {
    it('extracts Total THC and Total CBD from object format { result, unit }', () => {
      const coaProduct = makeCoaProduct({
        test_data: [
          {
            id: 'td-1',
            test_type: 'potency',
            data: {
              'Total THC': { result: '22.5', unit: '%' },
              'Total CBD': { result: '0.3', unit: '%' },
            },
            lab: 'Test Lab',
            test_date: null,
            method: null,
            overall_result: null,
          },
        ],
      });

      const result = mapCoaToProductFields(coaProduct);

      expect(result.thcMin).toBe(22.5);
      expect(result.thcMax).toBe(22.5);
      expect(result.cbdMin).toBe(0.3);
      expect(result.cbdMax).toBe(0.3);
    });

    it('extracts THC from a single plain numeric value (not object)', () => {
      const coaProduct = makeCoaProduct({
        test_data: [
          {
            id: 'td-1',
            test_type: 'potency',
            data: {
              THC: '18.0',
              CBD: '1.2',
            },
            lab: 'Test Lab',
            test_date: null,
            method: null,
            overall_result: null,
          },
        ],
      });

      const result = mapCoaToProductFields(coaProduct);

      expect(result.thcMin).toBe(18.0);
      expect(result.thcMax).toBe(18.0);
      expect(result.cbdMin).toBe(1.2);
      expect(result.cbdMax).toBe(1.2);
    });

    it('extracts range when multiple THC-related entries exist', () => {
      const coaProduct = makeCoaProduct({
        test_data: [
          {
            id: 'td-1',
            test_type: 'potency',
            data: {
              'Total THC': { result: '22.5', unit: '%' },
              'THCA': { result: '25.0', unit: '%' },
              'Total CBD': { result: '0.3', unit: '%' },
              'CBDA': { result: '0.4', unit: '%' },
            },
            lab: 'Test Lab',
            test_date: null,
            method: null,
            overall_result: null,
          },
        ],
      });

      const result = mapCoaToProductFields(coaProduct);

      expect(result.thcMin).toBe(22.5);
      expect(result.thcMax).toBe(25.0);
      expect(result.cbdMin).toBe(0.3);
      expect(result.cbdMax).toBe(0.4);
    });

    it('returns null potency when no potency test data exists', () => {
      const coaProduct = makeCoaProduct({ test_data: [] });
      const result = mapCoaToProductFields(coaProduct);

      expect(result.thcMin).toBeNull();
      expect(result.thcMax).toBeNull();
      expect(result.cbdMin).toBeNull();
      expect(result.cbdMax).toBeNull();
    });

    it('ignores non-numeric potency values', () => {
      const coaProduct = makeCoaProduct({
        test_data: [
          {
            id: 'td-1',
            test_type: 'potency',
            data: {
              'Total THC': { result: 'N/D', unit: '%' },
              'Total CBD': { result: '<LOQ', unit: '%' },
            },
            lab: 'Test Lab',
            test_date: null,
            method: null,
            overall_result: null,
          },
        ],
      });

      const result = mapCoaToProductFields(coaProduct);

      expect(result.thcMin).toBeNull();
      expect(result.thcMax).toBeNull();
      expect(result.cbdMin).toBeNull();
      expect(result.cbdMax).toBeNull();
    });
  });

  describe('terpene extraction', () => {
    it('sorts by value descending and picks top 5 as dominantTerpene', () => {
      const coaProduct = makeCoaProduct({
        test_data: [
          {
            id: 'td-2',
            test_type: 'terpenes',
            data: {
              Myrcene: { result: '1.2', unit: '%' },
              Limonene: { result: '0.8', unit: '%' },
              Linalool: { result: '0.5', unit: '%' },
              Caryophyllene: { result: '0.9', unit: '%' },
              Pinene: { result: '0.3', unit: '%' },
              Humulene: { result: '0.2', unit: '%' },
              Terpinolene: { result: '0.1', unit: '%' },
            },
            lab: 'Test Lab',
            test_date: null,
            method: null,
            overall_result: null,
          },
        ],
      });

      const result = mapCoaToProductFields(coaProduct);

      // Top 5 by value: Myrcene(1.2), Caryophyllene(0.9), Limonene(0.8), Linalool(0.5), Pinene(0.3)
      expect(result.dominantTerpene).toBe('Myrcene; Caryophyllene; Limonene; Linalool; Pinene');
    });

    it('builds highestTerpenes as full breakdown sorted by value', () => {
      const coaProduct = makeCoaProduct({
        test_data: [
          {
            id: 'td-2',
            test_type: 'terpenes',
            data: {
              Myrcene: { result: '1.2', unit: '%' },
              Limonene: { result: '0.8', unit: '%' },
            },
            lab: 'Test Lab',
            test_date: null,
            method: null,
            overall_result: null,
          },
        ],
      });

      const result = mapCoaToProductFields(coaProduct);

      expect(result.highestTerpenes).toBe('Myrcene: 1.2%\nLimonene: 0.8%');
    });

    it('skips total terpene entries and metadata keys', () => {
      const coaProduct = makeCoaProduct({
        test_data: [
          {
            id: 'td-2',
            test_type: 'terpenes',
            data: {
              'Total Terpenes': { result: '3.5', unit: '%' },
              overall_result: 'pass',
              status: 'complete',
              Myrcene: { result: '1.2', unit: '%' },
            },
            lab: 'Test Lab',
            test_date: null,
            method: null,
            overall_result: null,
          },
        ],
      });

      const result = mapCoaToProductFields(coaProduct);

      expect(result.dominantTerpene).toBe('Myrcene');
      expect(result.highestTerpenes).toBe('Myrcene: 1.2%');
    });

    it('returns null terpenes when no terpene data exists', () => {
      const coaProduct = makeCoaProduct({ test_data: [] });
      const result = mapCoaToProductFields(coaProduct);

      expect(result.dominantTerpene).toBeNull();
      expect(result.highestTerpenes).toBeNull();
    });

    it('skips terpenes with zero or negative values', () => {
      const coaProduct = makeCoaProduct({
        test_data: [
          {
            id: 'td-2',
            test_type: 'terpenes',
            data: {
              Myrcene: { result: '0', unit: '%' },
              Limonene: { result: '-0.1', unit: '%' },
            },
            lab: 'Test Lab',
            test_date: null,
            method: null,
            overall_result: null,
          },
        ],
      });

      const result = mapCoaToProductFields(coaProduct);

      expect(result.dominantTerpene).toBeNull();
      expect(result.highestTerpenes).toBeNull();
    });
  });

  describe('strain type normalization', () => {
    it('normalizes "Sativa Dominant" to "Sativa"', () => {
      const coaProduct = makeCoaProduct({ strain_type: 'Sativa Dominant' });
      const result = mapCoaToProductFields(coaProduct);
      expect(result.type).toBe('Sativa');
    });

    it('normalizes "indica" (lowercase) to "Indica"', () => {
      const coaProduct = makeCoaProduct({ strain_type: 'indica' });
      const result = mapCoaToProductFields(coaProduct);
      expect(result.type).toBe('Indica');
    });

    it('normalizes "Hybrid" to "Hybrid"', () => {
      const coaProduct = makeCoaProduct({ strain_type: 'Hybrid' });
      const result = mapCoaToProductFields(coaProduct);
      expect(result.type).toBe('Hybrid');
    });

    it('returns as-is for unrecognized strain types', () => {
      const coaProduct = makeCoaProduct({ strain_type: 'Ruderalis' });
      const result = mapCoaToProductFields(coaProduct);
      expect(result.type).toBe('Ruderalis');
    });

    it('returns null for null strain_type', () => {
      const coaProduct = makeCoaProduct({ strain_type: null });
      const result = mapCoaToProductFields(coaProduct);
      expect(result.type).toBeNull();
    });
  });

  describe('testResults building', () => {
    it('returns null testResults when no test_data', () => {
      const coaProduct = makeCoaProduct({ test_data: [] });
      const result = mapCoaToProductFields(coaProduct);
      expect(result.testResults).toBeNull();
    });

    it('builds testResults keyed by test_type', () => {
      const coaProduct = makeCoaProduct({
        test_data: [
          {
            id: 'td-1',
            test_type: 'potency',
            data: { 'Total THC': { result: '22.5', unit: '%' } },
            lab: 'Kaycha Labs',
            test_date: '2025-03-10',
            method: 'HPLC',
            overall_result: 'pass',
          },
          {
            id: 'td-2',
            test_type: 'terpenes',
            data: { Myrcene: { result: '1.2', unit: '%' } },
            lab: 'Kaycha Labs',
            test_date: '2025-03-10',
            method: 'GC-MS',
            overall_result: 'pass',
          },
        ],
      });

      const result = mapCoaToProductFields(coaProduct);

      expect(result.testResults).toBeDefined();
      expect(result.testResults!.potency).toEqual({
        data: { 'Total THC': { result: '22.5', unit: '%' } },
        lab: 'Kaycha Labs',
        test_date: '2025-03-10',
        method: 'HPLC',
        overall_result: 'pass',
      });
      expect(result.testResults!.terpenes).toEqual({
        data: { Myrcene: { result: '1.2', unit: '%' } },
        lab: 'Kaycha Labs',
        test_date: '2025-03-10',
        method: 'GC-MS',
        overall_result: 'pass',
      });
    });
  });

  describe('missing fields', () => {
    it('returns null for all optional fields when not present', () => {
      const coaProduct = makeCoaProduct({
        name: 'Minimal Product',
        lab: '',
        test_date: null,
        report_number: null,
        strain_type: null,
        lot_number: '',
        producer: null,
        test_data: [],
      });

      const result = mapCoaToProductFields(coaProduct);

      expect(result.name).toBe('Minimal Product');
      expect(result.labName).toBeNull();
      expect(result.testDate).toBeNull();
      expect(result.reportNumber).toBeNull();
      expect(result.type).toBeNull();
      expect(result.productCode).toBeNull();
      expect(result.licensedProducer).toBeNull();
      expect(result.thcMin).toBeNull();
      expect(result.thcMax).toBeNull();
      expect(result.cbdMin).toBeNull();
      expect(result.cbdMax).toBeNull();
      expect(result.dominantTerpene).toBeNull();
      expect(result.highestTerpenes).toBeNull();
      expect(result.testResults).toBeNull();
    });
  });
});
