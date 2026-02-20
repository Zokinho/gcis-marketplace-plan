import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import TestResultsDisplay from '../components/TestResultsDisplay';
import HarvexLogo from '../components/HarvexLogo';
import ProductImage from '../components/ProductImage';
import { fetchSharedProducts, getSharedProductPdfUrl, type SharedProduct } from '../lib/api';

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700',
  Indica: 'bg-purple-100 dark:bg-purple-900/20 text-purple-700',
  Hybrid: 'bg-teal-100 dark:bg-teal-900/20 text-teal-700',
};

export default function SharedProductDetail() {
  const { token, id } = useParams<{ token: string; id: string }>();
  const [product, setProduct] = useState<SharedProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);

    fetchSharedProducts(token)
      .then((data) => {
        const found = data.products.find((p) => p.id === id);
        if (found) setProduct(found);
        else setError('Product not found in this share');
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 404) setError('This share link is invalid.');
        else if (status === 410) setError('This share link has expired.');
        else setError('Unable to load product.');
      })
      .finally(() => setLoading(false));
  }, [token, id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center surface-base">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex min-h-screen items-center justify-center surface-base">
        <div className="max-w-md rounded-lg surface p-8 text-center shadow-lg">
          <p className="text-muted">{error || 'Product not found'}</p>
          <Link to={`/share/${token}`} className="mt-3 inline-block text-sm font-medium text-brand-teal underline">
            Back to catalog
          </Link>
        </div>
      </div>
    );
  }

  const terpenes = product.dominantTerpene?.split(';').map((t) => t.trim()).filter(Boolean) || [];

  return (
    <div className="min-h-screen surface-base">
      {/* Header */}
      <header className="bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-4 py-3 shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <nav className="text-sm text-white/70">
            <Link to={`/share/${token}`} className="hover:text-white">Catalog</Link>
            <span className="mx-2">/</span>
            <span className="text-white">{product.name}</span>
          </nav>
          <HarvexLogo size="sm" color="white" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Product info */}
          <div className="space-y-6 lg:col-span-2">
            {/* Image Gallery */}
            {product.imageUrls && product.imageUrls.length > 0 && (
              <div className="rounded-lg border border-subtle surface p-4">
                <div className="mb-3 flex items-center justify-center overflow-hidden rounded-lg surface-muted" style={{ minHeight: '320px' }}>
                  <ProductImage
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
                          i === selectedImage ? 'border-brand-teal' : 'border-transparent hover:border-gray-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <ProductImage src={url} alt={`Thumbnail ${i + 1}`} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Header card */}
            <div className="rounded-lg border border-subtle surface p-6">
              <div className="mb-3 flex flex-wrap gap-2">
                {product.category && (
                  <span className="rounded-full surface-muted px-3 py-1 text-xs font-medium text-secondary">
                    {product.category}
                  </span>
                )}
                {product.type && (
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${TYPE_COLORS[product.type] || 'surface-muted text-secondary'}`}>
                    {product.type}
                  </span>
                )}
                {product.certification && product.certification.split(', ').map((cert) => (
                  <span key={cert} className="rounded-full bg-blue-100 dark:bg-blue-900/20 px-3 py-1 text-xs font-medium text-blue-700">
                    {cert.trim()}
                  </span>
                ))}
                {product.labName && (
                  <span className="rounded-full bg-brand-sage/20 px-3 py-1 text-xs font-medium text-brand-teal">
                    CoA Verified
                  </span>
                )}
              </div>

              <h1 className="mb-1 text-2xl font-bold text-primary">{product.name}</h1>

              {product.description && (
                <p className="mt-4 text-sm leading-relaxed text-secondary">{product.description}</p>
              )}
            </div>

            {/* Key specs */}
            <div className="rounded-lg border border-subtle surface p-6">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">Specifications</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {product.thcMax != null && (
                  <Spec label="THC" value={formatRange(product.thcMin, product.thcMax, '%')} />
                )}
                {product.cbdMax != null && (
                  <Spec label="CBD" value={formatRange(product.cbdMin, product.cbdMax, '%')} />
                )}
                {product.gramsAvailable != null && (
                  <Spec label="Available" value={`${product.gramsAvailable.toLocaleString()}g`} />
                )}
                {product.growthMedium && <Spec label="Growth Medium" value={product.growthMedium} />}
                {product.lineage && <Spec label="Lineage" value={product.lineage} />}
                {product.harvestDate && (
                  <Spec label="Harvest Date" value={new Date(product.harvestDate).toLocaleDateString()} />
                )}
              </div>
            </div>

            {/* Terpene profile */}
            {terpenes.length > 0 && (
              <div className="rounded-lg border border-subtle surface p-6">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">Terpene Profile</h2>
                <div className="flex flex-wrap gap-2">
                  {terpenes.map((t) => (
                    <span key={t} className="rounded-full bg-brand-sage/20 px-3 py-1 text-xs font-medium text-brand-teal dark:text-brand-sage">
                      {t}
                    </span>
                  ))}
                </div>
                {product.highestTerpenes && (
                  <p className="mt-3 whitespace-pre-line text-sm text-secondary">{product.highestTerpenes}</p>
                )}
              </div>
            )}

            {/* CoA Test Results */}
            {product.testResults && (
              <div className="rounded-lg border border-subtle surface p-6">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">
                  Certificate of Analysis
                </h2>
                <TestResultsDisplay
                  testResults={product.testResults}
                  labName={product.labName}
                  testDate={product.testDate}
                  reportNumber={product.reportNumber}
                />
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-lg border border-subtle surface p-6">
              <h3 className="mb-4 border-l-2 border-brand-teal pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal dark:text-brand-sage">Documents</h3>

              {/* PDF download */}
              {product.coaPdfUrl && token && (
                <a
                  href={getSharedProductPdfUrl(token, product.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 flex items-center gap-2 rounded-lg border border-subtle px-4 py-3 text-sm font-medium text-brand-teal dark:text-brand-sage transition hover:bg-brand-sage/10"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download CoA PDF
                </a>
              )}

              {/* Info */}
              {product.labName && (
                <div className="mt-4 space-y-2 text-xs text-muted">
                  <div className="flex justify-between">
                    <span>Lab</span>
                    <span className="font-medium text-secondary">{product.labName}</span>
                  </div>
                  {product.testDate && (
                    <div className="flex justify-between">
                      <span>Test Date</span>
                      <span className="font-medium text-secondary">
                        {new Date(product.testDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {product.reportNumber && (
                    <div className="flex justify-between">
                      <span>Report #</span>
                      <span className="font-medium text-secondary">{product.reportNumber}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 border-t border-subtle pt-4">
                <Link
                  to={`/share/${token}`}
                  className="text-sm font-medium text-brand-teal dark:text-brand-sage underline hover:text-brand-teal/80"
                >
                  Back to catalog
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-faint">{label}</p>
      <p className="text-sm font-semibold text-primary">{value}</p>
    </div>
  );
}

function formatRange(min: number | null, max: number | null, suffix: string): string {
  if (min != null && max != null) {
    if (min === max) return `${min}${suffix}`;
    return `${min}\u2013${max}${suffix}`;
  }
  if (max != null) return `${max}${suffix}`;
  if (min != null) return `${min}+${suffix}`;
  return '\u2014';
}
