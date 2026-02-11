import { useState, useCallback, useRef, useEffect } from 'react';
import {
  uploadCoaPdf,
  pollCoaJobStatus,
  previewCoaExtraction,
  confirmCoaExtraction,
  type CoaJobStatus,
  type CoaExtractedData,
} from '../lib/api';

type Step = 'upload' | 'processing' | 'preview' | 'done' | 'error';

export default function CoaUpload({ onProductCreated }: { onProductCreated?: (productId: string) => void }) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<CoaJobStatus | null>(null);
  const [preview, setPreview] = useState<CoaExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleFile = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setStep('processing');

    try {
      const result = await uploadCoaPdf(selectedFile);
      setJobId(result.jobId);

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const status = await pollCoaJobStatus(result.jobId);
          setJobStatus(status);

          if (status.status === 'review' || status.status === 'published') {
            if (pollRef.current) clearInterval(pollRef.current);

            // Fetch preview
            const previewData = await previewCoaExtraction(result.jobId);
            setPreview(previewData);
            setStep('preview');
          } else if (status.status === 'error' || status.status === 'flagged') {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(status.errorMessage || 'Processing failed');
            setStep('error');
          }
        } catch {
          // Keep polling on transient errors
        }
      }, 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Upload failed');
      setStep('error');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile],
  );

  const handleConfirm = async () => {
    if (!jobId) return;
    try {
      const result = await confirmCoaExtraction(jobId);
      setStep('done');
      onProductCreated?.(result.product.id);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create product');
      setStep('error');
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep('upload');
    setFile(null);
    setJobId(null);
    setJobStatus(null);
    setPreview(null);
    setError(null);
  };

  // Step indicators
  const steps = [
    { key: 'upload', label: 'Upload' },
    { key: 'processing', label: 'Processing' },
    { key: 'preview', label: 'Review' },
    { key: 'done', label: 'Complete' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="rounded-lg border bg-white p-6">
      {/* Progress stepper */}
      <div className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                i <= currentIdx
                  ? 'bg-brand-teal text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < currentIdx ? '\u2713' : i + 1}
            </div>
            <span className={`text-xs ${i <= currentIdx ? 'text-brand-teal font-medium' : 'text-gray-400'}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <div className={`h-px w-6 ${i < currentIdx ? 'bg-brand-teal/60' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Upload step */}
      {step === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition ${
            dragOver ? 'border-brand-teal bg-brand-sage/10' : 'border-gray-300 hover:border-brand-teal/60 hover:bg-gray-50'
          }`}
        >
          <svg className="mx-auto mb-3 h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-sm font-medium text-gray-700">Drop a CoA PDF here or click to browse</p>
          <p className="mt-1 text-xs text-gray-400">PDF files up to 50MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      )}

      {/* Processing step */}
      {step === 'processing' && (
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
          <p className="text-sm font-medium text-gray-700">Analyzing {file?.name}...</p>
          <p className="mt-1 text-xs text-gray-400">
            {jobStatus?.status === 'queued' && 'Queued for processing...'}
            {jobStatus?.status === 'processing' && `Processing ${jobStatus.pageCount || '...'} pages...`}
            {!jobStatus && 'Uploading...'}
          </p>
        </div>
      )}

      {/* Preview step */}
      {step === 'preview' && preview && (
        <div>
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Extracted Data</h3>
          <div className="mb-4 space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
            <Row label="Product Name" value={preview.mappedFields.name} />
            <Row label="Lab" value={preview.mappedFields.labName} />
            <Row label="Test Date" value={preview.mappedFields.testDate} />
            <Row label="Report #" value={preview.mappedFields.reportNumber} />
            <Row label="Type" value={preview.mappedFields.type} />
            <Row label="Producer" value={preview.mappedFields.licensedProducer} />
            <Row label="Lot/Code" value={preview.mappedFields.productCode} />
            <Row
              label="THC"
              value={formatRange(preview.mappedFields.thcMin, preview.mappedFields.thcMax, '%')}
            />
            <Row
              label="CBD"
              value={formatRange(preview.mappedFields.cbdMin, preview.mappedFields.cbdMax, '%')}
            />
            {preview.mappedFields.dominantTerpene && (
              <Row label="Terpenes" value={preview.mappedFields.dominantTerpene} />
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-white hover:bg-brand-teal/90"
            >
              Confirm & List Product
            </button>
            <button onClick={reset} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Done step */}
      {step === 'done' && (
        <div className="py-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-sage/20">
            <svg className="h-6 w-6 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">Product created successfully!</p>
          <button onClick={reset} className="mt-3 text-sm font-medium text-brand-teal underline hover:text-brand-teal/80">
            Upload another
          </button>
        </div>
      )}

      {/* Error step */}
      {step === 'error' && (
        <div className="py-6 text-center">
          <p className="mb-2 text-sm font-medium text-red-600">{error}</p>
          <button onClick={reset} className="text-sm font-medium text-brand-teal underline hover:text-brand-teal/80">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{String(value)}</span>
    </div>
  );
}

function formatRange(min: number | null, max: number | null, suffix: string): string | null {
  if (min != null && max != null) {
    if (min === max) return `${min}${suffix}`;
    return `${min}\u2013${max}${suffix}`;
  }
  if (max != null) return `${max}${suffix}`;
  if (min != null) return `${min}+${suffix}`;
  return null;
}
