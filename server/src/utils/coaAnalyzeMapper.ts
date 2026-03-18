import type { ExtractedCoaData } from '../services/coaExtractor';

/**
 * Normalize a potency value to a percentage.
 * Some CoAs report as decimal fractions (0.1873 = 18.73%), others as percentages (18.73).
 * Heuristic: values < 1 are treated as fractions and multiplied by 100.
 * Result is rounded to 2 decimal places.
 */
function normalizePotencyPct(value: number): string {
  const normalized = value < 1 && value > 0 ? value * 100 : value;
  return String(parseFloat(normalized.toFixed(2)));
}

/**
 * Known terpene names for fuzzy matching against CoA extractions.
 * Duplicated from client/src/lib/terpenes.ts to avoid cross-workspace import.
 * Only the most common ~30 are needed for matching — the client list is exhaustive.
 */
const KNOWN_TERPENES = new Set([
  'Alpha-Bisabolol', 'Alpha-Humulene', 'Alpha-Ocimene', 'Alpha-Phellandrene',
  'Alpha-Pinene', 'Alpha-Terpinene', 'Alpha-Terpineol',
  'Beta-Caryophyllene', 'Beta-Myrcene', 'Beta-Ocimene', 'Beta-Pinene',
  'Bisabolol', 'Borneol', 'Camphene', 'Camphor', 'Carvacrol', 'Carvone',
  'Caryophyllene', 'Caryophyllene Oxide', 'Cedrol',
  'cis-Nerolidol', 'Delta-3-Carene', 'Eucalyptol', 'Farnesene', 'Fenchol',
  'Gamma-Terpinene', 'Geraniol', 'Geranyl Acetate', 'Guaiol', 'Humulene',
  'Isopulegol', 'Limonene', 'Linalool', 'Menthol', 'Myrcene', 'Nerol',
  'Nerolidol', 'Ocimene', 'Phytol', 'Sabinene', 'Terpinen-4-ol',
  'Terpineol', 'Terpinolene', 'trans-Nerolidol', 'Valencene',
]);

/**
 * Build a lowercase → proper-case lookup for matching.
 */
const TERPENE_LOOKUP = new Map<string, string>();
for (const t of KNOWN_TERPENES) {
  TERPENE_LOOKUP.set(t.toLowerCase(), t);
  // Also index without prefix: "myrcene" → "Beta-Myrcene", "pinene" → "Alpha-Pinene"
  const base = t.replace(/^(alpha|beta|gamma|delta|cis|trans|d)-?/i, '').trim().toLowerCase();
  if (base && !TERPENE_LOOKUP.has(base)) {
    TERPENE_LOOKUP.set(base, t);
  }
}

/**
 * Form-compatible fields returned by the analyze endpoint.
 */
export interface AnalyzedCoaFields {
  name: string | null;
  category: string | null;
  type: string | null;
  licensedProducer: string | null;
  thc: string | null;
  cbd: string | null;
  totalTerpenePercent: string | null;
  terpenes: string[];
  terpenePercentages: Record<string, string>;
  labName: string | null;
  testDate: string | null;
  reportNumber: string | null;
  lotNumber: string | null;
  testResults: Record<string, any> | null;
  fieldsExtracted: number;
}

/**
 * Map product_form from CoA extraction to marketplace CATEGORIES.
 * Returns the best matching category string, or null if no confident match.
 */
const FORM_TO_CATEGORY: Record<string, string> = {
  'dried flower':      'Cannabis flowers (mix sizes)',
  'flower':            'Cannabis flowers (mix sizes)',
  'milled flower':     'Milled Flower',
  'milled':            'Milled Flower',
  'fresh frozen':      'Cannabis flowers (fresh frozen)',
  'trim':              'Cannabis trimmings',
  'trimming':          'Cannabis trimmings',
  'kief':              'Cannabis kief',
  'hash':              'Cannabis hash',
  'hashish':           'Cannabis hashish',
  'rosin':             'Cannabis cured rosins and cured resins',
  'resin':             'Cannabis cured rosins and cured resins',
  'cured rosin':       'Cannabis cured rosins and cured resins',
  'cured resin':       'Cannabis cured rosins and cured resins',
  'live rosin':        'Cannabis live rosin and live resin',
  'live resin':        'Cannabis live rosin and live resin',
  'isolate':           'Cannabinoid isolates',
  'distillate':        'Cannabinoid distillates',
  'crude oil':         "Cannabis crude oils ('resins')",
  'crude':             "Cannabis crude oils ('resins')",
  'edible':            'Edibles (others)',
  'chocolate':         'Chocolates',
  'gummy':             'Gummies',
  'gummies':           'Gummies',
  'genetics':          'Genetics',
};

