import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchRedactionRegions,
  createRedactionRegion,
  updateRedactionRegion,
  deleteRedactionRegion,
  getRedactionPageUrl,
  applyRedactions as applyRedactionsApi,
  type RedactionRegion,
} from '../lib/api';

interface Props {
  productId: string;
  onApplied?: () => void;
}

interface RegionWithId extends RedactionRegion {
  id: string;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'border-green-500',
  medium: 'border-yellow-500',
  low: 'border-red-500',
};

const CONFIDENCE_BG: Record<string, string> = {
  high: 'bg-green-500/10',
  medium: 'bg-yellow-500/10',
  low: 'bg-red-500/10',
};

export default function RedactionEditor({ productId, onApplied }: Props) {
  const [regions, setRegions] = useState<RegionWithId[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [appliedAt, setAppliedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingMode, setAddingMode] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; origW: number; origH: number; origXPct: number; origYPct: number; handle: string } | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const updateTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Load regions and page image
  useEffect(() => {
    loadRegions();
  }, [productId]);

  useEffect(() => {
    loadPageImage();
  }, [productId, currentPage, appliedAt]);

  async function loadRegions() {
    try {
      setLoading(true);
      const data = await fetchRedactionRegions(productId);
      setRegions(data.regions);
      setPageCount(data.coaPageCount || 0);
    } catch {
      setError('Failed to load redaction regions');
    } finally {
      setLoading(false);
    }
  }

  async function loadPageImage() {
    try {
      const data = await getRedactionPageUrl(productId, currentPage);
      // Append cache-buster when images have been regenerated after applying redactions
      const url = appliedAt ? `${data.url}${data.url.includes('?') ? '&' : '?'}t=${appliedAt}` : data.url;
      setPageImageUrl(url);
    } catch {
      setPageImageUrl(null);
    }
  }

  // Debounced update to server
  const debouncedUpdate = useCallback((regionId: string, updates: Partial<RedactionRegion>) => {
    const existing = updateTimeoutRef.current.get(regionId);
    if (existing) clearTimeout(existing);
    const timeout = setTimeout(async () => {
      try {
        await updateRedactionRegion(productId, regionId, updates);
      } catch {
        // Silently fail — optimistic update already applied
      }
      updateTimeoutRef.current.delete(regionId);
    }, 500);
    updateTimeoutRef.current.set(regionId, timeout);
  }, [productId]);

  // Get container-relative position as percentage
  function getPercentPos(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }

  // Mouse handlers for drawing new regions
  function handleMouseDown(e: React.MouseEvent) {
    if (!addingMode) return;
    const pos = getPercentPos(e.clientX, e.clientY);
    if (!pos) return;
    setDrawStart(pos);
    setDrawCurrent(pos);
  }

  function handleMouseMove(e: React.MouseEvent) {
    // Handle drawing
    if (drawStart) {
      const pos = getPercentPos(e.clientX, e.clientY);
      if (pos) setDrawCurrent(pos);
      return;
    }

    // Handle dragging
    if (dragging) {
      const pos = getPercentPos(e.clientX, e.clientY);
      if (!pos) return;
      const dx = pos.x - dragging.startX;
      const dy = pos.y - dragging.startY;
      const newX = Math.max(0, Math.min(100, dragging.origX + dx));
      const newY = Math.max(0, Math.min(100, dragging.origY + dy));

      setRegions((prev) => prev.map((r) => r.id === dragging.id ? { ...r, xPct: newX, yPct: newY } : r));
      return;
    }

    // Handle resizing
    if (resizing) {
      const pos = getPercentPos(e.clientX, e.clientY);
      if (!pos) return;
      const dx = pos.x - resizing.startX;
      const dy = pos.y - resizing.startY;

      setRegions((prev) => prev.map((r) => {
        if (r.id !== resizing.id) return r;
        const updated = { ...r };
        if (resizing.handle.includes('e')) updated.wPct = Math.max(2, resizing.origW + dx);
        if (resizing.handle.includes('s')) updated.hPct = Math.max(1, resizing.origH + dy);
        if (resizing.handle.includes('w')) {
          updated.xPct = Math.max(0, resizing.origXPct + dx);
          updated.wPct = Math.max(2, resizing.origW - dx);
        }
        if (resizing.handle.includes('n')) {
          updated.yPct = Math.max(0, resizing.origYPct + dy);
          updated.hPct = Math.max(1, resizing.origH - dy);
        }
        return updated;
      }));
      return;
    }
  }

  async function handleMouseUp() {
    // Finish drawing
    if (drawStart && drawCurrent) {
      const x = Math.min(drawStart.x, drawCurrent.x);
      const y = Math.min(drawStart.y, drawCurrent.y);
      const w = Math.abs(drawCurrent.x - drawStart.x);
      const h = Math.abs(drawCurrent.y - drawStart.y);

      if (w > 1 && h > 0.5) {
        try {
          const result = await createRedactionRegion(productId, {
            page: currentPage,
            xPct: x,
            yPct: y,
            wPct: w,
            hPct: h,
            reason: 'Manual region',
            confidence: 'medium',
          });
          setRegions((prev) => [...prev, result.region]);
        } catch {
          setError('Failed to create region');
        }
      }

      setDrawStart(null);
      setDrawCurrent(null);
      setAddingMode(false);
      return;
    }

    // Finish dragging
    if (dragging) {
      const region = regions.find((r) => r.id === dragging.id);
      if (region) {
        debouncedUpdate(dragging.id, { xPct: region.xPct, yPct: region.yPct });
      }
      setDragging(null);
      return;
    }

    // Finish resizing
    if (resizing) {
      const region = regions.find((r) => r.id === resizing.id);
      if (region) {
        debouncedUpdate(resizing.id, { xPct: region.xPct, yPct: region.yPct, wPct: region.wPct, hPct: region.hPct });
      }
      setResizing(null);
      return;
    }
  }

  async function handleToggleApproved(regionId: string) {
    const region = regions.find((r) => r.id === regionId);
    if (!region) return;
    const newApproved = !region.approved;
    setRegions((prev) => prev.map((r) => r.id === regionId ? { ...r, approved: newApproved } : r));
    try {
      await updateRedactionRegion(productId, regionId, { approved: newApproved });
    } catch {
      setRegions((prev) => prev.map((r) => r.id === regionId ? { ...r, approved: !newApproved } : r));
    }
  }

  async function handleDeleteRegion(regionId: string) {
    setRegions((prev) => prev.filter((r) => r.id !== regionId));
    try {
      await deleteRedactionRegion(productId, regionId);
    } catch {
      loadRegions(); // Reload on failure
    }
  }

  async function handleApplyRedactions() {
    setApplying(true);
    setError(null);
    try {
      await applyRedactionsApi(productId);
      // Reload page images to show the redacted result (with cache bust)
      setAppliedAt(Date.now());
      onApplied?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to apply redactions');
    } finally {
      setApplying(false);
    }
  }

  const pageRegions = regions.filter((r) => r.page === currentPage);
  const approvedCount = regions.filter((r) => r.approved).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {/* Page navigation */}
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
              >
                &lsaquo;
              </button>
              <span className="text-sm px-2">
                Page {currentPage + 1} of {pageCount}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={currentPage >= pageCount - 1}
                className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
              >
                &rsaquo;
              </button>
            </div>
          )}

          <button
            onClick={() => setAddingMode(!addingMode)}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              addingMode
                ? 'bg-brand-teal text-white'
                : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {addingMode ? 'Drawing...' : '+ Add Region'}
          </button>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {approvedCount} of {regions.length} region{regions.length !== 1 ? 's' : ''} approved
          </span>
          {appliedAt && (
            <span className="text-green-600 dark:text-green-400 text-xs font-medium">
              Redacted PDF generated — preview updated
            </span>
          )}
          <button
            onClick={handleApplyRedactions}
            disabled={applying}
            className="px-4 py-1.5 bg-brand-teal text-white rounded-lg text-sm font-medium hover:bg-brand-teal/90 disabled:opacity-50 transition"
          >
            {applying ? 'Generating...' : 'Apply & Generate PDF'}
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div
        ref={containerRef}
        className={`relative border-2 rounded-lg overflow-hidden select-none ${
          addingMode ? 'border-brand-teal cursor-crosshair' : 'border-gray-200 dark:border-gray-700'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Page image */}
        {pageImageUrl ? (
          <img
            src={pageImageUrl}
            alt={`CoA page ${currentPage + 1}`}
            className="w-full h-auto block"
            draggable={false}
          />
        ) : (
          <div className="w-full h-[800px] bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
            Page image not available
          </div>
        )}

        {/* Redaction box overlays */}
        {pageRegions.map((region) => (
          <div
            key={region.id}
            className={`absolute border-2 ${
              region.approved
                ? `${CONFIDENCE_COLORS[region.confidence || 'medium']} ${CONFIDENCE_BG[region.confidence || 'medium']}`
                : 'border-dashed border-gray-400 bg-gray-200/30'
            } ${!addingMode && !dragging && !resizing ? 'cursor-move' : ''}`}
            style={{
              left: `${region.xPct}%`,
              top: `${region.yPct}%`,
              width: `${region.wPct}%`,
              height: `${region.hPct}%`,
              opacity: region.approved ? 0.7 : 0.4,
            }}
            onMouseDown={(e) => {
              if (addingMode) return;
              e.stopPropagation();
              const pos = getPercentPos(e.clientX, e.clientY);
              if (!pos) return;
              setDragging({ id: region.id, startX: pos.x, startY: pos.y, origX: region.xPct, origY: region.yPct });
            }}
          >
            {/* Reason label */}
            <div className="absolute top-0 left-0 px-1 text-[10px] font-medium bg-white/80 dark:bg-gray-900/80 text-gray-700 dark:text-gray-300 truncate max-w-full">
              {region.reason}
            </div>

            {/* Control buttons */}
            {!addingMode && !dragging && !resizing && (
              <div className="absolute -top-6 right-0 flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleApproved(region.id); }}
                  className={`w-5 h-5 rounded text-[10px] ${
                    region.approved
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                  }`}
                  title={region.approved ? 'Approved — click to unapprove' : 'Unapproved — click to approve'}
                >
                  {region.approved ? '\u2713' : '\u2717'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteRegion(region.id); }}
                  className="w-5 h-5 rounded bg-red-500 text-white text-[10px]"
                  title="Delete region"
                >
                  &times;
                </button>
              </div>
            )}

            {/* Resize handles (SE corner) */}
            {!addingMode && (
              <div
                className="absolute bottom-0 right-0 w-3 h-3 bg-white border border-gray-400 cursor-se-resize"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const pos = getPercentPos(e.clientX, e.clientY);
                  if (!pos) return;
                  setResizing({ id: region.id, startX: pos.x, startY: pos.y, origW: region.wPct, origH: region.hPct, origXPct: region.xPct, origYPct: region.yPct, handle: 'se' });
                }}
              />
            )}
          </div>
        ))}

        {/* Drawing preview */}
        {drawStart && drawCurrent && (
          <div
            className="absolute border-2 border-brand-teal bg-brand-teal/10"
            style={{
              left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
              top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
              width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
              height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
            }}
          />
        )}
      </div>

      {/* Region list */}
      {regions.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            All Redaction Regions ({regions.length})
          </h4>
          <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {regions.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between px-3 py-2 text-sm ${
                  r.page === currentPage ? 'bg-brand-teal/5' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    r.approved ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span className="text-gray-500 dark:text-gray-400">p.{r.page + 1}</span>
                  <span className="text-gray-700 dark:text-gray-300">{r.reason}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    r.confidence === 'high' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                    r.confidence === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                    'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  }`}>
                    {r.confidence}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    r.source === 'ai' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                    'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    {r.source === 'ai' ? 'AI' : 'Manual'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {r.page !== currentPage && (
                    <button
                      onClick={() => setCurrentPage(r.page)}
                      className="text-xs text-brand-teal hover:underline"
                    >
                      Go to page
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleApproved(r.id)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {r.approved ? 'Unapprove' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleDeleteRegion(r.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
