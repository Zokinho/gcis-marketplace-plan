import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

/**
 * Attach Clerk session token to every request.
 * Called once from App after Clerk loads.
 */
export function setAuthTokenGetter(getToken: () => Promise<string | null>) {
  api.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
}

// ─── User types ───

export interface UserStatus {
  status: 'NOT_FOUND' | 'NO_ZOHO_LINK' | 'PENDING_APPROVAL' | 'EULA_REQUIRED' | 'DOC_REQUIRED' | 'ACTIVE';
  message?: string;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    contactType: string | null;
    approved: boolean;
    eulaAcceptedAt: string | null;
    docUploaded: boolean;
  };
}

// ─── Product types ───

export interface ProductCard {
  id: string;
  name: string;
  category: string | null;
  type: string | null;
  certification: string | null;
  thcMin: number | null;
  thcMax: number | null;
  cbdMin: number | null;
  cbdMax: number | null;
  pricePerUnit: number | null;
  gramsAvailable: number | null;
  upcomingQty: number | null;
  licensedProducer: string | null;
  imageUrls: string[];
  isActive: boolean;
  labName: string | null;
  testDate: string | null;
  reportNumber: string | null;
  testResults: any | null;
  coaPdfUrl: string | null;
  source: string;
}

export interface ProductDetail extends ProductCard {
  zohoProductId: string;
  productCode: string | null;
  description: string | null;
  growthMedium: string | null;
  lineage: string | null;
  harvestDate: string | null;
  dominantTerpene: string | null;
  highestTerpenes: string | null;
  aromas: string | null;
  budSizePopcorn: number | null;
  budSizeSmall: number | null;
  budSizeMedium: number | null;
  budSizeLarge: number | null;
  budSizeXLarge: number | null;
  minQtyRequest: number | null;
  requestPending: boolean;
  coaUrls: string[];
  seller: { companyName: string | null };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProductFilters {
  category?: string;
  type?: string;
  certification?: string;
  thcMin?: number;
  thcMax?: number;
  cbdMin?: number;
  cbdMax?: number;
  priceMin?: number;
  priceMax?: number;
  availability?: 'in_stock' | 'upcoming';
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface FilterOptions {
  categories: string[];
  types: string[];
  certifications: string[];
}

// ─── User API ───

export async function fetchUserStatus(): Promise<UserStatus> {
  const res = await api.get<UserStatus>('/user/status');
  return res.data;
}

export async function acceptEula(): Promise<void> {
  await api.post('/onboarding/accept-eula');
}

export async function uploadDoc(): Promise<void> {
  await api.post('/onboarding/upload-doc');
}

// ─── Product API ───

export async function fetchProducts(filters: ProductFilters = {}): Promise<{ products: ProductCard[]; pagination: Pagination }> {
  // Strip undefined values
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params[key] = String(value);
    }
  }
  const res = await api.get('/marketplace/products', { params });
  return res.data;
}

export async function fetchProductById(id: string): Promise<ProductDetail> {
  const res = await api.get(`/marketplace/products/${id}`);
  return res.data.product;
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  const res = await api.get('/marketplace/filters');
  return res.data;
}

// ─── Bid API ───

export type BidStatusType = 'PENDING' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | 'EXPIRED';

export interface BidRecord {
  id: string;
  pricePerUnit: number;
  quantity: number;
  totalValue: number;
  proximityScore: number | null;
  status: BidStatusType;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    category: string | null;
    type: string | null;
    certification: string | null;
    pricePerUnit: number | null;
    imageUrls: string[];
    isActive: boolean;
    seller: { companyName: string | null };
  };
}

export async function submitBid(data: {
  productId: string;
  pricePerUnit: number;
  quantity: number;
  notes?: string;
}): Promise<{ bid: { id: string; proximityScore: number } }> {
  const res = await api.post('/bids', data);
  return res.data;
}

export async function fetchMyBids(params?: {
  page?: number;
  limit?: number;
  status?: BidStatusType;
}): Promise<{ bids: BidRecord[]; pagination: Pagination }> {
  const query: Record<string, string> = {};
  if (params?.page) query.page = String(params.page);
  if (params?.limit) query.limit = String(params.limit);
  if (params?.status) query.status = params.status;
  const res = await api.get('/bids', { params: query });
  return res.data;
}