function inferCategory(productForm: string | null): string | null {
  if (!productForm) return null;
  const lower = productForm.toLowerCase().trim();

  // Direct match
  if (FORM_TO_CATEGORY[lower]) return FORM_TO_CATEGORY[lower];

  // Partial match — check if any key is contained in the value
  for (const [key, cat] of Object.entries(FORM_TO_CATEGORY)) {
    if (lower.includes(key)) return cat;
  }

  return null;
}

/**
 * Normalize strain type to one of the accepted form values.
 */
function normalizeStrainType(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower.includes('sativa')) return 'Sativa';
  if (lower.includes('indica')) return 'Indica';
  if (lower.includes('hybrid')) return 'Hybrid';
  return null; // Don't pass through unknown strain types — must be one of the three
}

/**
 * Try to match a CoA terpene name to our known terpene list.
 * Returns the canonical name or the original if no match.
 */
function matchTerpene(rawName: string): string {
  const lower = rawName.toLowerCase().trim();
  // Direct match
  const direct = TERPENE_LOOKUP.get(lower);
  if (direct) return direct;

  // Partial match: strip common prefixes/suffixes
  const simplified = lower
    .replace(/^(alpha|beta|gamma|delta|cis|trans|d|dl)-?\s*/i, '')
    .replace(/\s*\(.*\)$/, '')
    .trim();
  const partial = TERPENE_LOOKUP.get(simplified);
  if (partial) return partial;

  // Title-case the original as fallback
  return rawName.split(/[\s-]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');
}

/**
 * Map Anthropic extraction result to form-compatible fields.
 */
export function mapExtractedToFormFields(data: ExtractedCoaData): AnalyzedCoaFields {
  let fieldsExtracted = 0;

  // Name
  const name = data.product_name?.trim() || null;
  if (name) fieldsExtracted++;

  // Category (inferred from product_form)
  const category = inferCategory(data.product_form);
  if (category) fieldsExtracted++;

  // Type
  const type = normalizeStrainType(data.strain_type);
  if (type) fieldsExtracted++;

  // Producer
  const licensedProducer = data.producer?.trim() || null;
  if (licensedProducer) fieldsExtracted++;

  // THC — normalize fraction vs percentage (0.245 → 24.5, 24.5 → 24.5)
  let thc: string | null = null;
  if (data.potency?.total_thc_pct != null) {
    thc = normalizePotencyPct(Number(data.potency.total_thc_pct));
    fieldsExtracted++;
  } else if (data.potency?.cannabinoids) {
    // Fallback: look for "Total THC" or "THC" in cannabinoids
    for (const [key, val] of Object.entries(data.potency.cannabinoids)) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes('total thc') || keyLower === 'thc') {
        const num = parseFloat(val.result);
        if (!isNaN(num)) {
          thc = normalizePotencyPct(num);
          fieldsExtracted++;
          break;
        }
      }
    }
  }

  // CBD — normalize fraction vs percentage, default to "0" when potency exists but no CBD detected
  let cbd: string | null = null;
  if (data.potency?.total_cbd_pct != null) {
    cbd = normalizePotencyPct(Number(data.potency.total_cbd_pct));
    fieldsExtracted++;
  } else if (data.potency?.cannabinoids) {
    let foundCbd = false;
    for (const [key, val] of Object.entries(data.potency.cannabinoids)) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes('total cbd') || keyLower === 'cbd' || keyLower.includes('cannabidiol')) {
        const num = parseFloat(val.result);
        if (!isNaN(num)) {
          cbd = normalizePotencyPct(num);
          fieldsExtracted++;
          foundCbd = true;
          break;
        }
      }
    }
    // If potency data exists but no CBD was found, it's effectively 0
    if (!foundCbd && data.potency?.total_thc_pct != null) {
      cbd = '0';
      fieldsExtracted++;
    }
  } else if (data.potency?.total_thc_pct != null) {
    // Potency exists but no cannabinoid breakdown — CBD is effectively 0
    cbd = '0';
    fieldsExtracted++;
  }

  // Terpenes
  const terpenes: string[] = [];
  const terpenePercentages: Record<string, string> = {};
  if (data.terpenes?.individual) {
    const entries: Array<{ name: string; value: number }> = [];
    for (const [rawName, val] of Object.entries(data.terpenes.individual)) {
      const num = parseFloat(val.result);
      if (isNaN(num) || num <= 0) continue;
      const matched = matchTerpene(rawName);
      entries.push({ name: matched, value: num });
    }
    // Sort by value descending
    entries.sort((a, b) => b.value - a.value);
    for (const e of entries) {
      terpenes.push(e.name);
      terpenePercentages[e.name] = String(parseFloat(e.value.toFixed(2)));
    }
    if (terpenes.length > 0) fieldsExtracted++;
  }

  // Total terpene percent
  let totalTerpenePercent: string | null = null;
  if (data.terpenes?.total_pct != null) {
    totalTerpenePercent = String(parseFloat(Number(data.terpenes.total_pct).toFixed(2)));
  } else if (terpenes.length > 0) {
    // Sum individual terpene percentages as fallback
    const sum = Object.values(terpenePercentages).reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
    if (sum > 0) totalTerpenePercent = String(parseFloat(sum.toFixed(2)));
  }

  // Lab
  const labName = data.lab?.trim() || null;
  if (labName) fieldsExtracted++;

  // Test date
  let testDate: string | null = null;
  if (data.test_date) {
    // Ensure YYYY-MM-DD format
    const dateStr = data.test_date.trim();
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      testDate = parsed.toISOString().split('T')[0];
      fieldsExtracted++;
    }
  }

  // Report number
  const reportNumber = data.report_number?.trim() || null;
  if (reportNumber) fieldsExtracted++;

  // Lot number
  const lotNumber = data.lot_number?.trim() || null;
  if (lotNumber) fieldsExtracted++;

  // Test results — full structured data for product storage
  const testResults = buildTestResults(data);

  return {
    name,
    category,
    type,
    licensedProducer,
    thc,
    cbd,
    totalTerpenePercent,
    terpenes,
    terpenePercentages,
    labName,
    testDate,
    reportNumber,
    lotNumber,
    testResults,
    fieldsExtracted,
  };
}

