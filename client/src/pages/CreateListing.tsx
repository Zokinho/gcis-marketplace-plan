import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import TerpeneAutocomplete from '../components/TerpeneAutocomplete';
import TerpenePercentageTable from '../components/TerpenePercentageTable';
import { createListing, analyzeCoaPdf, type AnalyzedCoaFields, type RedactionRegion } from '../lib/api';

const FORM_CACHE_KEY = 'create-listing-draft';

interface FormDraft {
  name: string; description: string; category: string; type: string;
  licensedProducer: string; lineage: string; growthMedium: string; harvestDate: string;
  certifications: string[]; thc: string; cbd: string;
  terpenes: string[]; terpenePercentages: Record<string, string>; totalTerpenePercent: string;
  gramsAvailable: string; upcomingQty: string; minQtyRequest: string; pricePerUnit: string;
  budPopcorn: string; budSmall: string; budMedium: string; budLarge: string; budXLarge: string;
  scanResult: AnalyzedCoaFields | null; scanFileName: string | null;
  autoFilledFields: string[];
}

function loadDraft(): Partial<FormDraft> | null {
  try {
    const raw = sessionStorage.getItem(FORM_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearDraft() {
  sessionStorage.removeItem(FORM_CACHE_KEY);
}

const CATEGORIES = [
  'Cannabis flowers (mix sizes)',
  'Cannabis flowers (smalls only)',
  'Cannabis flowers (fresh frozen)',
  'Cannabis flowers (outdoor grown)',
  'Cannabis flowers (outdoor fresh frozen)',
  'Milled Flower',
  'Cannabis trimmings',
  'Cannabis kief',
  'Cannabis hash',
  'Cannabis cured rosins and cured resins',
  'Cannabis hashish',
  'Cannabis live rosin and live resin',
  'Cannabinoid isolates',
  'Cannabinoid distillates',
  "Cannabis crude oils ('resins')",
  'Genetics',
  'Chocolates',
  'Gummies',
  'Edibles (others)',
];
const TYPES = ['Sativa', 'Indica', 'Hybrid'];
const CERTIFICATIONS = ['GACP', 'GMP1', 'GMP2', 'GPP', 'IMC-GAP'];

export default function CreateListing() {
  const navigate = useNavigate();
  const draft = useMemo(() => loadDraft(), []);
  const [hasDraft] = useState(() => draft !== null && Object.values(draft).some((v) => v !== '' && v !== null && !(Array.isArray(v) && v.length === 0)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic info
  const [name, setName] = useState(draft?.name ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [category, setCategory] = useState(draft?.category ?? '');
  const [type, setType] = useState(draft?.type ?? '');

  // Origin & production
  const [licensedProducer, setLicensedProducer] = useState(draft?.licensedProducer ?? '');
  const [lineage, setLineage] = useState(draft?.lineage ?? '');
  const [growthMedium, setGrowthMedium] = useState(draft?.growthMedium ?? '');
  const [harvestDate, setHarvestDate] = useState(draft?.harvestDate ?? '');
  const [certifications, setCertifications] = useState<string[]>(draft?.certifications ?? []);

  // Potency & terpenes
  const [thc, setThc] = useState(draft?.thc ?? '');
  const [cbd, setCbd] = useState(draft?.cbd ?? '');
  const [terpenes, setTerpenes] = useState<string[]>(draft?.terpenes ?? []);
  const [terpenePercentages, setTerpenePercentages] = useState<Record<string, string>>(draft?.terpenePercentages ?? {});
  const [totalTerpenePercent, setTotalTerpenePercent] = useState(draft?.totalTerpenePercent ?? '');

  function handleTerpenesChange(next: string[]) {
    setTerpenes(next);
    setTerpenePercentages((prev) => {
      const pruned: Record<string, string> = {};
      for (const t of next) {
        if (t in prev) pruned[t] = prev[t];
      }
      return pruned;
    });
  }

  // Inventory & pricing
  const [gramsAvailable, setGramsAvailable] = useState(draft?.gramsAvailable ?? '');
  const [upcomingQty, setUpcomingQty] = useState(draft?.upcomingQty ?? '');
  const [minQtyRequest, setMinQtyRequest] = useState(draft?.minQtyRequest ?? '');
  const [pricePerUnit, setPricePerUnit] = useState(draft?.pricePerUnit ?? '');

  // Bud size
  const [budPopcorn, setBudPopcorn] = useState(draft?.budPopcorn ?? '');
  const [budSmall, setBudSmall] = useState(draft?.budSmall ?? '');
  const [budMedium, setBudMedium] = useState(draft?.budMedium ?? '');
  const [budLarge, setBudLarge] = useState(draft?.budLarge ?? '');
  const [budXLarge, setBudXLarge] = useState(draft?.budXLarge ?? '');

  // Media (files can't be cached — user must re-select)
  const [coverPhoto, setCoverPhoto] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [coaFiles, setCoaFiles] = useState<File[]>([]);

  // CoA Scan state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<AnalyzedCoaFields | null>(draft?.scanResult ?? null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set(draft?.autoFilledFields ?? []));
  const [scanFileName, setScanFileName] = useState<string | null>(draft?.scanFileName ?? null);
  const [redactionRegions, setRedactionRegions] = useState<RedactionRegion[]>([]);
  const [redactionTemplateUsed, setRedactionTemplateUsed] = useState(false);
  const formTopRef = useRef<HTMLDivElement>(null);

  // Persist form state to sessionStorage on changes
  const saveDraft = useCallback(() => {
    const data: FormDraft = {
      name, description, category, type, licensedProducer, lineage, growthMedium, harvestDate,
      certifications, thc, cbd, terpenes, terpenePercentages, totalTerpenePercent,
      gramsAvailable, upcomingQty, minQtyRequest, pricePerUnit,
      budPopcorn, budSmall, budMedium, budLarge, budXLarge,
      scanResult, scanFileName,
      autoFilledFields: Array.from(autoFilledFields),
    };
    try { sessionStorage.setItem(FORM_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
  }, [
    name, description, category, type, licensedProducer, lineage, growthMedium, harvestDate,
    certifications, thc, cbd, terpenes, terpenePercentages, totalTerpenePercent,
    gramsAvailable, upcomingQty, minQtyRequest, pricePerUnit,
    budPopcorn, budSmall, budMedium, budLarge, budXLarge,
    scanResult, scanFileName, autoFilledFields,
  ]);

  const budSizeTotal = useMemo(() => {
    const vals = [budPopcorn, budSmall, budMedium, budLarge, budXLarge];
    return vals.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  }, [budPopcorn, budSmall, budMedium, budLarge, budXLarge]);

  const budSizeColor = useMemo(() => {
    if (budSizeTotal === 0) return 'text-faint';
    if (budSizeTotal >= 99 && budSizeTotal <= 101) return 'text-green-600';
    if (budSizeTotal >= 95 && budSizeTotal <= 105) return 'text-yellow-600';
    return 'text-red-600';
  }, [budSizeTotal]);

  // Auto-save draft to sessionStorage
  useEffect(() => { saveDraft(); }, [saveDraft]);

  // Ref for the dedicated CoA scan file input at the top
  const scanFileRef = useRef<HTMLInputElement>(null);

  async function handleScanCoA(file?: File) {
    const pdfFile = file || coaFiles[0];
    if (!pdfFile) return;
    setScanFileName(pdfFile.name);
    setScanning(true);
    setScanError(null);
    setScanResult(null);

    try {
      const { fields, redactionRegions: regions, templateUsed } = await analyzeCoaPdf(pdfFile);
      setScanResult(fields);
      setRedactionRegions(regions || []);
      setRedactionTemplateUsed(templateUsed ?? false);

      // Also add the file to coaFiles if not already there
      if (file && !coaFiles.some((f) => f.name === file.name && f.size === file.size)) {
        setCoaFiles((prev) => [file, ...prev]);
      }

      if (fields.fieldsExtracted < 2) {
        setScanError('This doesn\'t appear to be a Certificate of Analysis. You can still fill in the form manually.');
        setScanning(false);
        return;
      }

      // Auto-fill empty fields only
      const filled: string[] = [];
      if (fields.name && !name.trim()) { setName(fields.name); filled.push('Product Name'); }
      if (fields.category && !category) { setCategory(fields.category); filled.push('Category'); }
      if (fields.type && !type) { setType(fields.type); filled.push('Type'); }
      if (fields.licensedProducer && !licensedProducer.trim()) { setLicensedProducer(fields.licensedProducer); filled.push('Licensed Producer'); }
      if (fields.thc && !thc) { setThc(fields.thc); filled.push('THC %'); }
      if (fields.cbd && !cbd) { setCbd(fields.cbd); filled.push('CBD %'); }
      if (fields.terpenes.length > 0 && terpenes.length === 0) {
        setTerpenes(fields.terpenes);
        setTerpenePercentages(fields.terpenePercentages);
        if (fields.totalTerpenePercent) setTotalTerpenePercent(fields.totalTerpenePercent);
        filled.push('Terpenes');
      }

      setAutoFilledFields(new Set(filled.map((f) => f.toLowerCase())));

      // Scroll to top so user can see the auto-filled fields
      if (filled.length > 0) {
        formTopRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err: any) {
      const apiError = err?.response?.data?.error;
      const status = err?.response?.status;
      let msg = 'CoA analysis failed. You can still fill in the form manually.';
      if (status === 502) msg = 'CoA analysis service temporarily unavailable — please try again in a moment.';
      else if (apiError) msg = apiError;
      setScanError(msg);
    } finally {
      setScanning(false);
    }
  }

  // Clear auto-fill indicator when a field is manually edited
  function clearAutoFill(fieldLabel: string) {
    setAutoFilledFields((prev) => {
      const next = new Set(prev);
      next.delete(fieldLabel.toLowerCase());
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Required field validation
    const missing: string[] = [];
    if (!name.trim()) missing.push('Product Name');
    if (!description.trim()) missing.push('Description');
    if (!category) missing.push('Category');
    if (!licensedProducer.trim()) missing.push('Licensed Producer');
    if (!lineage.trim()) missing.push('Lineage');
    if (!harvestDate) missing.push('Harvest Date');
    if (certifications.length === 0) missing.push('Certification');
    if (!thc) missing.push('THC %');
    if (!cbd) missing.push('CBD %');
    if (terpenes.length === 0) missing.push('Terpenes');
    if (!gramsAvailable) missing.push('Grams Available');
    if (!upcomingQty) missing.push('Upcoming Qty');
    if (!minQtyRequest) missing.push('Min Order Quantity');
    if (!pricePerUnit) missing.push('Bid Minimum Per Gram');
    if (!coverPhoto) missing.push('Cover Photo');
    if (images.length === 0) missing.push('Product Images');
    if (coaFiles.length === 0) missing.push('Certificate of Analysis');

    if (missing.length > 0) {
      setError(`Required fields missing: ${missing.join(', ')}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append('name', name.trim());
    if (description.trim()) formData.append('description', description.trim());
    if (category) formData.append('category', category);
    if (type) formData.append('type', type);
    if (licensedProducer.trim()) formData.append('licensedProducer', licensedProducer.trim());
    if (lineage.trim()) formData.append('lineage', lineage.trim());
    if (growthMedium.trim()) formData.append('growthMedium', growthMedium.trim());
    if (harvestDate) formData.append('harvestDate', harvestDate);
    if (certifications.length > 0) formData.append('certification', certifications.join(', '));
    if (thc) formData.append('thc', thc);
    if (cbd) formData.append('cbd', cbd);
    if (terpenes.length > 0) formData.append('dominantTerpene', terpenes.join('; '));

    // Serialize per-terpene percentages into "Name: X%\nName: Y%" format
    const terpeneLines = terpenes
      .filter((t) => terpenePercentages[t] && terpenePercentages[t].trim() !== '')
      .map((t) => `${t}: ${terpenePercentages[t]}%`);
    if (terpeneLines.length > 0) formData.append('highestTerpenes', terpeneLines.join('\n'));
    if (totalTerpenePercent) formData.append('totalTerpenePercent', totalTerpenePercent);
    if (gramsAvailable) formData.append('gramsAvailable', gramsAvailable);
    if (upcomingQty) formData.append('upcomingQty', upcomingQty);
    if (minQtyRequest) formData.append('minQtyRequest', minQtyRequest);
    if (pricePerUnit) formData.append('pricePerUnit', pricePerUnit);
    if (budPopcorn) formData.append('budSizePopcorn', budPopcorn);
    if (budSmall) formData.append('budSizeSmall', budSmall);
    if (budMedium) formData.append('budSizeMedium', budMedium);
    if (budLarge) formData.append('budSizeLarge', budLarge);
    if (budXLarge) formData.append('budSizeXLarge', budXLarge);

    // Include CoA test results if scan was performed
    if (scanResult?.testResults) {
      formData.append('testResults', JSON.stringify(scanResult.testResults));
    }

    // Include redaction regions from CoA scan
    if (redactionRegions.length > 0) {
      formData.append('redactionRegions', JSON.stringify(redactionRegions));
    }

    if (coverPhoto) formData.append('coverPhoto', coverPhoto);
    for (const img of images) formData.append('images', img);
    for (const coa of coaFiles) formData.append('coaFiles', coa);

    try {
      await createListing(formData);
      clearDraft();
      navigate('/my-listings', { state: { created: true, pending: true } });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create listing');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl" ref={formTopRef}>
        <div className="mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-primary">Create Listing</h2>
            <p className="text-sm text-muted">Add a new product to the marketplace manually.</p>
            <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue teal:from-brand-yellow teal:to-brand-coral" />
          </div>
        </div>

        {/* Restored draft notice */}
        {hasDraft && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-brand-blue/20 bg-brand-blue/5 dark:bg-brand-blue/10 px-4 py-2.5 text-sm text-brand-blue dark:text-blue-300">
            <span>Your previous draft has been restored (including CoA scan data).</span>
            <button
              type="button"
              onClick={() => { clearDraft(); window.location.reload(); }}
              className="ml-3 text-xs font-medium underline hover:no-underline"
            >
              Start fresh
            </button>
          </div>
        )}

        {/* CoA Quick-Scan — top of page */}
        <div className="mb-6 rounded-lg border border-brand-teal/20 dark:border-brand-sage/20 bg-gradient-to-br from-brand-teal/5 to-brand-blue/5 dark:from-brand-teal/10 dark:to-brand-blue/10 p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-brand-teal/10 dark:bg-brand-sage/15 p-2">
              <svg className="h-5 w-5 text-brand-teal dark:text-brand-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-primary">Have a CoA? Let AI fill the form for you</h3>
              <p className="mt-0.5 text-xs text-muted">
                Upload your Certificate of Analysis and we'll extract product name, potency, terpenes, and lab info automatically. <span className="font-semibold">This can take up to a minute depending on the size of the document.</span> You can review and edit everything before submitting.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <input
                  ref={scanFileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleScanCoA(file);
                    // Reset so re-selecting the same file triggers onChange
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => scanFileRef.current?.click()}
                  disabled={scanning}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-teal dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-50"
                >
                  {scanning ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Scanning CoA...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      Upload CoA PDF
                    </>
                  )}
                </button>
                {scanning && scanFileName && (
                  <span className="text-xs text-muted truncate max-w-[200px]">{scanFileName}</span>
                )}
                {!scanning && <span className="text-xs text-muted">or fill in the form manually below</span>}
              </div>
              {scanError && (
                <p className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">
                  {scanFileName && <span className="font-medium">{scanFileName}:</span>} {scanError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Auto-fill summary banner */}
        {scanResult && scanResult.fieldsExtracted >= 2 && autoFilledFields.size > 0 && (
          <div className="mb-4 rounded-lg border border-brand-sage/40 bg-brand-sage/10 dark:bg-brand-sage/5 p-3 text-sm text-brand-teal dark:text-brand-sage">
            <span className="font-semibold">Auto-filled {autoFilledFields.size} field{autoFilledFields.size !== 1 ? 's' : ''}</span>
            {scanFileName ? ` from ${scanFileName}` : ' from CoA'}
            {': '}
            {Array.from(autoFilledFields).map((f) => f.charAt(0).toUpperCase() + f.slice(1)).join(', ')}
            <p className="mt-2 text-[0.925rem] font-semibold text-brand-coral">
              Please double-check all auto-filled information before submitting — AI extraction may contain errors.
            </p>
          </div>
        )}

        {/* Redaction info banner */}
        {redactionRegions.length > 0 && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
              <span className="font-semibold">
                {redactionRegions.length} client info region{redactionRegions.length !== 1 ? 's' : ''}{' '}
                {redactionTemplateUsed ? 'from template' : 'detected'}
              </span>
            </div>
            <p>
              {redactionTemplateUsed
                ? 'Redaction regions were loaded from a saved template for this lab. An admin will review before your listing goes live.'
                : 'Client/buyer information will be automatically redacted from the CoA before it appears on the marketplace. An admin will review the redactions before your listing goes live.'}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Basic Info */}
          <Section title="Basic Info">
            <Field label="Product Name" required autoFilled={autoFilledFields.has('product name')}>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); clearAutoFill('product name'); }}
                placeholder="e.g. Pink Kush"
                className="input-field"
              />
            </Field>
            <Field label="Description" required>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Product description..."
                className="input-field"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category" required autoFilled={autoFilledFields.has('category')}>
                <select value={category} onChange={(e) => { setCategory(e.target.value); clearAutoFill('category'); }} className="input-field">
                  <option value="">Select...</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Type" autoFilled={autoFilledFields.has('type')}>
                <select value={type} onChange={(e) => { setType(e.target.value); clearAutoFill('type'); }} className="input-field">
                  <option value="">Select...</option>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* Section 2: Origin & Production */}
          <Section title="Origin & Production">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Licensed Producer" required autoFilled={autoFilledFields.has('licensed producer')}>
                <input type="text" value={licensedProducer} onChange={(e) => { setLicensedProducer(e.target.value); clearAutoFill('licensed producer'); }} className="input-field" />
              </Field>
              <Field label="Lineage" required>
                <input type="text" value={lineage} onChange={(e) => setLineage(e.target.value)} className="input-field" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Growth Medium">
                <input type="text" value={growthMedium} onChange={(e) => setGrowthMedium(e.target.value)} className="input-field" />
              </Field>
              <Field label="Harvest Date" required>
                <input type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} className="input-field" />
              </Field>
              <Field label="Certification" required>
                <div className="flex flex-wrap gap-1.5">
                  {CERTIFICATIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCertifications((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                        certifications.includes(c)
                          ? 'border-brand-teal bg-brand-sage/20 text-brand-teal dark:bg-brand-sage/15 dark:text-brand-sage dark:border-brand-sage/40'
                          : 'border-default text-secondary hover-surface-muted'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Section>

          {/* Section 3: Potency & Terpenes */}
          <Section title="Potency & Terpenes">
            <div className="grid grid-cols-2 gap-4">
              <Field label="THC %" required autoFilled={autoFilledFields.has('thc %')}>
                <input type="number" step="0.01" min="0" max="100" value={thc} onChange={(e) => { const v = e.target.value; const dot = v.indexOf('.'); setThc(dot >= 0 && v.length - dot > 3 ? v.slice(0, dot + 3) : v); clearAutoFill('thc %'); }} placeholder="e.g. 24.5" className="input-field" />
              </Field>
              <Field label="CBD %" required autoFilled={autoFilledFields.has('cbd %')}>
                <input type="number" step="0.01" min="0" max="100" value={cbd} onChange={(e) => { const v = e.target.value; const dot = v.indexOf('.'); setCbd(dot >= 0 && v.length - dot > 3 ? v.slice(0, dot + 3) : v); clearAutoFill('cbd %'); }} placeholder="e.g. 0.5" className="input-field" />
              </Field>
            </div>
            <TerpeneAutocomplete selected={terpenes} onChange={handleTerpenesChange} required />
            <TerpenePercentageTable
              terpenes={terpenes}
              percentages={terpenePercentages}
              onChange={setTerpenePercentages}
              totalPercent={totalTerpenePercent}
              onTotalChange={setTotalTerpenePercent}
            />
          </Section>

          {/* Section 4: Inventory & Pricing */}
          <Section title="Inventory & Pricing">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Grams Available" required>
                <input type="number" step="1" min="0" value={gramsAvailable} onChange={(e) => setGramsAvailable(e.target.value)} className="input-field" />
              </Field>
              <Field label="Upcoming Qty (3 months)" required>
                <input type="number" step="1" min="0" value={upcomingQty} onChange={(e) => setUpcomingQty(e.target.value)} className="input-field" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Min Order Quantity (g)" required>
                <input type="number" step="1" min="0" value={minQtyRequest} onChange={(e) => setMinQtyRequest(e.target.value)} className="input-field" />
              </Field>
              <Field label="Bid Minimum Per Gram (CAD)" required>
                <input type="number" step="0.01" min="0" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} placeholder="e.g. 2.50" className="input-field" />
              </Field>
            </div>
          </Section>

          {/* Section 5: Bud Size Distribution */}
          <Section title="Bud Size Distribution (Optional)">
            <div className="grid grid-cols-5 gap-3">
              <Field label="Popcorn 0-1cm">
                <input type="number" step="0.1" min="0" max="100" value={budPopcorn} onChange={(e) => setBudPopcorn(e.target.value)} placeholder="%" className="input-field" />
              </Field>
              <Field label="Small 1-2cm">
                <input type="number" step="0.1" min="0" max="100" value={budSmall} onChange={(e) => setBudSmall(e.target.value)} placeholder="%" className="input-field" />
              </Field>
              <Field label="Medium 2-3cm">
                <input type="number" step="0.1" min="0" max="100" value={budMedium} onChange={(e) => setBudMedium(e.target.value)} placeholder="%" className="input-field" />
              </Field>
              <Field label="Large 3-5cm">
                <input type="number" step="0.1" min="0" max="100" value={budLarge} onChange={(e) => setBudLarge(e.target.value)} placeholder="%" className="input-field" />
              </Field>
              <Field label="X-Large 5cm+">
                <input type="number" step="0.1" min="0" max="100" value={budXLarge} onChange={(e) => setBudXLarge(e.target.value)} placeholder="%" className="input-field" />
              </Field>
            </div>
            <p className={`mt-1 text-sm font-semibold ${budSizeColor}`}>
              Total: {budSizeTotal.toFixed(1)}%
              {budSizeTotal > 0 && budSizeTotal >= 99 && budSizeTotal <= 101 && ' — Good'}
              {budSizeTotal > 0 && (budSizeTotal < 99 || budSizeTotal > 101) && ' — Should be ~100%'}
            </p>
          </Section>

          {/* Section 6: Media */}
          <Section title="Media">
            <Field label="Cover Photo" required>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setCoverPhoto(e.target.files?.[0] ?? null)}
                className="input-field text-sm"
              />
              {coverPhoto && (
                <img
                  src={URL.createObjectURL(coverPhoto)}
                  alt="Cover preview"
                  className="mt-2 h-32 w-32 rounded-lg border object-cover"
                />
              )}
            </Field>
            <Field label="Product Images (up to 10)" required>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).slice(0, 10);
                  setImages(files);
                }}
                className="input-field text-sm"
              />
              {images.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {images.map((img, i) => (
                    <img
                      key={i}
                      src={URL.createObjectURL(img)}
                      alt={`Preview ${i + 1}`}
                      className="h-20 w-20 rounded-lg border object-cover"
                    />
                  ))}
                </div>
              )}
            </Field>
            <Field label="Certificates of Analysis (up to 10 PDFs)" required>
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).slice(0, 10);
                  setCoaFiles(files);
                  // Reset scan state when files change
                  setScanResult(null);
                  setScanError(null);
                  setAutoFilledFields(new Set());
                }}
                className="input-field text-sm"
              />
              {coaFiles.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-secondary">
                  {coaFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 18h12a2 2 0 002-2V6l-4-4H4a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          </Section>

          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Listing'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/my-listings')}
              className="rounded-lg border border-default px-6 py-2.5 text-sm font-medium text-secondary transition hover-surface-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border card-blue shadow-md p-5">
      <h3 className="mb-4 border-l-2 border-brand-teal dark:border-brand-yellow pl-3 text-base font-semibold text-primary">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, required, autoFilled, children }: { label: string; required?: boolean; autoFilled?: boolean; children: React.ReactNode }) {
  return (
    <div className={autoFilled ? 'rounded-lg border-l-2 border-brand-teal dark:border-brand-sage pl-2' : ''}>
      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-secondary">
        {label}
        {required && <span className="text-red-500">*</span>}
        {autoFilled && (
          <span className="rounded bg-brand-teal/10 dark:bg-brand-sage/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-teal dark:text-brand-sage">
            AI
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
