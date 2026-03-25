import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import ProductImage from '../components/ProductImage';
import RedactionEditor from '../components/RedactionEditor';
import {
  fetchPendingProducts,
  approveProduct,
  rejectProduct,
  approveEdit,
  rejectEdit,
  triggerSync,
  getRedactionPageUrl,
  initializeRedaction,
  type PendingProduct,
} from '../lib/api';

const FIELD_LABELS: Record<string, string> = {
  pricePerUnit: 'Price ($/g)',
  gramsAvailable: 'Available (g)',
  upcomingQty: 'Upcoming (g)',
  minQtyRequest: 'Min QTY (g)',
  description: 'Description',
  certification: 'Certification',
  dominantTerpene: 'Terpene Profile',
  totalTerpenePercent: 'Total Terpenes %',
  highestTerpenes: 'Terpene Breakdown',
  harvestDate: 'Harvest Date',
  thcMin: 'THC %',
  cbdMin: 'CBD %',
};

// These duplicate thcMin/cbdMin (seller sends both min+max as the same value) — hide from diff
const HIDDEN_DIFF_KEYS = new Set(['thcMax', 'cbdMax']);

function formatFieldValue(key: string, value: any): string {
  if (value === null || value === undefined) return '—';
  if (key === 'pricePerUnit') return `$${Number(value).toFixed(2)}`;
  if (key === 'gramsAvailable' || key === 'upcomingQty' || key === 'minQtyRequest') return `${Number(value).toLocaleString()}g`;
  if (key === 'totalTerpenePercent') return `${value}%`;
  if (key === 'thcMin' || key === 'cbdMin') return `${Number(value).toFixed(2)}%`;
  if (key === 'harvestDate') return value ? new Date(value).toLocaleDateString() : '—';
  return String(value);
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

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Indica: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Hybrid: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
};

