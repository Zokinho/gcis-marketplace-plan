import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import logger from '../utils/logger';

const router = Router();
const pageRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── In-memory session store ───
interface CoaSession {
  originalPdf: Buffer;
  pageImages: Buffer[];
  pageCount: number;
  createdAt: number;
}

const sessions = new Map<string, CoaSession>();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);

// ─── POST /upload — Upload PDF, generate page images, return session ───
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate PDF magic bytes
    const header = req.file.buffer.subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      return res.status(400).json({ error: 'File is not a valid PDF' });
    }

    const sessionId = crypto.randomUUID();
    const { generatePageImages } = await import('../services/coaRedactor');

    logger.info({ size: req.file.size, name: req.file.originalname }, '[COA-TOOL] Processing uploaded PDF');
    const { images, pageCount } = await generatePageImages(req.file.buffer);

    sessions.set(sessionId, {
      originalPdf: req.file.buffer,
      pageImages: images,
      pageCount,
      createdAt: Date.now(),
    });

    res.json({ sessionId, pageCount, fileName: req.file.originalname });
  } catch (err) {
    logger.error({ err }, '[COA-TOOL] Upload failed');
    res.status(500).json({ error: 'Failed to process PDF' });
  }
});

// ─── GET /:sessionId/pages/:pageNum — Page images (no auth, session UUID is the secret) ───
pageRouter.get('/:sessionId/pages/:pageNum', (req: Request<{ sessionId: string; pageNum: string }>, res: Response) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session expired or not found' });
  }

  const pageNum = parseInt(req.params.pageNum, 10);
  if (isNaN(pageNum) || pageNum < 0 || pageNum >= session.pageCount) {
    return res.status(400).json({ error: 'Invalid page number' });
  }

  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'private, max-age=1800');
  res.send(session.pageImages[pageNum]);
});

// ─── POST /:sessionId/redact — Apply redactions, return PDF download ───
router.post('/:sessionId/redact', async (req: Request<{ sessionId: string }>, res: Response) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session expired or not found' });
  }

  const { regions } = req.body;
  if (!Array.isArray(regions) || regions.length === 0) {
    return res.status(400).json({ error: 'No redaction regions provided' });
  }

  try {
    const { applyRedactions } = await import('../services/coaRedactor');

    // Mark all regions as approved for the standalone tool
    const approvedRegions = regions.map((r: any) => ({
      page: Number(r.page),
      xPct: Number(r.xPct),
      yPct: Number(r.yPct),
      wPct: Number(r.wPct),
      hPct: Number(r.hPct),
      approved: true,
    }));

    logger.info({ regionCount: approvedRegions.length, sessionId: req.params.sessionId }, '[COA-TOOL] Applying redactions');
    const redactedPdf = await applyRedactions(session.originalPdf, approvedRegions);

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'attachment; filename="redacted.pdf"');
    res.send(redactedPdf);
  } catch (err) {
    logger.error({ err }, '[COA-TOOL] Redaction failed');
    res.status(500).json({ error: 'Failed to apply redactions' });
  }
});

// ─── DELETE /:sessionId — Clean up session ───
router.delete('/:sessionId', (req: Request<{ sessionId: string }>, res: Response) => {
  sessions.delete(req.params.sessionId);
  res.json({ ok: true });
});

export { pageRouter };
export default router;
