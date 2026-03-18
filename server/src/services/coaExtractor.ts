import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger';

/**
 * Structured extraction result from a CoA PDF via Anthropic API.
 * Only listing-relevant fields — no company name, no QR codes, no redaction.
 */
export interface RedactionRegionRaw {
  page: number;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractedCoaData {
  product_name: string | null;
  strain_type: string | null;
  product_form: string | null;
  lot_number: string | null;
  producer: string | null;
  lab: string | null;
  test_date: string | null;
  report_number: string | null;
  compliance_status: string | null;
  potency: {
    total_thc_pct: number | null;
    total_cbd_pct: number | null;
    cannabinoids: Record<string, { result: string; unit: string }>;
  } | null;
  terpenes: {
    total_pct: number | null;
    individual: Record<string, { result: string; unit: string }>;
  } | null;
  microbial: Record<string, any> | null;
  pesticides: Record<string, any> | null;
  heavy_metals: Record<string, any> | null;
  residual_solvents: Record<string, any> | null;
  mycotoxins: Record<string, any> | null;
  moisture: { result: string; unit: string } | null;
  methodologies: string[] | null;
  accreditations: string[] | null;
  redaction_regions: RedactionRegionRaw[];
}

const EXTRACTION_PROMPT = `You are a specialist in analyzing Cannabis Certificates of Analysis (CoA) PDFs.

Extract ALL data from this CoA into structured JSON. Return ONLY a JSON object (no markdown fences, no commentary).

Required schema:
{
  "product_name": "string or null",
  "strain_type": "Sativa | Indica | Hybrid | null",
  "product_form": "one of: dried flower | milled flower | fresh frozen | trim | kief | hash | rosin | resin | live rosin | live resin | isolate | distillate | crude oil | edible | chocolate | gummy | genetics | null",
  "lot_number": "string or null",
  "producer": "licensed producer / cultivator name or null",
  "lab": "testing laboratory name or null",
  "test_date": "YYYY-MM-DD or null",
  "report_number": "string or null",
  "compliance_status": "pass | fail | conditional | null",
  "potency": {
    "total_thc_pct": number or null,
    "total_cbd_pct": number or null,
    "cannabinoids": { "<name>": { "result": "string", "unit": "%" } }
  },
  "terpenes": {
    "total_pct": number or null,
    "individual": { "<name>": { "result": "string", "unit": "%" } }
  },
  "microbial": { "<test>": { "result": "string", "status": "pass|fail" } } or null,
  "pesticides": { "<compound>": { "result": "string", "unit": "string", "status": "pass|fail" } } or null,
  "heavy_metals": { "<metal>": { "result": "string", "unit": "string", "status": "pass|fail" } } or null,
  "residual_solvents": { "<solvent>": { "result": "string", "unit": "string", "status": "pass|fail" } } or null,
  "mycotoxins": { "<toxin>": { "result": "string", "unit": "string", "status": "pass|fail" } } or null,
  "moisture": { "result": "string", "unit": "%" } or null,
  "methodologies": ["string"] or null,
  "accreditations": ["string"] or null
}

Rules:
- For numeric fields, extract the number only (e.g. "22.5" not "22.5%")
- For strain_type, normalize to Sativa/Indica/Hybrid if possible. Infer from the product name if not explicitly stated (e.g. "Pink Kush" is Indica, "Sour Diesel" is Sativa)
- For product_form, infer from the product type, sample description, or testing category if not explicitly labeled
- If a section is not present in the document, set it to null
- Do NOT invent data — only extract what is explicitly stated or can be confidently inferred
- Return valid JSON only, no additional text

Also identify ANY client/buyer information that should be redacted before this CoA is shared publicly:
- Client company name, address, account numbers, license numbers, PO numbers
- "Submitted By", "Ship To", "Bill To" information
- Client contact names, phone numbers, emails
- ALL QR codes and barcodes (these often encode client info)
- Include the field LABELS in the redaction region (e.g. "Client:", "Name:", "Submitted By:", "Ship To:", "Account #:") — redact both the label AND the value together as one region so no trace remains

Do NOT flag: laboratory info, product name, lot number, test results, report numbers, dates, lab logos.

For each region, return a tight bounding box as percentages of the VISIBLE page dimensions (0-100).

Coordinate system:
- Origin is TOP-LEFT corner of the page as visually rendered
- x_pct = distance from LEFT edge (0 = left margin, 100 = right margin)
- y_pct = distance from TOP edge (0 = top of page, 100 = bottom of page)
- w_pct = width of box, h_pct = height of box
- The box must tightly wrap the ACTUAL TEXT to be redacted — y_pct should be the TOP of the first line of text being redacted, and y_pct + h_pct should be the BOTTOM of the last line
- Do NOT place the box on nearby headers, test results, or product info — only on the client information itself
- Add ~1% margin on all sides for clean coverage

IMPORTANT: Check EVERY page of the document for client info. Do not skip any pages.

Add a "redaction_regions" array to your JSON response:
[{ "page": 0, "x_pct": 5.0, "y_pct": 25.0, "w_pct": 40, "h_pct": 15, "reason": "Client company name, address, contact, phone, email", "confidence": "high" }]
Return empty array if no client information found.`;

/**
 * Extract structured data from a CoA PDF using the Anthropic API.
 * Uses native PDF support (base64 document content block).
 */
export async function extractCoaData(pdfBuffer: Buffer): Promise<ExtractedCoaData> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const client = new Anthropic({
    apiKey,
    defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25' },
  });
  const base64Pdf = pdfBuffer.toString('base64');