// ─── Seller Listings API ───

export interface SellerListing {
  id: string;
  name: string;
  category: string | null;
  type: string | null;
  certification: string | null;
  isActive: boolean;
  requestPending: boolean;
  pricePerUnit: number | null;
  gramsAvailable: number | null;
  upcomingQty: number | null;
  thcMin: number | null;
  thcMax: number | null;
  cbdMax: number | null;
  imageUrls: string[];
  lastSyncedAt: string | null;
  totalBids: number;
  pendingBids: number;
}

export async function fetchMyListings(): Promise<SellerListing[]> {
  const res = await api.get('/my-listings');
  return res.data.listings;
}

export async function updateMyListing(
  id: string,
  updates: { pricePerUnit?: number; gramsAvailable?: number; upcomingQty?: number },
): Promise<void> {
  await api.patch(`/my-listings/${id}`, updates);
}

export async function toggleListingActive(id: string): Promise<{ isActive: boolean }> {
  const res = await api.patch(`/my-listings/${id}/toggle-active`);
  return res.data;
}

// ─── Seller Share Links ───

export interface SellerShare {
  id: string;
  token: string;
  label: string;
  productIds: string[];
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  useCount: number;
  shareUrl: string;
}

export async function createSellerShare(opts: {
  label?: string;
  productIds?: string[];
  expiresInDays?: number;
}): Promise<{ share: SellerShare; shareUrl: string }> {
  const res = await api.post('/my-listings/share', opts);
  return res.data;
}

export async function fetchSellerShares(): Promise<{ shares: SellerShare[] }> {
  const res = await api.get('/my-listings/shares');
  return res.data;
}

export async function deleteSellerShare(id: string): Promise<void> {
  await api.delete(`/my-listings/shares/${id}`);
}

// ─── CoA Types ───

export interface CoaUploadResponse {
  jobId: string;
  syncRecordId: string;
  status: string;
}

export interface CoaJobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'review' | 'published' | 'flagged' | 'error';
  productId: string | null;
  errorMessage: string | null;
  pageCount: number;
}

export interface CoaExtractedData {
  coaProductId: string;
  mappedFields: {
    name: string;
    labName: string | null;
    testDate: string | null;
    reportNumber: string | null;
    type: string | null;
    productCode: string | null;
    licensedProducer: string | null;
    thcMin: number | null;
    thcMax: number | null;
    cbdMin: number | null;
    cbdMax: number | null;
    dominantTerpene: string | null;
    highestTerpenes: string | null;
    testResults: any | null;
  };
  rawCoaData: any;
  syncRecord: {
    id: string;
    status: string;
    suggestedSellerId: string | null;
    suggestedSellerName: string | null;
  } | null;
}

