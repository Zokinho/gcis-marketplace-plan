import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import logger from '../utils/logger';

interface RedactionBox {
  page: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  approved: boolean;
}

/**
 * Detect whether a PDF has a text layer (digital) or is image-only (scanned).
 * Heuristic: if any page has text content operators, it's digital.
 */
export async function isDigitalPdf(pdfBuffer: Buffer): Promise<boolean> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (pages.length === 0) return false;

    // Check first page for text operators
    // pdf-lib doesn't expose raw content streams easily, so we use a heuristic:
    // try to extract text from the first page via the page's content stream
    const firstPage = pages[0];
    const { node } = firstPage as any;
    const contents = node?.Contents?.();
    if (!contents) return false;

    // If the page has content streams with text operators (Tj, TJ, Tf), it's digital
    const stream = contents.toString?.() || '';
    return /\b(Tj|TJ|Tf)\b/.test(stream);
  } catch {
    // If we can't determine, assume digital (safer — pdf-lib handles it better)
    return true;
  }
}

/**
 * Convert PDF pages to PNG images at 200 DPI using pdf2pic.
 */
export async function generatePageImages(pdfBuffer: Buffer): Promise<{ images: Buffer[]; pageCount: number }> {
  // Dynamic import pdf2pic (ESM module)
  const { fromBuffer } = await import('pdf2pic');

  const converter = fromBuffer(pdfBuffer, {
    density: 200,
    format: 'png',
    width: 1600,
    height: 2200,
    preserveAspectRatio: true,
  });

  // Get page count from pdf-lib
  let pageCount: number;
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
  } catch {
    // Fallback: try to convert and see how many succeed
    pageCount = 1;
  }

  if (pageCount > 50) {
    logger.warn({ pageCount }, '[COA-REDACT] Large PDF detected, processing all pages');
  }

  const images: Buffer[] = [];
  for (let i = 1; i <= pageCount; i++) {
    try {
      const result = await converter(i, { responseType: 'buffer' });
      if (result.buffer) {
        images.push(result.buffer as Buffer);
      }
    } catch (err) {
      logger.error({ err, page: i }, '[COA-REDACT] Failed to convert page to image');
      // Push a placeholder 1x1 transparent PNG for failed pages
      const placeholder = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
      images.push(placeholder);
    }
  }

  return { images, pageCount };
}

/**
 * Apply redactions to a PDF by rasterizing pages, drawing over redacted regions, and
 * reassembling as an image-only PDF. This destroys the text layer so redacted content
 * cannot be selected or copy-pasted.
 */
export async function applyRedactions(
  pdfBuffer: Buffer,
  regions: RedactionBox[],
): Promise<Buffer> {
  // Filter to approved regions only
  const approved = regions.filter((r) => r.approved);
  if (approved.length === 0) {
    return pdfBuffer; // No redactions needed
  }

  // Group by page
  const byPage = new Map<number, RedactionBox[]>();
  for (const r of approved) {
    const arr = byPage.get(r.page) || [];
    arr.push(r);
    byPage.set(r.page, arr);
  }

  // Always use image-based redaction: rasterize → redact → reassemble.
  // This destroys the text layer so redacted content cannot be copy-pasted.
  // (pdf-lib's drawRectangle only covers text visually — the underlying text remains selectable.)
  return applyImageRedactions(pdfBuffer, byPage);
}

/**
 * Image-based PDF redaction: rasterize → draw white rectangles with sharp → reassemble PDF.
 */
async function applyImageRedactions(
  pdfBuffer: Buffer,
  byPage: Map<number, RedactionBox[]>,
): Promise<Buffer> {
  const { images, pageCount } = await generatePageImages(pdfBuffer);

  // Apply redactions to each page image
  const redactedImages: Buffer[] = [];
  for (let i = 0; i < pageCount; i++) {
    const boxes = byPage.get(i);
    if (!boxes || boxes.length === 0) {
      redactedImages.push(images[i]);
      continue;
    }

    // Get image dimensions
    const metadata = await sharp(images[i]).metadata();
    const imgW = metadata.width || 1600;
    const imgH = metadata.height || 2200;

    // Create white rectangle SVG overlays
    const rects = boxes.map((box) => {
      const x = Math.max(0, Math.round(box.xPct / 100 * imgW));
      const y = Math.max(0, Math.round(box.yPct / 100 * imgH));
      const w = Math.min(imgW - x, Math.round(box.wPct / 100 * imgW));
      const h = Math.min(imgH - y, Math.round(box.hPct / 100 * imgH));
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/>`;
    }).join('');

    const svgOverlay = Buffer.from(
      `<svg width="${imgW}" height="${imgH}">${rects}</svg>`,
    );

    const redacted = await sharp(images[i])
      .composite([{ input: svgOverlay, top: 0, left: 0 }])
      .png()
      .toBuffer();

    redactedImages.push(redacted);
  }

  // Reassemble as PDF
  const newPdf = await PDFDocument.create();
  for (const imgBuf of redactedImages) {
    const pngImage = await newPdf.embedPng(imgBuf);
    const page = newPdf.addPage([pngImage.width, pngImage.height]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pngImage.width,
      height: pngImage.height,
    });
  }

  const pdfBytes = await newPdf.save();
  return Buffer.from(pdfBytes);
}
