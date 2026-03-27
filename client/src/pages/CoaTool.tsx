import { useState, useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import { uploadCoaForTool, getCoaToolPageUrl, downloadRedactedPdf } from '../lib/api';

interface Region {
  id: string;
  page: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

let nextId = 1;
function genId() {
  return `r-${nextId++}`;
}

export default function CoaTool() {
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fileName, setFileName] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  // UI state
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Drawing state
  const [regions, setRegions] = useState<Region[]>([]);
  const [addingMode, setAddingMode] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; origW: number; origH: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Upload ───
  async function handleFile(file: File) {
    if (!file.type.includes('pdf')) {
      setError('Please upload a PDF file');
      return;
    }
    setUploading(true);
    setError(null);
    setRegions([]);
    setCurrentPage(0);
    try {
      const data = await uploadCoaForTool(file);
      setSessionId(data.sessionId);
      setPageCount(data.pageCount);
      setFileName(data.fileName);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to upload PDF');
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  // ─── Drawing helpers ───
  function getPercentPos(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (!addingMode) return;
    const pos = getPercentPos(e.clientX, e.clientY);
    if (!pos) return;
    setDrawStart(pos);
    setDrawCurrent(pos);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (drawStart) {
      const pos = getPercentPos(e.clientX, e.clientY);
      if (pos) setDrawCurrent(pos);
      return;
    }
    if (dragging) {
      const pos = getPercentPos(e.clientX, e.clientY);
      if (!pos) return;
      const dx = pos.x - dragging.startX;
      const dy = pos.y - dragging.startY;
      setRegions((prev) => prev.map((r) =>
        r.id === dragging.id
          ? { ...r, xPct: Math.max(0, Math.min(100 - r.wPct, dragging.origX + dx)), yPct: Math.max(0, Math.min(100 - r.hPct, dragging.origY + dy)) }
          : r,
      ));
      return;
    }
    if (resizing) {
      const pos = getPercentPos(e.clientX, e.clientY);
      if (!pos) return;
      const dx = pos.x - resizing.startX;
      const dy = pos.y - resizing.startY;
      setRegions((prev) => prev.map((r) =>
        r.id === resizing.id
          ? { ...r, wPct: Math.max(2, resizing.origW + dx), hPct: Math.max(1, resizing.origH + dy) }
          : r,
      ));
      return;
    }
  }

  function handleMouseUp() {
    if (drawStart && drawCurrent) {
      const x = Math.min(drawStart.x, drawCurrent.x);
      const y = Math.min(drawStart.y, drawCurrent.y);
      const w = Math.abs(drawCurrent.x - drawStart.x);
      const h = Math.abs(drawCurrent.y - drawStart.y);
      if (w > 1 && h > 0.5) {
        setRegions((prev) => [...prev, { id: genId(), page: currentPage, xPct: x, yPct: y, wPct: w, hPct: h }]);
      }
      setDrawStart(null);
      setDrawCurrent(null);
      setAddingMode(false);
      return;
    }
    if (dragging) { setDragging(null); return; }
    if (resizing) { setResizing(null); return; }
  }

  // ─── Region actions ───
  function deleteRegion(id: string) {
    setRegions((prev) => prev.filter((r) => r.id !== id));
  }

  // ─── Download ───
  const handleDownload = useCallback(async () => {
    if (!sessionId || regions.length === 0) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await downloadRedactedPdf(
        sessionId,
        regions.map(({ page, xPct, yPct, wPct, hPct }) => ({ page, xPct, yPct, wPct, hPct })),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, '') + '_redacted.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to generate redacted PDF');
    } finally {
      setDownloading(false);
    }
  }, [sessionId, regions, fileName]);

  // ─── Reset ───
  function handleReset() {
    setSessionId(null);
    setPageCount(0);
    setFileName('');
    setCurrentPage(0);
    setRegions([]);
    setError(null);
  }

  const pageRegions = regions.filter((r) => r.page === currentPage);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">CoA Redaction Tool</h1>
            <p className="text-sm text-muted mt-1">Upload a CoA PDF, draw redaction regions, and download the redacted version.</p>
          </div>
          {sessionId && (
            <button
              onClick={handleReset}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-primary hover:bg-gray-50 dark:hover:bg-white/5 transition"
            >
              Upload New PDF
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Upload zone */}
        {!sessionId && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-16 cursor-pointer transition ${
              dragOver
                ? 'border-brand-teal bg-brand-teal/5'
                : 'border-gray-300 dark:border-gray-600 hover:border-brand-teal/50'
            } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
          >
            {uploading ? (
              <>
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-teal border-t-transparent mb-4" />
                <p className="text-sm text-muted">Processing PDF pages...</p>
              </>
            ) : (
              <>
                <svg className="h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <p className="text-sm font-medium text-primary">Drop a PDF here or click to browse</p>
                <p className="text-xs text-muted mt-1">Max 50 MB</p>
              </>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
          </div>
        )}

        {/* Editor */}
        {sessionId && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            {/* Page viewer */}
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {pageCount > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
                      >
                        &lsaquo;
                      </button>
                      <span className="text-sm px-2">Page {currentPage + 1} of {pageCount}</span>
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
                      addingMode ? 'bg-brand-teal text-white' : 'border border-gray-300 dark:border-gray-600 text-primary hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    {addingMode ? 'Drawing... (click & drag)' : '+ Add Region'}
                  </button>
                </div>
                <span className="text-xs text-muted">{regions.length} region{regions.length !== 1 ? 's' : ''} total</span>
              </div>

              {/* Canvas */}
              <div
                ref={containerRef}
                className={`relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden select-none ${addingMode ? 'cursor-crosshair' : ''}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  src={getCoaToolPageUrl(sessionId, currentPage)}
                  alt={`Page ${currentPage + 1}`}
                  className="w-full block"
                  draggable={false}
                />

                {/* Existing regions on this page */}
                {pageRegions.map((r) => (
                  <div
                    key={r.id}
                    style={{ left: `${r.xPct}%`, top: `${r.yPct}%`, width: `${r.wPct}%`, height: `${r.hPct}%` }}
                    className="absolute border-2 border-red-500 bg-red-500/15"
                  >
                    {/* Drag handle (whole box) */}
                    <div
                      className="absolute inset-0 cursor-move"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const pos = getPercentPos(e.clientX, e.clientY);
                        if (pos) setDragging({ id: r.id, startX: pos.x, startY: pos.y, origX: r.xPct, origY: r.yPct });
                      }}
                    />

                    {/* Resize handle (SE corner) */}
                    <div
                      className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-red-500"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const pos = getPercentPos(e.clientX, e.clientY);
                        if (pos) setResizing({ id: r.id, startX: pos.x, startY: pos.y, origW: r.wPct, origH: r.hPct });
                      }}
                    />

                    {/* Delete button */}
                    <button
                      className="absolute -top-5 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] leading-none hover:bg-red-600"
                      onClick={(e) => { e.stopPropagation(); deleteRegion(r.id); }}
                      title="Delete region"
                    >
                      &times;
                    </button>
                  </div>
                ))}

                {/* Drawing preview */}
                {drawStart && drawCurrent && (
                  <div
                    style={{
                      left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
                      top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
                      width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
                      height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
                    }}
                    className="absolute border-2 border-dashed border-brand-teal bg-brand-teal/10 pointer-events-none"
                  />
                )}
              </div>
            </div>

            {/* Sidebar — region list + download */}
            <div className="space-y-4">
              <div className="rounded-lg surface border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <h3 className="font-semibold text-primary text-sm">
                  {fileName}
                </h3>
                <p className="text-xs text-muted">{pageCount} page{pageCount !== 1 ? 's' : ''}</p>

                <button
                  onClick={handleDownload}
                  disabled={downloading || regions.length === 0}
                  className="w-full rounded-lg bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-blue disabled:opacity-50"
                >
                  {downloading ? 'Generating PDF...' : `Download Redacted (${regions.length} region${regions.length !== 1 ? 's' : ''})`}
                </button>
              </div>

              {/* Region list */}
              {regions.length > 0 && (
                <div className="rounded-lg surface border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 max-h-96 overflow-y-auto">
                  {regions
                    .sort((a, b) => a.page - b.page || a.yPct - b.yPct)
                    .map((r) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div>
                          <span className="font-medium text-primary">Page {r.page + 1}</span>
                          <span className="text-muted ml-2">
                            {r.wPct.toFixed(0)}% &times; {r.hPct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {r.page !== currentPage && (
                            <button
                              onClick={() => setCurrentPage(r.page)}
                              className="text-brand-teal hover:underline"
                            >
                              Go to
                            </button>
                          )}
                          <button
                            onClick={() => deleteRegion(r.id)}
                            className="text-red-500 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {regions.length === 0 && sessionId && (
                <div className="rounded-lg surface border border-gray-200 dark:border-gray-700 p-4 text-center">
                  <p className="text-xs text-muted">No regions yet. Click "+ Add Region" and draw on the page.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
