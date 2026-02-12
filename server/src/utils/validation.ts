import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

/**
 * Express middleware factory: validates req.body against a Zod schema.
 * On failure, returns 400 with structured error messages.
 */
export function validate<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    req.body = result.data;
    next();
  };
}

// ─── Bid schemas ───

export const createBidSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  pricePerUnit: z.coerce.number().positive('pricePerUnit must be positive'),
  quantity: z.coerce.number().positive('quantity must be positive'),
  notes: z.string().max(1000).optional(),
});

// ─── Listing schemas ───

export const updateListingSchema = z.object({
  pricePerUnit: z.coerce.number().positive().optional(),
  gramsAvailable: z.coerce.number().min(0).optional(),
  upcomingQty: z.coerce.number().min(0).optional(),
  minQtyRequest: z.coerce.number().min(0).optional(),
  description: z.string().max(5000).optional(),
}).superRefine((data, ctx) => {
  if (Object.values(data).every((v) => v === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one field must be provided' });
  }
});

// ─── Admin schemas ───

export const approveUserSchema = z.object({
  contactType: z.string().optional(),
});

export const adminCoaConfirmSchema = z.object({
  syncRecordId: z.string().min(1, 'syncRecordId is required'),
  sellerId: z.string().min(1, 'sellerId is required'),
  overrides: z.record(z.string(), z.unknown()).optional(),
});

export const adminCoaDismissSchema = z.object({
  syncRecordId: z.string().min(1, 'syncRecordId is required'),
});

export const syncNowSchema = z.object({
  type: z.enum(['products', 'products-delta', 'contacts']).optional(),
});

// ─── Bid accept/reject/outcome schemas ───

export const bidOutcomeSchema = z.object({
  actualQuantityDelivered: z.coerce.number().min(0).optional(),
  deliveryOnTime: z.boolean().optional(),
  qualityAsExpected: z.boolean().optional(),
  outcomeNotes: z.string().max(2000).optional(),
});

// ─── Share schemas ───

export const createShareSchema = z.object({
  label: z.string().min(1).max(200),
  productIds: z.array(z.string().min(1)).min(1, 'At least one product required'),
  expiresAt: z.string().datetime().optional(),
});

export const updateShareSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  productIds: z.array(z.string().min(1)).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

// ─── Seller share link schema ───

export const createSellerShareSchema = z.object({
  label: z.string().max(200).optional(),
  productIds: z.array(z.string()).optional(),
  expiresInDays: z.coerce.number().int().positive().max(365).optional(),
});
