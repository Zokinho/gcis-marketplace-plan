import { describe, it, expect } from 'vitest';
import {
  createBidSchema,
  updateListingSchema,
  approveUserSchema,
  bidOutcomeSchema,
  createShareSchema,
  syncNowSchema,
} from '../utils/validation';

describe('createBidSchema', () => {
  it('accepts valid input', () => {
    const result = createBidSchema.safeParse({
      productId: 'prod-123',
      pricePerUnit: 5.50,
      quantity: 100,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with optional notes', () => {
    const result = createBidSchema.safeParse({
      productId: 'prod-123',
      pricePerUnit: 5.50,
      quantity: 100,
      notes: 'Looking for fast delivery',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing productId', () => {
    const result = createBidSchema.safeParse({
      pricePerUnit: 5.50,
      quantity: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty productId', () => {
    const result = createBidSchema.safeParse({
      productId: '',
      pricePerUnit: 5.50,
      quantity: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative pricePerUnit', () => {
    const result = createBidSchema.safeParse({
      productId: 'prod-123',
      pricePerUnit: -1,
      quantity: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero pricePerUnit', () => {
    const result = createBidSchema.safeParse({
      productId: 'prod-123',
      pricePerUnit: 0,
      quantity: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative quantity', () => {
    const result = createBidSchema.safeParse({
      productId: 'prod-123',
      pricePerUnit: 5.50,
      quantity: -10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero quantity', () => {
    const result = createBidSchema.safeParse({
      productId: 'prod-123',
      pricePerUnit: 5.50,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects notes longer than 1000 characters', () => {
    const result = createBidSchema.safeParse({
      productId: 'prod-123',
      pricePerUnit: 5.50,
      quantity: 100,
      notes: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts notes at exactly 1000 characters', () => {
    const result = createBidSchema.safeParse({
      productId: 'prod-123',
      pricePerUnit: 5.50,
      quantity: 100,
      notes: 'x'.repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it('coerces string numbers to numbers', () => {
    const result = createBidSchema.safeParse({
      productId: 'prod-123',
      pricePerUnit: '5.50',
      quantity: '100',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pricePerUnit).toBe(5.5);
      expect(result.data.quantity).toBe(100);
    }
  });
});

describe('updateListingSchema', () => {
  it('accepts valid partial update with pricePerUnit', () => {
    const result = updateListingSchema.safeParse({ pricePerUnit: 6.00 });
    expect(result.success).toBe(true);
  });

  it('accepts valid partial update with gramsAvailable', () => {
    const result = updateListingSchema.safeParse({ gramsAvailable: 500 });
    expect(result.success).toBe(true);
  });

  it('accepts valid partial update with upcomingQty', () => {
    const result = updateListingSchema.safeParse({ upcomingQty: 1000 });
    expect(result.success).toBe(true);
  });

  it('accepts valid partial update with minQtyRequest', () => {
    const result = updateListingSchema.safeParse({ minQtyRequest: 50 });
    expect(result.success).toBe(true);
  });

  it('accepts valid partial update with description', () => {
    const result = updateListingSchema.safeParse({ description: 'Premium flower' });
    expect(result.success).toBe(true);
  });

  it('accepts multiple fields together', () => {
    const result = updateListingSchema.safeParse({
      pricePerUnit: 6.00,
      gramsAvailable: 500,
      description: 'Updated description',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty body (no fields provided)', () => {
    const result = updateListingSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects negative pricePerUnit', () => {
    const result = updateListingSchema.safeParse({ pricePerUnit: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects negative gramsAvailable', () => {
    const result = updateListingSchema.safeParse({ gramsAvailable: -10 });
    expect(result.success).toBe(false);
  });

  it('allows zero for gramsAvailable (sold out)', () => {
    const result = updateListingSchema.safeParse({ gramsAvailable: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects description over 5000 characters', () => {
    const result = updateListingSchema.safeParse({ description: 'x'.repeat(5001) });
    expect(result.success).toBe(false);
  });
});

describe('approveUserSchema', () => {
  it('accepts empty object (contactType is optional)', () => {
    const result = approveUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts with contactType string', () => {
    const result = approveUserSchema.safeParse({ contactType: 'Seller' });
    expect(result.success).toBe(true);
  });

  it('accepts without contactType', () => {
    const result = approveUserSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contactType).toBeUndefined();
    }
  });
});

describe('bidOutcomeSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = bidOutcomeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid actualQuantityDelivered', () => {
    const result = bidOutcomeSchema.safeParse({ actualQuantityDelivered: 500 });
    expect(result.success).toBe(true);
  });

  it('accepts valid boolean deliveryOnTime', () => {
    const result = bidOutcomeSchema.safeParse({ deliveryOnTime: true });
    expect(result.success).toBe(true);
  });

  it('accepts valid boolean qualityAsExpected', () => {
    const result = bidOutcomeSchema.safeParse({ qualityAsExpected: false });
    expect(result.success).toBe(true);
  });

  it('accepts valid string outcomeNotes', () => {
    const result = bidOutcomeSchema.safeParse({ outcomeNotes: 'Delivery was smooth' });
    expect(result.success).toBe(true);
  });

  it('accepts all fields together', () => {
    const result = bidOutcomeSchema.safeParse({
      actualQuantityDelivered: 450,
      deliveryOnTime: true,
      qualityAsExpected: true,
      outcomeNotes: 'Everything arrived as expected',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative actualQuantityDelivered', () => {
    const result = bidOutcomeSchema.safeParse({ actualQuantityDelivered: -10 });
    expect(result.success).toBe(false);
  });

  it('rejects outcomeNotes over 2000 characters', () => {
    const result = bidOutcomeSchema.safeParse({ outcomeNotes: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });
});

describe('createShareSchema', () => {
  it('accepts valid input', () => {
    const result = createShareSchema.safeParse({
      label: 'Weekly highlights',
      productIds: ['prod-1', 'prod-2'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty label', () => {
    const result = createShareSchema.safeParse({
      label: '',
      productIds: ['prod-1'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty productIds array', () => {
    const result = createShareSchema.safeParse({
      label: 'My share',
      productIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing productIds', () => {
    const result = createShareSchema.safeParse({
      label: 'My share',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing label', () => {
    const result = createShareSchema.safeParse({
      productIds: ['prod-1'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional expiresAt as ISO datetime', () => {
    const result = createShareSchema.safeParse({
      label: 'Expiring share',
      productIds: ['prod-1'],
      expiresAt: '2025-06-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid expiresAt format', () => {
    const result = createShareSchema.safeParse({
      label: 'Bad date share',
      productIds: ['prod-1'],
      expiresAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('accepts without expiresAt', () => {
    const result = createShareSchema.safeParse({
      label: 'No expiry',
      productIds: ['prod-1'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiresAt).toBeUndefined();
    }
  });

  it('rejects label over 200 characters', () => {
    const result = createShareSchema.safeParse({
      label: 'x'.repeat(201),
      productIds: ['prod-1'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects productIds containing empty strings', () => {
    const result = createShareSchema.safeParse({
      label: 'Bad id share',
      productIds: [''],
    });
    expect(result.success).toBe(false);
  });
});

describe('syncNowSchema', () => {
  it('accepts valid type "products"', () => {
    const result = syncNowSchema.safeParse({ type: 'products' });
    expect(result.success).toBe(true);
  });

  it('accepts valid type "products-delta"', () => {
    const result = syncNowSchema.safeParse({ type: 'products-delta' });
    expect(result.success).toBe(true);
  });

  it('accepts valid type "contacts"', () => {
    const result = syncNowSchema.safeParse({ type: 'contacts' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (type is optional)', () => {
    const result = syncNowSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid type string', () => {
    const result = syncNowSchema.safeParse({ type: 'invalid-type' });
    expect(result.success).toBe(false);
  });

  it('rejects non-string type', () => {
    const result = syncNowSchema.safeParse({ type: 123 });
    expect(result.success).toBe(false);
  });
});
