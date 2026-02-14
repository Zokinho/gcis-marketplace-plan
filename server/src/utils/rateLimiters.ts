import rateLimit from 'express-rate-limit';

/**
 * Write operations limiter (POST/PATCH/DELETE): 30 per minute per IP.
 * Applied at the route handler level for routes that mix reads and writes.
 */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});
