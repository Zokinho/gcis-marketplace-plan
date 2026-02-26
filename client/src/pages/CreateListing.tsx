import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import TerpeneAutocomplete from '../components/TerpeneAutocomplete';
import { createListing } from '../lib/api';

const CATEGORIES = [
  'Cannabis flowers (mix sizes)',
  'Cannabis flowers (smalls only)',
  'Cannabis flowers (fresh frozen)',
  'Cannabis flowers (outdoor grown)',
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');

  // Origin & production
  const [licensedProducer, setLicensedProducer] = useState('');
  const [lineage, setLineage] = useState('');
  const [growthMedium, setGrowthMedium] = useState('');
  const [harvestDate, setHarvestDate] = useState('');
  const [certifications, setCertifications] = useState<string[]>([]);

  // Potency & terpenes
  const [thc, setThc] = useState('');
  const [cbd, setCbd] = useState('');
  const [terpenes, setTerpenes] = useState<string[]>([]);
  const [totalTerpenePercent, setTotalTerpenePercent] = useState('');

  // Inventory & pricing
  const [gramsAvailable, setGramsAvailable] = useState('');
  const [upcomingQty, setUpcomingQty] = useState('');
  const [minQtyRequest, setMinQtyRequest] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');

  // Bud size
  const [budPopcorn, setBudPopcorn] = useState('');
  const [budSmall, setBudSmall] = useState('');
  const [budMedium, setBudMedium] = useState('');
  const [budLarge, setBudLarge] = useState('');
  const [budXLarge, setBudXLarge] = useState('');

  // Media
  const [coverPhoto, setCoverPhoto] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [coaFiles, setCoaFiles] = useState<File[]>([]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Required field validation
    const missing: string[] = [];
    if (!name.trim()) missing.push('Product Name');
    if (!description.trim()) missing.push('Description');
    if (!category) missing.push('Category');
    if (!type) missing.push('Type');
    if (!licensedProducer.trim()) missing.push('Licensed Producer');
    if (!lineage.trim()) missing.push('Lineage');
    if (!harvestDate) missing.push('Harvest Date');
    if (certifications.length === 0) missing.push('Certification');
    if (!thc) missing.push('THC %');
    if (!cbd) missing.push('CBD %');
    if (terpenes.length === 0) missing.push('Terpenes');
    if (!totalTerpenePercent) missing.push('Dominant Terpene %');
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

    if (coverPhoto) formData.append('coverPhoto', coverPhoto);
    for (const img of images) formData.append('images', img);
    for (const coa of coaFiles) formData.append('coaFiles', coa);

    try {
      await createListing(formData);
      navigate('/my-listings', { state: { created: true, pending: true } });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create listing');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-primary">Create Listing</h2>
            <p className="text-sm text-muted">Add a new product to the marketplace manually.</p>
            <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue teal:from-brand-yellow teal:to-brand-coral" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Basic Info */}
          <Section title="Basic Info">
            <Field label="Product Name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
              <Field label="Category" required>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
                  <option value="">Select...</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Type" required>
                <select value={type} onChange={(e) => setType(e.target.value)} className="input-field">
                  <option value="">Select...</option>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* Section 2: Origin & Production */}
          <Section title="Origin & Production">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Licensed Producer" required>
                <input type="text" value={licensedProducer} onChange={(e) => setLicensedProducer(e.target.value)} className="input-field" />
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
              <Field label="THC %" required>
                <input type="number" step="0.01" min="0" max="100" value={thc} onChange={(e) => setThc(e.target.value)} placeholder="e.g. 24.5" className="input-field" />
              </Field>
              <Field label="CBD %" required>
                <input type="number" step="0.01" min="0" max="100" value={cbd} onChange={(e) => setCbd(e.target.value)} placeholder="e.g. 0.5" className="input-field" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TerpeneAutocomplete selected={terpenes} onChange={setTerpenes} required />
              <Field label="Dominant Terpene %" required>
                <input type="number" step="0.01" min="0" max="100" value={totalTerpenePercent} onChange={(e) => setTotalTerpenePercent(e.target.value)} placeholder="e.g. 2.5" className="input-field" />
              </Field>
            </div>
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-secondary">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
