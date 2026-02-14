import { vi, describe, it, expect, beforeEach } from 'vitest';
import { detectSeller } from '../services/sellerDetection';
import { prisma } from '../index';

// ─── Helpers ───

function makeSeller(overrides: Partial<{
  id: string;
  email: string;
  companyName: string | null;
  firstName: string;
  lastName: string;
}> = {}) {
  return {
    id: overrides.id ?? 'seller-1',
    email: overrides.email ?? 'seller@example.com',
    companyName: overrides.companyName ?? 'Acme Cannabis Inc',
    firstName: overrides.firstName ?? 'Jane',
    lastName: overrides.lastName ?? 'Doe',
  };
}

// ─── Tests ───

describe('detectSeller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Returns null when no sellers exist
  it('returns null when no sellers exist in database', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    const result = await detectSeller({ senderEmail: 'anyone@test.com' });

    expect(result).toBeNull();
  });

  // 2. Exact email match -> high confidence
  it('returns high confidence on exact email match', async () => {
    const seller = makeSeller({ id: 's1', email: 'seller@acme.com' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    const result = await detectSeller({ senderEmail: 'seller@acme.com' });

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('s1');
    expect(result!.confidence).toBe('high');
    expect(result!.reason).toContain('Email match');
  });

  // 3. Email case-insensitive match
  it('matches email case-insensitively', async () => {
    const seller = makeSeller({ id: 's1', email: 'Seller@Acme.COM' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    const result = await detectSeller({ senderEmail: 'seller@acme.com' });

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('s1');
    expect(result!.confidence).toBe('high');
  });

  // 4. Domain match -> medium confidence
  it('returns medium confidence on domain match', async () => {
    const seller = makeSeller({ id: 's1', email: 'alice@acme.com' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    const result = await detectSeller({ senderEmail: 'bob@acme.com' });

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('s1');
    expect(result!.confidence).toBe('medium');
    expect(result!.reason).toContain('Domain match');
    expect(result!.reason).toContain('@acme.com');
  });

  // 5. Generic domain (gmail) skipped -> no match via domain
  it('skips generic email domains like gmail.com', async () => {
    const seller = makeSeller({ id: 's1', email: 'seller@gmail.com', companyName: null });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    // Different gmail address — should NOT match via domain
    const result = await detectSeller({ senderEmail: 'other@gmail.com' });

    expect(result).toBeNull();
  });

  // 6. Company name exact match -> medium confidence
  it('returns medium confidence on company name exact match', async () => {
    const seller = makeSeller({ id: 's1', email: 'seller@other.com', companyName: 'Green Leaf' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    const result = await detectSeller({ companyName: 'Green Leaf' });

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('s1');
    expect(result!.confidence).toBe('medium');
    expect(result!.reason).toContain('Company name match');
  });

  // 7. Company name with suffixes (Corp, Inc, Ltd) still matches
  it('matches company names after stripping suffixes like Corp, Inc, Ltd', async () => {
    const seller = makeSeller({ id: 's1', email: 'x@other.com', companyName: 'Green Leaf Corp' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    const result = await detectSeller({ companyName: 'Green Leaf Inc' });

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('s1');
    expect(result!.confidence).toBe('medium');
  });

  // 8. Company name partial match (one contains the other)
  it('matches when one company name contains the other after normalization', async () => {
    const seller = makeSeller({ id: 's1', email: 'x@other.com', companyName: 'Green Leaf Cannabis Co' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    // "Green Leaf" normalized is "greenleaf", seller normalized is "greenleafcannabis"
    // "greenleafcannabis" includes "greenleaf" -> match
    const result = await detectSeller({ companyName: 'Green Leaf' });

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('s1');
    expect(result!.confidence).toBe('medium');
  });

  // 9. Producer name match -> low confidence
  it('returns low confidence on producer name match', async () => {
    const seller = makeSeller({ id: 's1', email: 'x@other.com', companyName: 'Aurora Cannabis' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    const result = await detectSeller({ producerName: 'Aurora Cannabis' });

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('s1');
    expect(result!.confidence).toBe('low');
    expect(result!.reason).toContain('Producer match');
  });

  // 10. No match returns null
  it('returns null when no detection criteria match any seller', async () => {
    const seller = makeSeller({ id: 's1', email: 'seller@acme.com', companyName: 'Acme Corp' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    const result = await detectSeller({
      senderEmail: 'stranger@unknown.com',
      companyName: 'Totally Different Company',
      producerName: 'Another Producer Entirely',
    });

    expect(result).toBeNull();
  });

  // 11. Null/undefined email/company handled gracefully
  it('handles null and undefined inputs gracefully', async () => {
    const seller = makeSeller({ id: 's1', email: 'seller@acme.com', companyName: 'Acme Corp' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    const result1 = await detectSeller({ senderEmail: null, companyName: null, producerName: null });
    expect(result1).toBeNull();

    const result2 = await detectSeller({ senderEmail: undefined, companyName: undefined, producerName: undefined });
    expect(result2).toBeNull();

    const result3 = await detectSeller({});
    expect(result3).toBeNull();
  });

  // 12. Multiple sellers — picks first match at highest confidence
  it('picks the first seller matching at the highest confidence level', async () => {
    const sellers = [
      makeSeller({ id: 's1', email: 'alice@acme.com', companyName: 'Alpha Corp' }),
      makeSeller({ id: 's2', email: 'bob@acme.com', companyName: 'Acme Corp' }),
    ];
    vi.mocked(prisma.user.findMany).mockResolvedValue(sellers as any);

    // senderEmail "alice@acme.com" should exact-match s1 with high confidence
    // even though s2 also has same domain and companyName could match
    const result = await detectSeller({
      senderEmail: 'alice@acme.com',
      companyName: 'Acme Corp',
    });

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('s1');
    expect(result!.confidence).toBe('high');
  });

  // 13. Domain match prefers first seller with matching domain
  it('domain match returns first seller with that domain', async () => {
    const sellers = [
      makeSeller({ id: 's1', email: 'alice@acme.com', companyName: null }),
      makeSeller({ id: 's2', email: 'bob@acme.com', companyName: null }),
    ];
    vi.mocked(prisma.user.findMany).mockResolvedValue(sellers as any);

    const result = await detectSeller({ senderEmail: 'charlie@acme.com' });

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('s1');
    expect(result!.confidence).toBe('medium');
  });

  // 14. All generic domains are skipped for domain matching
  it('skips all known generic domains', async () => {
    const genericDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'live.com', 'aol.com', 'icloud.com', 'mail.com',
      'protonmail.com', 'proton.me',
    ];

    for (const domain of genericDomains) {
      const seller = makeSeller({ id: 's1', email: `seller@${domain}`, companyName: null });
      vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

      const result = await detectSeller({ senderEmail: `other@${domain}` });
      expect(result).toBeNull();
    }
  });

  // 15. Email match takes priority over company name match
  it('prefers email match (high) over company name match (medium)', async () => {
    const seller = makeSeller({ id: 's1', email: 'seller@acme.com', companyName: 'Test Company' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    const result = await detectSeller({
      senderEmail: 'seller@acme.com',
      companyName: 'Test Company',
      producerName: 'Test Company',
    });

    expect(result!.confidence).toBe('high');
    expect(result!.reason).toContain('Email match');
  });

  // 16. Company name match takes priority over producer name match
  it('prefers company name match (medium) over producer name match (low)', async () => {
    const seller = makeSeller({ id: 's1', email: 'x@other.com', companyName: 'Green Leaf' });
    vi.mocked(prisma.user.findMany).mockResolvedValue([seller] as any);

    const result = await detectSeller({
      senderEmail: 'stranger@unknown.com',
      companyName: 'Green Leaf',
      producerName: 'Green Leaf',
    });

    expect(result!.confidence).toBe('medium');
    expect(result!.reason).toContain('Company name match');
  });
});