const CERT_COLORS: Record<string, string> = {
  GACP: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  GMP1: 'bg-brand-sage/20 text-brand-teal dark:text-brand-sage',
  GMP2: 'bg-brand-sage/20 text-brand-teal dark:text-brand-sage',
  GPP: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'IMC-GAP': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

function Spec({ label, value, highlighted }: { label: string; value: string; highlighted?: boolean }) {
  return (
    <div className={`rounded-lg surface-muted px-3 py-2 ${highlighted ? 'ring-2 ring-green-400/60 bg-green-50 dark:bg-green-900/15' : ''}`}>
      <p className="text-xs font-medium text-faint">{label}</p>
      <p className="text-sm font-semibold text-primary">{value}</p>
    </div>
  );
}

function ProductPreview({ product, isEditRequest, onReload }: { product: PendingProduct; isEditRequest: boolean; onReload: () => void }) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  // For edit requests, merge pending edits to show the "after" state
  const pending = product.pendingEdits || {};
  const { newImageUrls: _newImgs, imageUrls: _reorderedImgs, ...fieldEdits } = pending;
  const merged = isEditRequest ? { ...product, ...fieldEdits } as PendingProduct : product;
  const changedKeys = new Set(Object.keys(fieldEdits));

  const images = merged.imageUrls || [];
  const budSizes = [
    { label: '0-1cm (Popcorn)', value: merged.budSizePopcorn },
    { label: '1-2cm (Small)', value: merged.budSizeSmall },
    { label: '2-3cm (Medium)', value: merged.budSizeMedium },
    { label: '3-5cm (Large)', value: merged.budSizeLarge },
    { label: '5cm+ (X-Large)', value: merged.budSizeXLarge },
  ].filter((b) => b.value != null && b.value > 0);

  const terpenes = merged.dominantTerpene?.split(';').map((t) => t.trim()).filter(Boolean) || [];
  const hasTerpeneSection = terpenes.length > 0 || merged.highestTerpenes || merged.aromas;

  const isChanged = (key: string) => isEditRequest && changedKeys.has(key);

  const validImages = images
    .map((url, i) => ({ url, index: i }))
    .filter(({ index }) => !failedImages.has(index));
  const currentFailed = failedImages.has(selectedImage);

  return (
    <div className="mt-4 border-t border-default pt-4">
      {isEditRequest && changedKeys.size > 0 && (
        <div className="mb-3 flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          <span>Fields highlighted with a green border reflect proposed changes.</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Image Gallery */}
        {validImages.length > 0 && (
          <div className="rounded-lg border border-default surface p-3">
            <div className="mb-2 flex items-center justify-center overflow-hidden rounded-lg surface-muted" style={{ minHeight: '240px' }}>
              {images[selectedImage] && !currentFailed && (
                <ProductImage
                  src={images[selectedImage]}
                  alt={`${merged.name} — image ${selectedImage + 1}`}
                  className="max-h-[360px] w-full object-contain"
                  onLoadError={() => {
                    setFailedImages(prev => {
                      const next = new Set(prev);
                      next.add(selectedImage);
                      return next;
                    });
                    const nextValid = images.findIndex((_, i) => i !== selectedImage && !failedImages.has(i));
                    if (nextValid !== -1) setSelectedImage(nextValid);
                  }}
                />
              )}
            </div>
            {validImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {validImages.map(({ url, index }) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      index === selectedImage ? 'border-brand-teal' : 'border-transparent hover:border-default'
                    }`}
                  >
                    <ProductImage
                      src={url}
                      alt={`Thumbnail ${index + 1}`}
                      className="h-full w-full object-cover"
                      onLoadError={() => {
                        setFailedImages(prev => {
                          const next = new Set(prev);
                          next.add(index);
                          return next;
                        });
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          {merged.category && (
            <span className="rounded-full surface-muted px-3 py-1 text-xs font-medium text-secondary">{merged.category}</span>
          )}
          {merged.type && (
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${TYPE_COLORS[merged.type] || 'surface-muted text-secondary'}`}>
              {merged.type}
            </span>
          )}
          {merged.certification && merged.certification.split(', ').map((cert) => (
            <span key={cert} className={`rounded-full px-3 py-1 text-xs font-medium ${CERT_COLORS[cert.trim()] || 'surface-muted text-secondary'}`}>
              {cert.trim()}
            </span>
          ))}
        </div>

        {/* Description */}
        {merged.description && (
          <div className={`rounded-lg p-3 ${isChanged('description') ? 'ring-2 ring-green-400/60 bg-green-50 dark:bg-green-900/15' : 'surface-muted'}`}>
            <p className="mb-1 text-xs font-medium text-faint">Description</p>
            <p className="text-sm leading-relaxed text-secondary">{merged.description}</p>
          </div>
        )}

        {/* Specifications grid */}
        <div>
          <h4 className="mb-2 border-l-2 border-brand-teal pl-2 text-xs font-bold uppercase tracking-wide text-brand-teal dark:text-brand-sage">Specifications</h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {merged.pricePerUnit != null && (
              <Spec label="Price" value={`$${merged.pricePerUnit.toFixed(2)}/g`} highlighted={isChanged('pricePerUnit')} />
            )}
            <Spec label="THC" value={formatRange(merged.thcMin, merged.thcMax, '%')} highlighted={isChanged('thcMin') || isChanged('thcMax')} />
            <Spec label="CBD" value={formatRange(merged.cbdMin, merged.cbdMax, '%')} highlighted={isChanged('cbdMin') || isChanged('cbdMax')} />
            <Spec label="Available" value={merged.gramsAvailable != null ? `${merged.gramsAvailable.toLocaleString()}g` : '—'} highlighted={isChanged('gramsAvailable')} />
            {(merged.upcomingQty != null && merged.upcomingQty > 0) && (
              <Spec label="Upcoming" value={`${merged.upcomingQty.toLocaleString()}g`} highlighted={isChanged('upcomingQty')} />
            )}
            {merged.minQtyRequest != null && (
              <Spec label="Min Order" value={`${merged.minQtyRequest.toLocaleString()}g`} highlighted={isChanged('minQtyRequest')} />
            )}
            {merged.growthMedium && <Spec label="Growth Medium" value={merged.growthMedium} highlighted={isChanged('growthMedium')} />}
            {merged.lineage && <Spec label="Lineage" value={merged.lineage} highlighted={isChanged('lineage')} />}
            {merged.harvestDate && (
              <Spec label="Harvest Date" value={new Date(merged.harvestDate).toLocaleDateString()} highlighted={isChanged('harvestDate')} />
            )}
            {merged.licensedProducer && <Spec label="Licensed Producer" value={merged.licensedProducer} highlighted={isChanged('licensedProducer')} />}
          </div>
        </div>

        {/* Terpene profile */}
        {hasTerpeneSection && (
          <div>
            <h4 className="mb-2 border-l-2 border-brand-sage pl-2 text-xs font-bold uppercase tracking-wide text-brand-teal dark:text-brand-sage">Terpene Profile</h4>
            {terpenes.length > 0 && (
              <div className={`mb-2 rounded-lg p-2 ${isChanged('dominantTerpene') ? 'ring-2 ring-green-400/60 bg-green-50 dark:bg-green-900/15' : ''}`}>
                <p className="mb-1 text-xs font-medium text-muted">Dominant Terpenes</p>
                <div className="flex flex-wrap gap-1.5">
                  {terpenes.map((t) => (
                    <span key={t} className="rounded-full bg-brand-sage/20 px-2.5 py-0.5 text-xs font-medium text-brand-teal dark:text-brand-sage">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {merged.totalTerpenePercent != null && (
              <p className={`mb-1 text-xs text-secondary ${isChanged('totalTerpenePercent') ? 'font-semibold text-green-700 dark:text-green-400' : ''}`}>
                Total Terpenes: {merged.totalTerpenePercent}%
              </p>
            )}
            {merged.highestTerpenes && (
              <div className={`mb-2 ${isChanged('highestTerpenes') ? 'rounded-lg ring-2 ring-green-400/60 bg-green-50 dark:bg-green-900/15 p-2' : ''}`}>
                <p className="mb-0.5 text-xs font-medium text-muted">Breakdown</p>
                <p className="whitespace-pre-line text-sm text-secondary">{merged.highestTerpenes}</p>
              </div>
            )}
            {merged.aromas && (
              <div className={isChanged('aromas') ? 'rounded-lg ring-2 ring-green-400/60 bg-green-50 dark:bg-green-900/15 p-2' : ''}>
                <p className="mb-0.5 text-xs font-medium text-muted">Aromas</p>
                <p className="whitespace-pre-line text-sm text-secondary">{merged.aromas}</p>
              </div>
            )}
          </div>
        )}

        {/* Bud size distribution */}
        {budSizes.length > 0 && (
          <div>
            <h4 className="mb-2 border-l-2 border-brand-blue pl-2 text-xs font-bold uppercase tracking-wide text-brand-teal dark:text-brand-sage">Bud Size Distribution</h4>
            <div className="space-y-1.5">
              {budSizes.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs text-secondary">{b.label}</span>
                  <div className="h-3.5 flex-1 overflow-hidden rounded-full surface-muted">
                    <div
                      className="h-full rounded-full bg-brand-teal transition-all"
                      style={{ width: `${b.value}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-secondary">{b.value}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CoA info (display only) */}
        {(merged.labName || merged.testDate || merged.reportNumber) && (
          <div>
            <h4 className="mb-2 border-l-2 border-brand-teal pl-2 text-xs font-bold uppercase tracking-wide text-brand-teal dark:text-brand-sage">CoA Info</h4>
            <div className="grid gap-2 sm:grid-cols-3">
              {merged.labName && <Spec label="Lab" value={merged.labName} />}
              {merged.testDate && <Spec label="Test Date" value={new Date(merged.testDate).toLocaleDateString()} />}
              {merged.reportNumber && <Spec label="Report #" value={merged.reportNumber} />}
            </div>
          </div>
        )}

        {/* CoA PDF preview */}
        {merged.coaOriginalKey && (merged.coaPageCount ?? 0) > 0 ? (
          <CoaPagePreview productId={merged.id} pageCount={merged.coaPageCount!} />
        ) : merged.coaUrls && merged.coaUrls.length > 0 ? (
          <CoaPdfEmbed urls={merged.coaUrls} productId={merged.id} onInitialized={onReload} />
        ) : null}
      </div>
    </div>
  );
}

function CoaPagePreview({ productId, pageCount }: { productId: string; pageCount: number }) {
  const [currentPage, setCurrentPage] = useState(0);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingPage(true);
    getRedactionPageUrl(productId, currentPage)
      .then((data) => { if (!cancelled) setPageUrl(data.url); })
      .catch(() => { if (!cancelled) setPageUrl(null); })
      .finally(() => { if (!cancelled) setLoadingPage(false); });
    return () => { cancelled = true; };
  }, [productId, currentPage]);

  return (
    <div>
      <h4 className="mb-2 border-l-2 border-brand-coral pl-2 text-xs font-bold uppercase tracking-wide text-brand-coral">
        CoA Document ({pageCount} page{pageCount !== 1 ? 's' : ''})
      </h4>
      {pageCount > 1 && (
        <div className="mb-2 flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="rounded border border-default px-2 py-0.5 text-xs disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-xs text-secondary">
            Page {currentPage + 1} of {pageCount}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={currentPage >= pageCount - 1}
            className="rounded border border-default px-2 py-0.5 text-xs disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-default">
        {loadingPage ? (
          <div className="flex h-[400px] items-center justify-center surface-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-teal border-t-transparent" />
          </div>
        ) : pageUrl ? (
          <img src={pageUrl} alt={`CoA page ${currentPage + 1}`} className="w-full h-auto" />
        ) : (
          <div className="flex h-[200px] items-center justify-center surface-muted text-sm text-muted">
            Page image not available
          </div>
        )}
      </div>
    </div>
  );
}

function CoaPdfEmbed({ urls, productId, onInitialized }: { urls: string[]; productId: string; onInitialized: () => void }) {
  const [initializing, setInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  async function handleInitialize() {
    setInitializing(true);
    setInitError(null);
    try {
      await initializeRedaction(productId);
      onInitialized();
    } catch (err: any) {
      setInitError(err?.response?.data?.error || 'Failed to initialize redaction');
    } finally {
      setInitializing(false);
    }
  }

  return (
    <div>
      <h4 className="mb-2 border-l-2 border-brand-coral pl-2 text-xs font-bold uppercase tracking-wide text-brand-coral">
        CoA Document{urls.length > 1 ? 's' : ''}
      </h4>
      <div className="rounded-lg border border-default surface-muted p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-coral/10">
            <svg className="h-5 w-5 text-brand-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-primary">
              {urls.length} CoA PDF{urls.length > 1 ? 's' : ''} uploaded
            </p>
            <p className="mt-1 text-xs text-muted">
              This product was uploaded before the redaction system was active. Set up redaction to review and redact client info.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {urls.map((url, i) => {
                const absoluteUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
                return (
                  <a
                    key={i}
                    href={absoluteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-default px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-brand-teal/10 hover:text-brand-teal"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    {urls.length > 1 ? `View CoA ${i + 1}` : 'View CoA PDF'}
                  </a>
                );
              })}
              <button
                onClick={handleInitialize}
                disabled={initializing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-coral px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-coral/90 disabled:opacity-50"
              >
                {initializing ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                    Set Up Redaction
                  </>
                )}
              </button>
            </div>
            {initError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{initError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PendingProducts() {
  const [products, setProducts] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [rejectReasonFor, setRejectReasonFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [redactionEditorFor, setRedactionEditorFor] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPendingProducts();
      setProducts(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load pending products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApproveNew(id: string) {
    setActionInProgress(id);
    try {
      await approveProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to approve product');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleRejectNew(id: string, name: string) {
    if (!confirm(`Reject and delete "${name}"? This cannot be undone.`)) return;
    setActionInProgress(id);
    try {
      await rejectProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reject product');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleApproveEdit(id: string) {
    setActionInProgress(id);
    try {
      await approveEdit(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to approve edit');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleRejectEdit(id: string) {
    setActionInProgress(id);
    try {
      await rejectEdit(id, rejectReason || undefined);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setRejectReasonFor(null);
      setRejectReason('');
      if (expandedId === id) setExpandedId(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reject edit');
    } finally {
      setActionInProgress(null);
    }
  }

  function togglePreview(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await triggerSync();
      const r = res.result;
      const parts: string[] = [];
      if (r.products) parts.push(`${r.products.synced} products synced`);
      if (r.contacts) parts.push(`${r.contacts.synced} contacts synced`);
      setSyncMsg(parts.join(', ') || 'Sync completed');
      load();
    } catch (err: any) {
      setSyncMsg(err?.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-primary">Pending Products</h2>
          <p className="text-sm text-muted">
            Review and approve new listings and seller-submitted edits.
          </p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue teal:from-brand-yellow teal:to-brand-coral" />
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-lg border border-default px-3 py-1.5 text-xs font-medium text-secondary transition hover-surface-muted disabled:opacity-50"
        >
          <svg className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {syncMsg && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-brand-sage/40 bg-brand-sage/10 p-3">
          <span className="text-sm font-medium text-brand-teal">{syncMsg}</span>
          <button onClick={() => setSyncMsg(null)} className="text-brand-sage hover:text-brand-teal">&times;</button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      )}

      {!loading && products.length === 0 && (
        <div className="rounded-lg border border-brand-gray dark:border-slate-700 surface p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sage/10 dark:bg-brand-sage/20 teal:bg-brand-yellow/15">
            <svg className="h-8 w-8 text-brand-sage teal:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-secondary">All caught up</h3>
          <p className="text-sm text-muted">No products are waiting for approval.</p>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="space-y-3">
          {products.map((product) => {
            const isEditRequest = product.editPending && product.pendingEdits;
            const isNewListing = product.requestPending;
            const pending = product.pendingEdits || {};
            const { newImageUrls, imageUrls: reorderedImageUrls, ...fieldChanges } = pending;
            const hasFieldChanges = Object.keys(fieldChanges).length > 0;
            const hasImageChanges = !!(newImageUrls?.length || reorderedImageUrls);
            const isExpanded = expandedId === product.id;

            return (
              <div
                key={product.id}
                className={`rounded-lg border border-l-4 p-4 ${
                  isEditRequest
                    ? 'border-orange-200 dark:border-orange-800/40 border-l-orange-400 bg-orange-50/50 dark:bg-orange-900/10'
                    : 'border-amber-200 dark:border-amber-800/40 border-l-amber-400 bg-amber-50/50 dark:bg-amber-900/10'
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {/* Header */}
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-primary">{product.name}</h3>
                      {product.category && (
                        <span className="rounded-full surface-muted px-2 py-0.5 text-xs font-medium text-secondary">
                          {product.category}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        isEditRequest
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }`}>
                        {isEditRequest ? 'Edit Request' : 'New Listing'}
                      </span>
                      <button
                        onClick={() => togglePreview(product.id)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                          isExpanded
                            ? 'bg-brand-teal/10 text-brand-teal dark:text-brand-sage'
                            : 'surface-muted text-secondary hover:bg-brand-teal/10 hover:text-brand-teal dark:hover:text-brand-sage'
                        }`}
                      >
                        <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          {isExpanded ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                          ) : (
                            <>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </>
                          )}
                        </svg>
                        {isExpanded ? 'Hide' : 'Preview'}
                      </button>
                      {isNewListing && product.coaOriginalKey && (
                        <button
                          onClick={() => setRedactionEditorFor(redactionEditorFor === product.id ? null : product.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                            redactionEditorFor === product.id
                              ? 'bg-brand-coral/15 text-brand-coral'
                              : 'surface-muted text-secondary hover:bg-brand-coral/10 hover:text-brand-coral'
                          }`}
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                          </svg>
                          {(product.redactionRegionCount ?? 0) > 0
                            ? `Edit Redactions (${product.redactionRegionCount})`
                            : 'Review CoA'}
                        </button>
                      )}
                    </div>

                    {/* Current stats for new listings */}
                    {isNewListing && !isExpanded && (
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                        {product.pricePerUnit != null && (
                          <span><span className="font-medium text-faint">Price:</span> ${product.pricePerUnit.toFixed(2)}/g</span>
                        )}
                        {product.gramsAvailable != null && (
                          <span><span className="font-medium text-faint">Available:</span> {product.gramsAvailable.toLocaleString()}g</span>
                        )}
                        {product.thcMax != null && (
                          <span><span className="font-medium text-faint">THC:</span> {product.thcMax}%</span>
                        )}
                        {product.cbdMax != null && (
                          <span><span className="font-medium text-faint">CBD:</span> {product.cbdMax}%</span>
                        )}
                      </div>
                    )}

                    {/* Diff view for edit requests (compact, only when NOT expanded) */}
                    {isEditRequest && hasFieldChanges && !isExpanded && (
                      <div className="mt-2 space-y-1">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Proposed Changes</h4>
                        <div className="rounded-md border border-default surface p-3 text-sm">
                          {Object.entries(fieldChanges).filter(([key]) => !HIDDEN_DIFF_KEYS.has(key)).map(([key, newValue]) => {
                            const currentValue = (product as any)[key];
                            return (
                              <div key={key} className="flex items-baseline gap-2 py-0.5">
                                <span className="w-32 text-xs font-medium text-faint">{FIELD_LABELS[key] || key}:</span>
                                <span className="text-xs text-red-500 line-through">{formatFieldValue(key, currentValue)}</span>
                                <span className="text-xs text-brand-teal font-medium">{formatFieldValue(key, newValue)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Image changes (compact, only when NOT expanded) */}
                    {isEditRequest && hasImageChanges && !isExpanded && (
                      <div className="mt-2 space-y-1">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Image Changes</h4>
                        <div className="rounded-md border border-default surface p-3">
                          {reorderedImageUrls && (
                            <div className="mb-2">
                              <span className="text-xs text-muted">Reordered ({(reorderedImageUrls as string[]).length} images):</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(reorderedImageUrls as string[]).map((url: string, i: number) => (
                                  <div key={i} className="relative h-10 w-10 overflow-hidden rounded border border-default">
                                    <ProductImage src={url} alt={`Reordered ${i + 1}`} className="h-full w-full object-cover" />
                                    {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-brand-teal/80 text-center text-[8px] font-bold text-white">Main</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {newImageUrls && (newImageUrls as string[]).length > 0 && (
                            <div>
                              <span className="text-xs text-muted">{(newImageUrls as string[]).length} new image{(newImageUrls as string[]).length !== 1 ? 's' : ''} uploaded:</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(newImageUrls as string[]).map((url: string, i: number) => (
                                  <div key={i} className="relative h-10 w-10 overflow-hidden rounded border border-orange-300">
                                    <ProductImage src={url} alt={`New ${i + 1}`} className="h-full w-full object-cover" />
                                    <span className="absolute bottom-0 left-0 right-0 bg-orange-500/80 text-center text-[8px] font-bold text-white">New</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="mt-2 text-xs text-faint">
                      Submitted by {product.seller.companyName || product.seller.email}
                      {' '}on {new Date(product.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 flex-col gap-2">
                    {isNewListing && (
                      <>
                        <button
                          onClick={() => handleApproveNew(product.id)}
                          disabled={actionInProgress === product.id}
                          className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-blue disabled:opacity-50"
                        >
                          {actionInProgress === product.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleRejectNew(product.id, product.name)}
                          disabled={actionInProgress === product.id}
                          className="rounded-lg border border-red-300 dark:border-red-700 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {isEditRequest && (
                      <>
                        <button
                          onClick={() => handleApproveEdit(product.id)}
                          disabled={actionInProgress === product.id}
                          className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-blue disabled:opacity-50"
                        >
                          {actionInProgress === product.id ? '...' : 'Approve Changes'}
                        </button>
                        {rejectReasonFor === product.id ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              placeholder="Reason (optional)"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="w-full input-field text-xs"
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleRejectEdit(product.id)}
                                disabled={actionInProgress === product.id}
                                className="flex-1 rounded-lg bg-red-500 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                              >
                                {actionInProgress === product.id ? '...' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => { setRejectReasonFor(null); setRejectReason(''); }}
                                className="rounded-lg border border-default px-2 py-1.5 text-xs text-secondary"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRejectReasonFor(product.id)}
                            disabled={actionInProgress === product.id}
                            className="rounded-lg border border-red-300 dark:border-red-700 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                          >
                            Reject Changes
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Expandable Preview */}
                {isExpanded && (
                  <ProductPreview product={product} isEditRequest={!!isEditRequest} onReload={load} />
                )}

                {/* Redaction Editor */}
                {redactionEditorFor === product.id && (
                  <div className="mt-4 border-t border-default pt-4">
                    <RedactionEditor
                      productId={product.id}
                      onApplied={() => {
                        setRedactionEditorFor(null);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