/**
 * Build a structured testResults JSON from the full extraction.
 * Stored on the Product for display by TestResultsDisplay component.
 */
function buildTestResults(data: ExtractedCoaData): Record<string, any> | null {
  const results: Record<string, any> = {};

  if (data.potency?.cannabinoids && Object.keys(data.potency.cannabinoids).length > 0) {
    results.potency = {
      data: data.potency.cannabinoids,
      lab: data.lab || null,
      test_date: data.test_date || null,
    };
  }

  if (data.terpenes?.individual && Object.keys(data.terpenes.individual).length > 0) {
    results.terpenes = {
      data: data.terpenes.individual,
      lab: data.lab || null,
      test_date: data.test_date || null,
    };
  }

  if (data.microbial && Object.keys(data.microbial).length > 0) {
    results.microbial = { data: data.microbial };
  }
  if (data.pesticides && Object.keys(data.pesticides).length > 0) {
    results.pesticides = { data: data.pesticides };
  }
  if (data.heavy_metals && Object.keys(data.heavy_metals).length > 0) {
    results.heavy_metals = { data: data.heavy_metals };
  }
  if (data.residual_solvents && Object.keys(data.residual_solvents).length > 0) {
    results.residual_solvents = { data: data.residual_solvents };
  }
  if (data.mycotoxins && Object.keys(data.mycotoxins).length > 0) {
    results.mycotoxins = { data: data.mycotoxins };
  }
  if (data.moisture) {
    results.moisture = { data: { moisture: data.moisture } };
  }

  return Object.keys(results).length > 0 ? results : null;
}
