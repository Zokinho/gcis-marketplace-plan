import type { CoaProductDetailResponse, CoaTestData } from '../services/coaClient';

/**
 * Maps CoA extraction data to marketplace Product fields.
 * Reference: CoA project's backend/services/publisher.py field patterns.
 */

export interface MappedProductFields {
  name: string;
  labName: string | null;
  testDate: Date | null;
  reportNumber: string | null;
  type: string | null;
  productCode: string | null;
  licensedProducer: string | null;
  thcMin: number | null;
  thcMax: number | null;
  cbdMin: number | null;
  cbdMax: number | null;
  dominantTerpene: string | null;
  highestTerpenes: string | null;
  testResults: Record<string, any> | null;
}

/**
 * Parse a potency section's data dict to extract THC/CBD ranges.
 *
 * Potency data from CoA AI extraction typically looks like:
 * { "Total THC": { "result": "22.5", "unit": "%" }, "Total CBD": { "result": "0.1", "unit": "%" }, ... }
 *
 * Some labs report min/max ranges or just a single value.
 */
function extractPotency(potencyData: Record<string, any>): {
  thcMin: number | null;
  thcMax: number | null;
  cbdMin: number | null;
  cbdMax: number | null;
} {
  let thcMin: number | null = null;
  let thcMax: number | null = null;
  let cbdMin: number | null = null;
  let cbdMax: number | null = null;

  for (const [key, val] of Object.entries(potencyData)) {
    const keyLower = key.toLowerCase();
    const result = typeof val === 'object' && val !== null ? val.result : val;
    const num = parseFloat(String(result));
    if (isNaN(num)) continue;

    if (keyLower.includes('total thc') || keyLower === 'thc' || keyLower.includes('thca')) {
      // Use the highest THC-related value as thcMax
      if (thcMax === null || num > thcMax) thcMax = num;
      if (thcMin === null || num < thcMin) thcMin = num;
    }
    if (keyLower.includes('total cbd') || keyLower === 'cbd' || keyLower.includes('cbda')) {
      if (cbdMax === null || num > cbdMax) cbdMax = num;
      if (cbdMin === null || num < cbdMin) cbdMin = num;
    }
  }

  // If only one value found, set min = max
  if (thcMin !== null && thcMax !== null && thcMin === thcMax) thcMin = thcMax;
  if (cbdMin !== null && cbdMax !== null && cbdMin === cbdMax) cbdMin = cbdMax;

  return { thcMin, thcMax, cbdMin, cbdMax };
}

/**
 * Extract terpene profile from terpene test data.
 *
 * Terpene data typically looks like:
 * { "Myrcene": { "result": "1.2", "unit": "%" }, "Limonene": { "result": "0.8", "unit": "%" }, ... }
 */
function extractTerpenes(terpeneData: Record<string, any>): {
  dominantTerpene: string | null;
  highestTerpenes: string | null;
} {
  const entries: Array<{ name: string; value: number }> = [];

  for (const [key, val] of Object.entries(terpeneData)) {
    // Skip metadata keys
    if (key.toLowerCase().includes('total') && key.toLowerCase().includes('terpene')) continue;
    if (key === 'overall_result' || key === 'status') continue;

    const result = typeof val === 'object' && val !== null ? val.result : val;
    const num = parseFloat(String(result));
    if (isNaN(num) || num <= 0) continue;

    entries.push({ name: key, value: num });
  }

  if (entries.length === 0) return { dominantTerpene: null, highestTerpenes: null };

  // Sort by value descending
  entries.sort((a, b) => b.value - a.value);

  // Top 5 as dominant terpene (semicolon separated, matches Zoho Terpen field format)
  const top5 = entries.slice(0, 5);
  const dominantTerpene = top5.map((e) => e.name).join('; ');

  // Full breakdown as multi-line (matches Zoho Highest_Terpenes format)
  const highestTerpenes = entries
    .map((e) => `${e.name}: ${e.value}%`)
    .join('\n');

  return { dominantTerpene, highestTerpenes };
}

/**
 * Map strain_type values from CoA extraction to marketplace type field.
 * CoA may return various forms; normalize to Sativa/Indica/Hybrid.
 */
function normalizeStrainType(strainType: string | null): string | null {
  if (!strainType) return null;
  const lower = strainType.toLowerCase().trim();
  if (lower.includes('sativa')) return 'Sativa';
  if (lower.includes('indica')) return 'Indica';
  if (lower.includes('hybrid')) return 'Hybrid';
  return strainType; // Return as-is if unrecognized
}

/**
 * Build the complete testResults JSON from all test data sections.
 */
function buildTestResults(testData: CoaTestData[]): Record<string, any> | null {
  if (!testData || testData.length === 0) return null;

  const results: Record<string, any> = {};
  for (const td of testData) {
    results[td.test_type] = {
      data: td.data,
      lab: td.lab,
      test_date: td.test_date,
      method: td.method,
      overall_result: td.overall_result,
    };
  }
  return results;
}

/**
 * Map a CoA product detail response to marketplace Product fields.
 */
export function mapCoaToProductFields(coaProduct: CoaProductDetailResponse): MappedProductFields {
  // Find potency and terpene test data sections
  const potencyTd = coaProduct.test_data?.find((td) => td.test_type === 'potency');
  const terpeneTd = coaProduct.test_data?.find((td) => td.test_type === 'terpenes');

  const potency = potencyTd ? extractPotency(potencyTd.data) : { thcMin: null, thcMax: null, cbdMin: null, cbdMax: null };
  const terpenes = terpeneTd ? extractTerpenes(terpeneTd.data) : { dominantTerpene: null, highestTerpenes: null };

  return {
    name: coaProduct.name || 'Unknown Product',
    labName: coaProduct.lab || null,
    testDate: coaProduct.test_date ? new Date(coaProduct.test_date) : null,
    reportNumber: coaProduct.report_number || null,
    type: normalizeStrainType(coaProduct.strain_type),
    productCode: coaProduct.lot_number || null,
    licensedProducer: coaProduct.producer || null,
    ...potency,
    ...terpenes,
    testResults: buildTestResults(coaProduct.test_data),
  };
}