export interface CoaEmailQueueItem {
  id: string;
  coaJobId: string;
  coaProductId: string | null;
  emailIngestionId: string | null;
  status: string;
  suggestedSellerId: string | null;
  suggestedSellerName: string | null;
  confidence: string | null;
  matchReason: string | null;
  emailSender: string | null;
  emailSubject: string | null;
  coaProductName: string | null;
  rawData: any;
  createdAt: string;
  suggestedSeller: {
    id: string;
    email: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface SellerOption {
  id: string;
  email: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
}

// ─── CoA API ───

export async function uploadCoaPdf(file: File): Promise<CoaUploadResponse> {
  const formData = new FormData();
  formData.append('coaPdf', file);
  const res = await api.post<CoaUploadResponse>('/coa/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function pollCoaJobStatus(jobId: string): Promise<CoaJobStatus> {
  const res = await api.get<CoaJobStatus>(`/coa/jobs/${jobId}/status`);
  return res.data;
}

export async function previewCoaExtraction(jobId: string): Promise<CoaExtractedData> {
  const res = await api.get<CoaExtractedData>(`/coa/jobs/${jobId}/preview`);
  return res.data;
}

export async function confirmCoaExtraction(
  jobId: string,
  sellerId?: string,
  overrides?: Record<string, any>,
): Promise<{ product: ProductDetail }> {
  const res = await api.post(`/coa/jobs/${jobId}/confirm`, { sellerId, overrides });
  return res.data;
}

// ─── Admin CoA Email Queue API ───

export async function fetchCoaEmailQueue(): Promise<CoaEmailQueueItem[]> {
  const res = await api.get<{ queue: CoaEmailQueueItem[] }>('/admin/coa-email-queue');
  return res.data.queue;
}

export async function confirmCoaEmail(
  syncRecordId: string,
  sellerId: string,
  overrides?: Record<string, any>,
): Promise<{ product: ProductDetail }> {
  const res = await api.post('/admin/coa-email-confirm', { syncRecordId, sellerId, overrides });
  return res.data;
}

export async function dismissCoaEmail(syncRecordId: string): Promise<void> {
  await api.post('/admin/coa-email-dismiss', { syncRecordId });
}

export async function fetchSellers(): Promise<SellerOption[]> {
  const res = await api.get<{ sellers: SellerOption[] }>('/admin/sellers');
  return res.data.sellers;
}

export async function triggerCoaEmailPoll(): Promise<{ processed: number; errors: number }> {
  const res = await api.post('/admin/coa-email-poll');
  return res.data;
}

// ─── Curated Shares Types ───

export interface CuratedShareData {
  id: string;
  token: string;
  label: string;
  productIds: string[];
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  useCount: number;
}

export interface ShareValidation {
  label: string;
  productCount: number;
  expiresAt: string | null;
}

export interface SharedProduct extends ProductDetail {
  // Same as ProductDetail but accessed via share token
}

// ─── Curated Shares API (admin) ───

export async function fetchShares(): Promise<CuratedShareData[]> {
  const res = await api.get<{ shares: CuratedShareData[] }>('/shares');
  return res.data.shares;
}

export async function createShare(data: {
  label: string;
  productIds: string[];
  expiresAt?: string;
}): Promise<CuratedShareData> {
  const res = await api.post<{ share: CuratedShareData }>('/shares', data);
  return res.data.share;
}

export async function updateShare(
  id: string,
  data: { label?: string; productIds?: string[]; active?: boolean; expiresAt?: string | null },
): Promise<CuratedShareData> {
  const res = await api.patch<{ share: CuratedShareData }>(`/shares/${id}`, data);
  return res.data.share;
}

export async function deleteShare(id: string): Promise<void> {
  await api.delete(`/shares/${id}`);
}

// ─── Public Share API (no auth) ───

const publicApi = axios.create({ baseURL: '/api/shares/public' });

export async function validateShareToken(token: string): Promise<ShareValidation> {
  const res = await publicApi.get<ShareValidation>(`/validate/${token}`);
  return res.data;
}

export async function fetchSharedProducts(token: string): Promise<{ label: string; products: SharedProduct[] }> {
  const res = await publicApi.get<{ label: string; products: SharedProduct[] }>(`/${token}/products`);
  return res.data;
}

export function getSharedProductPdfUrl(token: string, productId: string): string {
  return `/api/shares/public/${token}/products/${productId}/pdf`;
}

// ─── Intelligence Types ───

export interface MatchRecord {
  id: string;
  buyerId: string;
  productId: string;
  score: number;
  breakdown: Record<string, number>;
  insights: Array<{ type: string; text: string }> | null;
  status: string;
  createdAt: string;
  buyer: { id: string; email: string; companyName: string | null; firstName: string | null; lastName: string | null };
  product: { id: string; name: string; category: string | null; type: string | null; pricePerUnit: number | null; gramsAvailable: number | null; imageUrls: string[]; seller?: { companyName: string | null } };
}

export interface PredictionRecord {
  id: string;
  buyerId: string;
  categoryName: string;
  predictedDate: string;
  confidenceScore: number;
  avgIntervalDays: number;
  basedOnTransactions: number;
  daysOverdue?: number;
  daysUntil?: number;
  isOverdue?: boolean;
  buyer: { id: string; email: string; companyName: string | null; firstName: string | null; lastName: string | null };
}

export interface ChurnRecord {
  id: string;
  buyerId: string;
  categoryName: string | null;
  riskLevel: string;
  riskScore: number;
  daysSincePurchase: number;
  avgIntervalDays: number;
  isActive: boolean;
  buyer: { id: string; email: string; companyName: string | null; firstName: string | null; lastName: string | null };
}

export interface SellerScoreRecord {
  id: string;
  sellerId: string;
  fillRate: number;
  qualityScore: number;
  deliveryScore: number;
  pricingScore: number;
  overallScore: number;
  transactionsScored: number;
  seller: { id: string; email: string; companyName: string | null; firstName: string | null; lastName: string | null };
}

export interface MarketTrend {
  categoryName: string;
  currentAvgPrice: number;
  previousAvgPrice: number;
  percentChange: number;
  trend: 'up' | 'down' | 'stable';
  volume: number;
}

export interface MarketContextData {
  categoryName: string;
  avgPrice30d: number | null;
  minPrice30d: number | null;
  maxPrice30d: number | null;
  priceChange7d: number | null;
  priceChange30d: number | null;
  transactionCount30d: number;
  totalVolume30d: number;
  activeBuyers: number;
  activeListings: number;
  supplyDemandRatio: number;
}

export interface IntelDashboard {
  pendingMatches: number;
  totalMatches: number;
  avgMatchScore: number;
  upcomingPredictions: PredictionRecord[];
  overduePredictions: PredictionRecord[];
  atRiskBuyers: { critical: number; high: number; medium: number; low: number };
  marketTrends: MarketTrend[];
  topSellers: SellerScoreRecord[];
  topBuyers: Array<{ id: string; companyName: string | null; propensityScore: number }>;
}

export interface TransactionRecord {
  id: string;
  buyerId: string;
  sellerId: string;
  productId: string;
  bidId: string | null;
  quantity: number;
  pricePerUnit: number;
  totalValue: number;
  status: string;
  transactionDate: string;
  actualQuantityDelivered: number | null;
  deliveryOnTime: boolean | null;
  qualityAsExpected: boolean | null;
  outcomeNotes: string | null;
  outcomeRecordedAt: string | null;
  buyer: { id: string; email: string; companyName: string | null; firstName: string | null; lastName: string | null };
  seller: { id: string; email: string; companyName: string | null; firstName: string | null; lastName: string | null };
  product: { id: string; name: string; category: string | null; type: string | null; imageUrls: string[] };
  bid?: { id: string; pricePerUnit: number; quantity: number; proximityScore: number | null };
}

export interface SellerBidRecord extends BidRecord {
  buyer: { id: string; email: string; companyName: string | null; firstName: string | null; lastName: string | null };
  transaction: { id: string; status: string; outcomeRecordedAt: string | null } | null;
}

// ─── Intelligence API ───

export async function fetchIntelDashboard(): Promise<IntelDashboard> {
  const res = await api.get('/intelligence/dashboard');
  return res.data;
}

export async function fetchMatches(params?: { page?: number; limit?: number; minScore?: number; status?: string; category?: string }): Promise<{ matches: MatchRecord[]; pagination: Pagination }> {
  const query: Record<string, string> = {};
  if (params?.page) query.page = String(params.page);
  if (params?.limit) query.limit = String(params.limit);
  if (params?.minScore) query.minScore = String(params.minScore);
  if (params?.status) query.status = params.status;
  if (params?.category) query.category = params.category;
  const res = await api.get('/intelligence/matches', { params: query });
  return res.data;
}

export async function fetchMatchById(id: string): Promise<MatchRecord> {
  const res = await api.get(`/intelligence/matches/${id}`);
  return res.data.match;
}

export async function generateMatches(productId?: string): Promise<{ products?: number; matches?: number; matchesGenerated?: number }> {
  const res = await api.post('/intelligence/matches/generate', productId ? { productId } : {});
  return res.data;
}

export async function fetchPredictions(params?: { days?: number; limit?: number; type?: string }): Promise<{ predictions: PredictionRecord[] }> {
  const query: Record<string, string> = {};
  if (params?.days) query.days = String(params.days);
  if (params?.limit) query.limit = String(params.limit);
  if (params?.type) query.type = params.type;
  const res = await api.get('/intelligence/predictions', { params: query });
  return res.data;
}

export async function fetchPredictionCalendar(): Promise<{ weeks: Record<string, PredictionRecord[]> }> {
  const res = await api.get('/intelligence/predictions/calendar');
  return res.data;
}

export async function fetchAtRiskBuyers(params?: { minRiskLevel?: string; limit?: number }): Promise<{ buyers: Array<{ buyer: ChurnRecord['buyer']; signals: ChurnRecord[]; overallRiskLevel: string; overallRiskScore: number }> }> {
  const query: Record<string, string> = {};
  if (params?.minRiskLevel) query.minRiskLevel = params.minRiskLevel;
  if (params?.limit) query.limit = String(params.limit);
  const res = await api.get('/intelligence/churn/at-risk', { params: query });
  return res.data;
}

export async function fetchChurnStats(): Promise<{ totalAtRisk: number; criticalCount: number; highCount: number; mediumCount: number; lowCount: number }> {
  const res = await api.get('/intelligence/churn/stats');
  return res.data;
}

export async function runChurnDetection(): Promise<{ signalsCreated: number; signalsUpdated: number }> {
  const res = await api.post('/intelligence/churn/detect');
  return res.data;
}

export async function fetchMarketTrends(): Promise<{ trends: MarketTrend[] }> {
  const res = await api.get('/intelligence/market/trends');
  return res.data;
}

export async function fetchMarketInsights(): Promise<{ trends: MarketTrend[]; topCategories: Array<{ categoryName: string; volume: number; avgPrice: number }>; supplyDemandOverview: Array<{ categoryName: string; ratio: number; assessment: string }> }> {
  const res = await api.get('/intelligence/market/insights');
  return res.data;
}

export async function fetchMarketContext(categoryName: string): Promise<MarketContextData> {
  const res = await api.get(`/intelligence/market/${encodeURIComponent(categoryName)}`);
  return res.data;
}

export async function fetchSellerScores(): Promise<{ scores: SellerScoreRecord[] }> {
  const res = await api.get('/intelligence/seller-scores');
  return res.data;
}

export async function fetchSellerScore(sellerId: string): Promise<{ score: SellerScoreRecord }> {
  const res = await api.get(`/intelligence/seller-scores/${sellerId}`);
  return res.data;
}

export async function recalculateSellerScores(): Promise<{ sellersUpdated: number }> {
  const res = await api.post('/intelligence/seller-scores/recalculate');
  return res.data;
}

export async function fetchTransactions(params?: { page?: number; limit?: number; status?: string }): Promise<{ transactions: TransactionRecord[]; pagination: Pagination }> {
  const query: Record<string, string> = {};
  if (params?.page) query.page = String(params.page);
  if (params?.limit) query.limit = String(params.limit);
  if (params?.status) query.status = params.status;
  const res = await api.get('/intelligence/transactions', { params: query });
  return res.data;
}

export async function fetchTransactionById(id: string): Promise<{ transaction: TransactionRecord }> {
  const res = await api.get(`/intelligence/transactions/${id}`);
  return res.data;
}

// ─── Buyer Matches API ───

export async function fetchBuyerMatches(params?: { page?: number; limit?: number }): Promise<{ matches: MatchRecord[]; pagination: Pagination }> {
  const query: Record<string, string> = {};
  if (params?.page) query.page = String(params.page);
  if (params?.limit) query.limit = String(params.limit);
  const res = await api.get('/matches', { params: query });
  return res.data;
}

export async function dismissMatch(id: string): Promise<void> {
  await api.post(`/matches/${id}/dismiss`);
}

// ─── Bid Accept/Reject/Outcome API ───

export async function acceptBid(bidId: string): Promise<{ transaction: { id: string; status: string } }> {
  const res = await api.patch(`/bids/${bidId}/accept`);
  return res.data;
}

export async function rejectBid(bidId: string): Promise<void> {
  await api.patch(`/bids/${bidId}/reject`);
}

export async function recordOutcome(bidId: string, data: {
  actualQuantityDelivered?: number;
  deliveryOnTime?: boolean;
  qualityAsExpected?: boolean;
  outcomeNotes?: string;
}): Promise<void> {
  await api.patch(`/bids/${bidId}/outcome`, data);
}

// ─── Seller Bids API ───

export async function fetchSellerBids(params?: { page?: number; limit?: number; status?: string }): Promise<{ bids: SellerBidRecord[]; pagination: Pagination }> {
  const query: Record<string, string> = {};
  if (params?.page) query.page = String(params.page);
  if (params?.limit) query.limit = String(params.limit);
  if (params?.status) query.status = params.status;
  const res = await api.get('/bids/seller', { params: query });
  return res.data;
}

export default api;
