import { prisma } from '../index';

export interface SellerMatch {
  userId: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Attempt to match an email sender / company name to a marketplace seller.
 * Uses simple string matching — no AI needed.
 */
export async function detectSeller(params: {
  senderEmail?: string | null;
  companyName?: string | null;
  producerName?: string | null;
}): Promise<SellerMatch | null> {
  const { senderEmail, companyName, producerName } = params;

  // Get all sellers from the marketplace
  const sellers = await prisma.user.findMany({
    where: {
      contactType: { contains: 'Seller' },
    },
    select: {
      id: true,
      email: true,
      companyName: true,
      firstName: true,
      lastName: true,
    },
  });

  if (sellers.length === 0) return null;

  // 1. Exact email match (highest confidence)
  if (senderEmail) {
    const emailMatch = sellers.find(
      (s) => s.email.toLowerCase() === senderEmail.toLowerCase(),
    );
    if (emailMatch) {
      return {
        userId: emailMatch.id,
        confidence: 'high',
        reason: `Email match: ${senderEmail}`,
      };
    }
  }

  // 2. Email domain match
  if (senderEmail) {
    const domain = senderEmail.split('@')[1]?.toLowerCase();
    if (domain && !isGenericDomain(domain)) {
      const domainMatch = sellers.find((s) => {
        const sellerDomain = s.email.split('@')[1]?.toLowerCase();
        return sellerDomain === domain;
      });
      if (domainMatch) {
        return {
          userId: domainMatch.id,
          confidence: 'medium',
          reason: `Domain match: @${domain}`,
        };
      }
    }
  }

  // 3. Company name match against companyName
  if (companyName) {
    const match = findCompanyMatch(sellers, companyName);
    if (match) {
      return {
        userId: match.id,
        confidence: 'medium',
        reason: `Company name match: "${companyName}" ≈ "${match.companyName}"`,
      };
    }
  }

  // 4. Producer name match against companyName
  if (producerName) {
    const match = findCompanyMatch(sellers, producerName);
    if (match) {
      return {
        userId: match.id,
        confidence: 'low',
        reason: `Producer match: "${producerName}" ≈ "${match.companyName}"`,
      };
    }
  }

  return null;
}

/**
 * Check if a domain is generic (gmail, outlook, etc.)
 */
function isGenericDomain(domain: string): boolean {
  const generic = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'live.com', 'aol.com', 'icloud.com', 'mail.com',
    'protonmail.com', 'proton.me',
  ];
  return generic.includes(domain);
}

/**
 * Fuzzy company name match — normalized comparison.
 */
function findCompanyMatch(
  sellers: Array<{ id: string; companyName: string | null }>,
  targetName: string,
): { id: string; companyName: string | null } | null {
  const normalized = normalizeName(targetName);
  if (!normalized) return null;

  for (const seller of sellers) {
    if (!seller.companyName) continue;
    const sellerNorm = normalizeName(seller.companyName);
    if (!sellerNorm) continue;

    // Exact normalized match
    if (sellerNorm === normalized) return seller;

    // One contains the other (e.g., "ABC Corp" matches "ABC Corporation")
    if (sellerNorm.includes(normalized) || normalized.includes(sellerNorm)) return seller;
  }

  return null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|corp|corporation|ltd|limited|llc|co|company)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}
