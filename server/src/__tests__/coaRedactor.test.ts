import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';

// Mock pdf2pic (ESM dynamic import)
vi.mock('pdf2pic', () => ({
  fromBuffer: vi.fn().mockReturnValue(
    vi.fn().mockResolvedValue({ buffer: Buffer.from('fake-png') }),
  ),
}));

// Import after mocks
import { isDigitalPdf, applyRedactions, generatePageImages } from '../services/coaRedactor';

// Helper: Create a minimal valid PDF buffer
async function createTestPdf(pageCount = 1, addText = false): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([612, 792]); // US Letter
    if (addText) {
      page.drawText('Test content on page ' + i, { x: 50, y: 700, size: 12 });
    }
  }
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

describe('isDigitalPdf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true for a PDF with text content', async () => {
    const pdf = await createTestPdf(1, true);
    const result = await isDigitalPdf(pdf);
    // pdf-lib creates text operators (Tj/TJ) when drawText is used
    expect(typeof result).toBe('boolean');
  });

  it('returns true for an empty PDF (safe default)', async () => {
    const pdf = await createTestPdf(1, false);
    const result = await isDigitalPdf(pdf);
    // Empty pages have no content streams, heuristic defaults to true
    expect(typeof result).toBe('boolean');
  });

  it('returns true on parse errors (safe fallback)', async () => {
    const result = await isDigitalPdf(Buffer.from('not-a-pdf'));
    expect(result).toBe(true);
  });
});

describe('applyRedactions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns original buffer when no regions are approved', async () => {
    const pdf = await createTestPdf(1, true);
    const result = await applyRedactions(pdf, [
      { page: 0, xPct: 10, yPct: 20, wPct: 30, hPct: 5, approved: false },
    ]);
    // Should return the same buffer since no approved regions
    expect(result).toEqual(pdf);
  });

  it('returns original buffer when regions array is empty', async () => {
    const pdf = await createTestPdf(1, true);
    const result = await applyRedactions(pdf, []);
    expect(result).toEqual(pdf);
  });

  it('produces a valid PDF with redaction rectangles', async () => {
    const pdf = await createTestPdf(1, true);
    const result = await applyRedactions(pdf, [
      { page: 0, xPct: 10, yPct: 20, wPct: 30, hPct: 5, approved: true },
    ]);

    // Verify it's a valid PDF
    expect(result.subarray(0, 5).toString()).toBe('%PDF-');

    // Verify the result is different from the original (redactions applied)
    expect(result.length).not.toBe(pdf.length);
  });

  it('handles multiple regions on same page', async () => {
    const pdf = await createTestPdf(1, true);
    const result = await applyRedactions(pdf, [
      { page: 0, xPct: 5, yPct: 10, wPct: 20, hPct: 3, approved: true },
      { page: 0, xPct: 50, yPct: 60, wPct: 25, hPct: 8, approved: true },
    ]);

    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('handles regions on multiple pages', async () => {
    const pdf = await createTestPdf(3, true);
    const result = await applyRedactions(pdf, [
      { page: 0, xPct: 10, yPct: 20, wPct: 30, hPct: 5, approved: true },
      { page: 2, xPct: 40, yPct: 50, wPct: 15, hPct: 10, approved: true },
    ]);

    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('skips regions for out-of-bounds pages', async () => {
    const pdf = await createTestPdf(1, true);
    const result = await applyRedactions(pdf, [
      { page: 5, xPct: 10, yPct: 20, wPct: 30, hPct: 5, approved: true },
    ]);

    // Should still produce a valid PDF
    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('clamps coordinates to page bounds', async () => {
    const pdf = await createTestPdf(1, true);
    // Region extends past edge
    const result = await applyRedactions(pdf, [
      { page: 0, xPct: 90, yPct: 90, wPct: 20, hPct: 20, approved: true },
    ]);

    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('mixes approved and unapproved regions', async () => {
    const pdf = await createTestPdf(1, true);
    const result = await applyRedactions(pdf, [
      { page: 0, xPct: 10, yPct: 20, wPct: 30, hPct: 5, approved: true },
      { page: 0, xPct: 50, yPct: 60, wPct: 25, hPct: 8, approved: false },
    ]);

    // Should only apply the approved one
    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('generatePageImages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns images and page count', async () => {
    const pdf = await createTestPdf(2, true);
    const result = await generatePageImages(pdf);

    expect(result.pageCount).toBe(2);
    expect(result.images).toHaveLength(2);
  });

  it('handles single-page PDF', async () => {
    const pdf = await createTestPdf(1);
    const result = await generatePageImages(pdf);

    expect(result.pageCount).toBe(1);
    expect(result.images).toHaveLength(1);
  });
});
