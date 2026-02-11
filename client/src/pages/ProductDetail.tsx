import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import BidForm from '../components/BidForm';
import CoaUpload from '../components/CoaUpload';
import TestResultsDisplay from '../components/TestResultsDisplay';
import { fetchProductById, fetchMarketContext, type ProductDetail as ProductDetailType, type MarketContextData } from '../lib/api';
import { useUserStatus } from '../lib/useUserStatus';

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 text-orange-700',
  Indica: 'bg-purple-100 text-purple-700',
  Hybrid: 'bg-teal-100 text-teal-700',
};

const CERT_COLORS: Record<string, string> = {
  GACP: 'bg-blue-100 text-blue-700',
  GMP1: 'bg-brand-sage/20 text-brand-teal',
  GMP2: 'bg-brand-sage/20 text-brand-teal',
  GPP: 'bg-cyan-100 text-cyan-700',
};

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketCtx, setMarketCtx] = useState<MarketContextData | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const { data: userStatus } = useUserStatus();
  const isSeller = userStatus?.user?.contactType?.includes('Seller') ?? false;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchProductById(id)
      .then((p) => {
        setProduct(p);
        if (p.category) {
          fetchMarketContext(p.category).then(setMarketCtx).catch(() => {});
        }
      })
      .catch((err) => setError(err?.response?.data?.error || 'Product not found'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (error || !product) {
    return (
      <Layout>
        <div className="rounded-lg border bg-white p-12 text-center">
          <h3 className="mb-2 text-lg font-semibold text-gray-700">{error || 'Product not found'}</h3>
          <Link to="/marketplace" className="text-sm font-medium text-brand-teal underline hover:text-brand-teal/80">
            Back to Marketplace
          </Link>
        </div>
      </Layout>
    );
  }

  const budSizes = [
    { label: '0-1cm (Popcorn)', value: product.budSizePopcorn },
    { label: '1-2cm (Small)', value: product.budSizeSmall },
    { label: '2-3cm (Medium)', value: product.budSizeMedium },
    { label: '3-5cm (Large)', value: product.budSizeLarge },
    { label: '5cm+ (X-Large)', value: product.budSizeXLarge },
  ].filter((b) => b.value != null && b.value > 0);

  const terpenes = product.dominantTerpene?.split(';').map((t) => t.trim()).filter(Boolean) || [];

  return (
    <Layout>
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-gray-500">
        <Link to="/marketplace" className="hover:text-brand-teal">Marketplace</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{product.name}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Product info (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Image Gallery */}
          {product.imageUrls && product.imageUrls.length > 0 && (
            <div className="rounded-lg border bg-white p-4">
              <div className="mb-3 flex items-center justify-center overflow-hidden rounded-lg bg-gray-50" style={{ minHeight: '320px' }}>
                <img
                  src={product.imageUrls[selectedImage]}
                  alt={`${product.name} — image ${selectedImage + 1}`}
                  className="max-h-[480px] w-full object-contain"
                />
              </div>
              {product.imageUrls.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {product.imageUrls.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(i)}
                      className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${
                        i === selectedImage ? 'border-brand-teal' : 'border-transparent hover:border-gray-300'
                      }`}
                    >
                      <img src={url} alt={`Thumbnail ${i + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Header */}
          <div className="rounded-lg border border-l-4 border-l-brand-teal bg-white p-6">
            <div className="mb-3 flex flex-wrap gap-2">
              {product.category && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">{product.category}</span>
              )}
              {product.type && (
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${TYPE_COLORS[product.type] || 'bg-gray-100 text-gray-600'}`}>
                  {product.type}
                </span>
              )}
              {product.certification && (
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${CERT_COLORS[product.certification] || 'bg-gray-100 text-gray-600'}`}>
                  {product.certification}
                </span>
              )}
            </div>

            <h1 className="mb-1 text-2xl font-bold text-gray-900">{product.name}</h1>
            {(product.seller as any)?.avgFulfillmentScore != null && (
              <p className="text-xs text-gray-400">
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-sage/20 px-2 py-0.5 text-xs font-medium text-brand-blue">
                  Seller Score: {((product.seller as any).avgFulfillmentScore as number).toFixed(0)}/100
                </span>
              </p>
            )}

            {product.description && (
              <p className="mt-4 text-sm leading-relaxed text-gray-600">{product.description}</p>
            )}

            {/* Market Position Indicator */}
            {marketCtx && marketCtx.avgPrice30d != null && product.pricePerUnit != null && (
              <div className="mt-4 rounded-lg bg-gray-50 p-3">
                <p className="mb-1 text-xs font-medium text-gray-500">Market Position</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-500">
                    Market Avg: <span className="font-semibold text-gray-700">${marketCtx.avgPrice30d.toFixed(2)}/g</span>
                  </span>
                  {(() => {
                    const diff = ((product.pricePerUnit! - marketCtx.avgPrice30d!) / marketCtx.avgPrice30d!) * 100;
                    const label = diff > 0 ? `${diff.toFixed(1)}% above` : diff < 0 ? `${Math.abs(diff).toFixed(1)}% below` : 'At';
                    const color = diff > 5 ? 'text-brand-coral' : diff < -5 ? 'text-brand-blue' : 'text-gray-600';
                    return <span className={`font-semibold ${color}`}>{label} market avg</span>;
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Key specs */}
          <div className="rounded-lg border bg-white p-6">
            <h2 className="mb-4 border-l-2 border-brand-teal pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">Specifications</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Spec label="THC" value={formatRange(product.thcMin, product.thcMax, '%')} />
              <Spec label="CBD" value={formatRange(product.cbdMin, product.cbdMax, '%')} />
              <Spec label="Price" value={product.pricePerUnit != null ? `$${product.pricePerUnit.toFixed(2)}/g` : 'On request'} />
              <Spec label="Available" value={product.gramsAvailable != null ? `${product.gramsAvailable.toLocaleString()}g` : '—'} />
              {product.upcomingQty != null && product.upcomingQty > 0 && (
                <Spec label="Upcoming" value={`${product.upcomingQty.toLocaleString()}g`} />
              )}
              {product.minQtyRequest != null && (
                <Spec label="Min Order" value={`${product.minQtyRequest.toLocaleString()}g`} />
              )}
              {product.growthMedium && <Spec label="Growth Medium" value={product.growthMedium} />}
              {product.lineage && <Spec label="Lineage" value={product.lineage} />}
              {product.harvestDate && (
                <Spec label="Harvest Date" value={new Date(product.harvestDate).toLocaleDateString()} />
              )}
            </div>
          </div>

          {/* Terpene profile */}
          {(terpenes.length > 0 || product.highestTerpenes || product.aromas) && (
            <div className="rounded-lg border bg-white p-6">
              <h2 className="mb-4 border-l-2 border-brand-sage pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">Terpene Profile</h2>

              {terpenes.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-gray-500">Dominant Terpenes</p>
                  <div className="flex flex-wrap gap-2">
                    {terpenes.map((t) => (
                      <span key={t} className="rounded-full bg-brand-sage/20 px-3 py-1 text-xs font-medium text-brand-teal">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {product.highestTerpenes && (
                <div className="mb-4">
                  <p className="mb-1 text-xs font-medium text-gray-500">Breakdown</p>
                  <p className="whitespace-pre-line text-sm text-gray-600">{product.highestTerpenes}</p>
                </div>
              )}

              {product.aromas && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Aromas</p>
                  <p className="whitespace-pre-line text-sm text-gray-600">{product.aromas}</p>
                </div>
              )}
            </div>
          )}

          {/* Bud size distribution */}
          {budSizes.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h2 className="mb-4 border-l-2 border-brand-blue pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">Bud Size Distribution</h2>
              <div className="space-y-2">
                {budSizes.map((b) => (
                  <div key={b.label} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-xs text-gray-600">{b.label}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-brand-teal transition-all"
                        style={{ width: `${b.value}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-medium text-gray-700">{b.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CoA downloads */}
          {product.coaUrls.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h2 className="mb-3 border-l-2 border-brand-teal pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">Certificates of Analysis</h2>
              <div className="flex flex-wrap gap-2">
                {product.coaUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-brand-teal transition hover:bg-brand-sage/10"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    CoA {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* CoA Test Results (from AI extraction) */}
          {product.testResults && (
            <div className="rounded-lg border bg-white p-6">
              <h2 className="mb-4 border-l-2 border-brand-blue pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">CoA Data</h2>
              {product.coaPdfUrl && (
                <a
                  href={product.coaPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-brand-teal transition hover:bg-brand-sage/10"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download CoA PDF
                </a>
              )}
              <TestResultsDisplay
                testResults={product.testResults}
                labName={product.labName}
                testDate={product.testDate}
                reportNumber={product.reportNumber}
              />
            </div>
          )}

          {/* CoA Upload for sellers viewing their own product */}
          {isSeller && !product.testResults && (
            <div className="rounded-lg border bg-white p-6">
              <h2 className="mb-4 border-l-2 border-brand-sage pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">Upload CoA</h2>
              <p className="mb-4 text-sm text-gray-500">
                Upload a Certificate of Analysis PDF to auto-fill test results for this product.
              </p>
              <CoaUpload onProductCreated={() => window.location.reload()} />
            </div>
          )}
        </div>

        {/* Right: Bid form (1 col) */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <BidForm
            productId={product.id}
            productName={product.name}
            sellerPrice={product.pricePerUnit}
            minQty={product.minQtyRequest}
          />
        </div>
      </div>
    </Layout>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function formatRange(min: number | null, max: number | null, suffix: string): string {
  if (min != null && max != null) {
    if (min === max) return `${min}${suffix}`;
    return `${min}–${max}${suffix}`;
  }
  if (max != null) return `${max}${suffix}`;
  if (min != null) return `${min}+${suffix}`;
  return '—';
}