  const apiParams = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 24576,
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'document' as const,
            source: {
              type: 'base64' as const,
              media_type: 'application/pdf' as const,
              data: base64Pdf,
            },
          },
          {
            type: 'text' as const,
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  };

  // Use streaming to avoid the SDK's 10-minute timeout restriction on large max_tokens
  async function streamToText(params: typeof apiParams): Promise<string> {
    const stream = client.messages.stream(params);
    let text = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text;
      }
    }
    return text;
  }

  // Retry once on transient Anthropic errors (500, 529, network issues)
  let responseText: string;
  try {
    responseText = await streamToText(apiParams);
  } catch (firstErr: any) {
    const status = firstErr?.status;
    if (status === 500 || status === 529 || status === 503) {
      logger.warn({ status }, '[COA-EXTRACT] Anthropic API transient error, retrying in 2s...');
      await new Promise((r) => setTimeout(r, 2000));
      responseText = await streamToText(apiParams);
    } else {
      throw firstErr;
    }
  }

  if (!responseText) {
    logger.warn('[COA-EXTRACT] Empty response from Anthropic');
    return emptyExtraction();
  }

  return parseExtractionResponse(responseText);
}

/**
 * Parse the JSON response from Claude, stripping markdown fences if present.
 */
export function parseExtractionResponse(text: string): ExtractedCoaData {
  let jsonStr = text.trim();

  // Strip markdown code fences — handle both complete (```...```) and truncated (```... no closing)
  if (jsonStr.startsWith('```')) {
    // Remove opening fence line
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
    // Remove closing fence if present
    jsonStr = jsonStr.replace(/\n?\s*```\s*$/, '');
    jsonStr = jsonStr.trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    // Ensure redaction_regions is always an array
    if (!Array.isArray(parsed.redaction_regions)) {
      parsed.redaction_regions = [];
    }
    return parsed as ExtractedCoaData;
  } catch (err) {
    // If JSON is truncated (output cut off), try to salvage by closing open braces
    const salvaged = salvageTruncatedJson(jsonStr);
    if (salvaged) {
      logger.info('[COA-EXTRACT] Salvaged truncated JSON response');
      return salvaged as ExtractedCoaData;
    }
    logger.warn({ raw: jsonStr.slice(0, 500) }, '[COA-EXTRACT] Failed to parse JSON response');
    return emptyExtraction();
  }
}

/**
 * Attempt to fix truncated JSON by closing open braces/brackets.
 * This handles the common case where max_tokens cuts off the response mid-JSON.
 */
function salvageTruncatedJson(jsonStr: string): Record<string, any> | null {
  // Remove any trailing partial key-value (after last comma or opening brace)
  let trimmed = jsonStr.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, '');
  if (trimmed === jsonStr) {
    // Try removing a trailing partial value
    trimmed = jsonStr.replace(/,\s*$/, '');
  }

  // Count unclosed braces/brackets and close them
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of trimmed) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  let closed = trimmed;
  for (let i = 0; i < brackets; i++) closed += ']';
  for (let i = 0; i < braces; i++) closed += '}';

  try {
    return JSON.parse(closed);
  } catch {
    return null;
  }
}

function emptyExtraction(): ExtractedCoaData {
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
  };
}
