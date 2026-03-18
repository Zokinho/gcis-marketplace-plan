import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseExtractionResponse, extractCoaData } from '../services/coaExtractor';
import Anthropic from '@anthropic-ai/sdk';

describe('parseExtractionResponse', () => {
  it('parses clean JSON', () => {
    const json = JSON.stringify({
      product_name: 'Pink Kush',
      strain_type: 'Indica',
      lot_number: 'LOT-001',
      producer: 'ACME Cannabis',
      lab: 'Kaycha Labs',
      test_date: '2025-06-15',
      report_number: 'RPT-12345',
      compliance_status: 'pass',
      potency: { total_thc_pct: 24.5, total_cbd_pct: 0.3, cannabinoids: {} },
      terpenes: null,
      microbial: null,
      pesticides: null,
      heavy_metals: null,
      residual_solvents: null,
      mycotoxins: null,
      moisture: null,
      methodologies: null,
      accreditations: null,
    });

    const result = parseExtractionResponse(json);
    expect(result.product_name).toBe('Pink Kush');
    expect(result.strain_type).toBe('Indica');
    expect(result.potency?.total_thc_pct).toBe(24.5);
    expect(result.producer).toBe('ACME Cannabis');
  });

  it('strips markdown JSON fences', () => {
    const json = '```json\n{"product_name":"Blue Dream","strain_type":"Hybrid","lot_number":null,"producer":null,"lab":null,"test_date":null,"report_number":null,"compliance_status":null,"potency":null,"terpenes":null,"microbial":null,"pesticides":null,"heavy_metals":null,"residual_solvents":null,"mycotoxins":null,"moisture":null,"methodologies":null,"accreditations":null}\n```';
    const result = parseExtractionResponse(json);
    expect(result.product_name).toBe('Blue Dream');
    expect(result.strain_type).toBe('Hybrid');
  });

  it('strips generic markdown fences', () => {
    const json = '```\n{"product_name":"OG Kush","strain_type":null,"lot_number":null,"producer":null,"lab":null,"test_date":null,"report_number":null,"compliance_status":null,"potency":null,"terpenes":null,"microbial":null,"pesticides":null,"heavy_metals":null,"residual_solvents":null,"mycotoxins":null,"moisture":null,"methodologies":null,"accreditations":null}\n```';
    const result = parseExtractionResponse(json);
    expect(result.product_name).toBe('OG Kush');
  });

  it('returns empty extraction for malformed JSON', () => {
    const result = parseExtractionResponse('This is not JSON at all');
    expect(result.product_name).toBeNull();
    expect(result.potency).toBeNull();
    expect(result.terpenes).toBeNull();
  });

  it('returns empty extraction for empty string', () => {
    const result = parseExtractionResponse('');
    expect(result.product_name).toBeNull();
  });

  it('handles partial JSON with missing fields', () => {
    const json = JSON.stringify({
      product_name: 'Test Product',
      // Missing most fields — still valid JSON
    });
    const result = parseExtractionResponse(json);
    expect(result.product_name).toBe('Test Product');
    // Undefined fields (not null) but still valid
    expect(result.potency).toBeUndefined();
  });
});

describe('extractCoaData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    await expect(extractCoaData(Buffer.from('fake pdf'))).rejects.toThrow('ANTHROPIC_API_KEY not configured');

    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('calls Anthropic API and parses response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const mockResponse = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          product_name: 'Test Strain',
          strain_type: 'Sativa',
          lot_number: 'L123',
          producer: 'Test LP',
          lab: 'Test Lab',
          test_date: '2025-01-01',
          report_number: 'R001',
          compliance_status: 'pass',
          potency: { total_thc_pct: 20.0, total_cbd_pct: 1.0, cannabinoids: {} },
          terpenes: null,
          microbial: null,
          pesticides: null,
          heavy_metals: null,
          residual_solvents: null,
          mycotoxins: null,
          moisture: null,
          methodologies: null,
          accreditations: null,
        }),
      }],
    };

    const responseText = mockResponse.content[0].text;
    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: responseText } };
      },
    };
    const mockStreamFn = vi.fn().mockReturnValue(mockStream);
    vi.mocked(Anthropic).mockImplementation(function(this: any) {
      this.messages = { stream: mockStreamFn };
    } as any);

    const result = await extractCoaData(Buffer.from('fake pdf data'));
    expect(result.product_name).toBe('Test Strain');
    expect(result.potency?.total_thc_pct).toBe(20.0);
    expect(mockStreamFn).toHaveBeenCalledTimes(1);

    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns empty extraction when API returns no text block', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    // Stream returns no text — empty response
    const mockStream = {
      async *[Symbol.asyncIterator]() {
        // no events yielded
      },
    };
    const mockStreamFn = vi.fn().mockReturnValue(mockStream);
    vi.mocked(Anthropic).mockImplementation(function(this: any) {
      this.messages = { stream: mockStreamFn };
    } as any);

    const result = await extractCoaData(Buffer.from('fake pdf'));
    expect(result.product_name).toBeNull();
    expect(result.potency).toBeNull();

    delete process.env.ANTHROPIC_API_KEY;
  });
});
