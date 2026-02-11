import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
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
  const [certification, setCertification] = useState('');

  // Potency & terpenes
  const [thc, setThc] = useState('');
  const [cbd, setCbd] = useState('');
  const [dominantTerpene, setDominantTerpene] = useState('');
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
    if (budSizeTotal === 0) return 'text-gray-400';
    if (budSizeTotal >= 99 && budSizeTotal <= 101) return 'text-green-600';
    if (budSizeTotal >= 95 && budSizeTotal <= 105) return 'text-yellow-600';
    return 'text-red-600';
  }, [budSizeTotal]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Product name is required');
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
    if (certification) formData.append('certification', certification);
    if (thc) formData.append('thc', thc);
    if (cbd) formData.append('cbd', cbd);
    if (dominantTerpene.trim()) formData.append('dominantTerpene', dominantTerpene.trim());
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
        <div className="mb-6 rounded-lg bg-gradient-to-r from-brand-teal to-brand-blue px-6 py-5 text-white">
          <h2 className="text-2xl font-semibold">Create Listing</h2>
          <p className="mt-0.5 text-sm text-white/70">Add a new product to the marketplace manually.</p>
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
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Product description..."
                className="input-field"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
                  <option value="">Select...</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Type">
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
              <Field label="Licensed Producer">
                <input type="text" value={licensedProducer} onChange={(e) => setLicensedProducer(e.target.value)} className="input-field" />
              </Field>
              <Field label="Lineage">
                <input type="text" value={lineage} onChange={(e) => setLineage(e.target.value)} className="input-field" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Growth Medium">
                <input type="text" value={growthMedium} onChange={(e) => setGrowthMedium(e.target.value)} className="input-field" />
              </Field>
              <Field label="Harvest Date">
                <input type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} className="input-field" />
              </Field>
              <Field label="Certification">
                <select value={certification} onChange={(e) => setCertification(e.target.value)} className="input-field">
                  <option value="">Select...</option>
                  {CERTIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* Section 3: Potency & Terpenes */}
          <Section title="Potency & Terpenes">
            <div className="grid grid-cols-2 gap-4">
              <Field label="THC %">
                <input type="number" step="0.01" min="0" max="100" value={thc} onChange={(e) => setThc(e.target.value)} placeholder="e.g. 24.5" className="input-field" />
              </Field>
              <Field label="CBD %">
                <input type="number" step="0.01" min="0" max="100" value={cbd} onChange={(e) => setCbd(e.target.value)} placeholder="e.g. 0.5" className="input-field" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Dominant Terpene">
                <input type="text" value={dominantTerpene} onChange={(e) => setDominantTerpene(e.target.value)} placeholder="e.g. Myrcene, Limonene" className="input-field" />
              </Field>
              <Field label="Total Terpene %">
                <input type="number" step="0.01" min="0" max="100" value={totalTerpenePercent} onChange={(e) => setTotalTerpenePercent(e.target.value)} placeholder="e.g. 3.2" className="input-field" />
              </Field>
            </div>
          </Section>

          {/* Section 4: Inventory & Pricing */}
          <Section title="Inventory & Pricing">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Grams Available">
                <input type="number" step="1" min="0" value={gramsAvailable} onChange={(e) => setGramsAvailable(e.target.value)} className="input-field" />
              </Field>
              <Field label="Upcoming Qty (3 months)">
                <input type="number" step="1" min="0" value={upcomingQty} onChange={(e) => setUpcomingQty(e.target.value)} className="input-field" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Min Order Quantity (g)">
                <input type="number" step="1" min="0" value={minQtyRequest} onChange={(e) => setMinQtyRequest(e.target.value)} className="input-field" />
              </Field>
              <Field label="Bid Minimum Per Gram (CAD)">
                <input type="number" step="0.01" min="0" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} placeholder="e.g. 2.50" className="input-field" />
              </Field>
            </div>
          </Section>

          {/* Section 5: Bud Size Distribution */}
          <Section title="Bud Size Distribution">
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
            <Field label="Cover Photo">
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
            <Field label="Product Images (up to 4)">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).slice(0, 4);
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
            <Field label="Certificates of Analysis (up to 3 PDFs)">
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).slice(0, 3);
                  setCoaFiles(files);
                }}
                className="input-field text-sm"
              />
              {coaFiles.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
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
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gradient-to-r from-brand-teal to-brand-blue px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Listing'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/my-listings')}
              className="rounded-lg border px-6 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
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
    <div className="rounded-lg border bg-white p-5">
      <h3 className="mb-4 border-l-2 border-brand-teal pl-3 text-base font-semibold text-brand-dark">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
