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

/**
 * Express middleware factory: validates req.query against a Zod schema.
 * Coerces query string values via Zod `.coerce` and applies defaults.
 */
export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    (req as any).query = result.data;
    next();
  };
}

/**
 * Express middleware factory: validates req.params against a Zod schema.
 */
export function validateParams<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    (req as any).params = result.data;
    next();
  };
}

// ─── Reusable building blocks ───

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

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
  certification: z.string().max(200).optional(),
  dominantTerpene: z.string().max(500).optional(),
  totalTerpenePercent: z.coerce.number().min(0).max(100).optional(),
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

// ─── Marketplace schemas ───

export const marketplaceQuerySchema = paginationQuery.extend({
  search: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  type: z.string().max(100).optional(),
  certification: z.string().max(200).optional(),
  terpene: z.string().max(200).optional(),
  thcMin: z.coerce.number().min(0).max(100).optional(),
  thcMax: z.coerce.number().min(0).max(100).optional(),
  cbdMin: z.coerce.number().min(0).max(100).optional(),
  cbdMax: z.coerce.number().min(0).max(100).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  availability: z.enum(['in_stock', 'upcoming']).optional(),
  cbdThcRatio: z.string().regex(/^\d+:\d+$/).optional(),
  ratioTolerance: z.coerce.number().min(0).max(100).optional(),
  sort: z.enum(['name', 'pricePerUnit', 'thcMax', 'cbdMax', 'gramsAvailable', 'createdAt', 'relevance']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// ─── Notification schemas ───

export const notificationListSchema = paginationQuery.extend({
  unreadOnly: z.enum(['true', 'false']).default('false'),
});

export const markReadSchema = z.union([
  z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);

export const notificationPrefsSchema = z.object({
  BID_RECEIVED: z.boolean().optional(),
  BID_ACCEPTED: z.boolean().optional(),
  BID_REJECTED: z.boolean().optional(),
  BID_COUNTERED: z.boolean().optional(),
  BID_OUTCOME: z.boolean().optional(),
  PRODUCT_NEW: z.boolean().optional(),
  PRODUCT_PRICE: z.boolean().optional(),
  PRODUCT_STOCK: z.boolean().optional(),
  MATCH_SUGGESTION: z.boolean().optional(),
  COA_PROCESSED: z.boolean().optional(),
  PREDICTION_DUE: z.boolean().optional(),
  SHORTLIST_PRICE_DROP: z.boolean().optional(),
  SYSTEM_ANNOUNCEMENT: z.boolean().optional(),
}).strict();

export const broadcastSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
});

// ─── CoA confirm schema ───

export const coaConfirmBodySchema = z.object({
  sellerId: z.string().min(1).optional(),
  overrides: z.object({
    name: z.string().max(300).optional(),
    category: z.string().max(100).optional(),
    type: z.string().max(100).optional(),
    description: z.string().max(5000).optional(),
    thcMin: z.coerce.number().min(0).max(100).optional(),
    thcMax: z.coerce.number().min(0).max(100).optional(),
    cbdMin: z.coerce.number().min(0).max(100).optional(),
    cbdMax: z.coerce.number().min(0).max(100).optional(),
    pricePerUnit: z.coerce.number().min(0).optional(),
    gramsAvailable: z.coerce.number().min(0).optional(),
  }).optional(),
});

// ─── Intelligence schemas ───

export const intelMatchesQuerySchema = paginationQuery.extend({
  minScore: z.coerce.number().min(0).max(100).default(0),
  status: z.string().max(50).optional(),
  category: z.string().max(100).optional(),
});

export const intelPredictionsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['upcoming', 'overdue']).optional(),
});

export const intelChurnQuerySchema = z.object({
  minRiskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const intelTransactionsQuerySchema = paginationQuery.extend({
  status: z.string().max(50).optional(),
});

export const generateMatchesBodySchema = z.object({
  productId: z.string().min(1).optional(),
});

export const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

// ─── Bid list query schema ───

export const bidListQuerySchema = paginationQuery.extend({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'EXPIRED']).optional(),
});

// ─── Admin users query schema ───

export const adminUsersQuerySchema = z.object({
  filter: z.enum(['pending', 'approved', 'rejected', 'all']).default('all'),
});

// ─── Audit log query schema ───

export const auditLogQuerySchema = paginationQuery.extend({
  action: z.string().max(50).optional(),
  actorId: z.string().max(50).optional(),
  targetType: z.string().max(50).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ─── Shortlist schemas ───

export const shortlistToggleSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
});

export const shortlistQuerySchema = paginationQuery.extend({
  category: z.string().max(100).optional(),
  sort: z.enum(['date', 'name', 'price']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const shortlistCheckSchema = z.object({
  productIds: z.string().min(1, 'productIds is required'),
});

// ─── Spot Sale schemas ───

export const createSpotSaleSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  spotPrice: z.coerce.number().positive('spotPrice must be positive'),
  quantity: z.coerce.number().positive('quantity must be positive').optional(),
  expiresAt: z.string().datetime('expiresAt must be a valid ISO datetime'),
});

export const updateSpotSaleSchema = z.object({
  active: z.boolean().optional(),
  spotPrice: z.coerce.number().positive().optional(),
  quantity: z.coerce.number().positive().nullable().optional(),
  expiresAt: z.string().datetime().optional(),
}).superRefine((data, ctx) => {
  if (Object.values(data).every((v) => v === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one field must be provided' });
  }
});

export const spotSaleAdminQuerySchema = paginationQuery.extend({
  status: z.enum(['active', 'expired', 'deactivated', 'all']).default('all'),
});

export const recordSpotSaleSchema = z.object({
  buyerId: z.string().min(1, 'buyerId is required'),
  quantity: z.coerce.number().positive('quantity must be positive'),
});

// ─── Password change schema ───

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

// ─── Auth schemas ───

export const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  companyName: z.string().min(1, 'Company name is required').max(200),
  phone: z.string().max(30).optional(),
  contactType: z.enum(['Buyer', 'Buyer; Seller']),
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  mailingCountry: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Create listing schema (multipart form — all values are strings) ───

export const createListingSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(300),
  description: z.string().max(5000).optional(),
  category: z.string().max(100).optional(),
  type: z.string().max(100).optional(),
  licensedProducer: z.string().max(200).optional(),
  lineage: z.string().max(500).optional(),
  growthMedium: z.string().max(100).optional(),
  harvestDate: z.string().optional(),
  certification: z.string().max(200).optional(),
  thc: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'thc must be a number'),
  cbd: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'cbd must be a number'),
  dominantTerpene: z.string().max(500).optional(),
  totalTerpenePercent: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'totalTerpenePercent must be a number'),
  gramsAvailable: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'gramsAvailable must be a number'),
  upcomingQty: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'upcomingQty must be a number'),
  minQtyRequest: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'minQtyRequest must be a number'),
  pricePerUnit: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'pricePerUnit must be a number'),
  budSizePopcorn: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'budSizePopcorn must be a number'),
  budSizeSmall: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'budSizeSmall must be a number'),
  budSizeMedium: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'budSizeMedium must be a number'),
  budSizeLarge: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'budSizeLarge must be a number'),
  budSizeXLarge: z.string().optional().refine((v) => !v || !isNaN(Number(v)), 'budSizeXLarge must be a number'),
}).passthrough(); // Allow extra form fields (multer adds _fieldname etc.)
