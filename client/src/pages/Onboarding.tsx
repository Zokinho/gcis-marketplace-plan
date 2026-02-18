import { useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useUserStatus } from '../lib/useUserStatus';
import { acceptEula, uploadDoc } from '../lib/api';
import HarvexLogo from '../components/HarvexLogo';

export default function Onboarding() {
  const { data, loading, refetch } = useUserStatus();
  const { logout } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
      </div>
    );
  }

  // If fully active, redirect to dashboard
  if (data?.status === 'ACTIVE') {
    navigate('/dashboard', { replace: true });
    return null;
  }

  // Determine which step to show
  const needsEula = data?.status === 'EULA_REQUIRED';
  const needsDoc = data?.status === 'DOC_REQUIRED';

  if (!needsEula && !needsDoc) {
    // Shouldn't be here — redirect to appropriate page
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col surface-base">
      <header className="bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <HarvexLogo size="sm" color="white" />
          <button onClick={() => logout().then(() => navigate('/'))} className="cursor-pointer text-sm text-white/60 hover:text-white">Sign out</button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {/* Progress indicator */}
        <div className="mb-8 flex items-center justify-center gap-4">
          <StepIndicator step={1} label="Accept EULA" active={needsEula} completed={!needsEula} />
          <div className="h-px w-12 bg-gray-300 dark:bg-slate-600" />
          <StepIndicator step={2} label="Upload Document" active={needsDoc} completed={false} />
        </div>

        {needsEula && <EulaStep onComplete={refetch} />}
        {needsDoc && <DocUploadStep onComplete={refetch} />}
      </main>
    </div>
  );
}

function StepIndicator({ step, label, active, completed }: {
  step: number;
  label: string;
  active: boolean;
  completed: boolean;
}) {
  const bgColor = completed ? 'bg-brand-teal text-white' : active ? 'bg-brand-teal text-white' : 'bg-gray-200 dark:bg-slate-600 text-muted';
  return (
    <div className="flex items-center gap-2">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${bgColor}`}>
        {completed ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ) : step}
      </div>
      <span className={`text-sm font-medium ${active || completed ? 'text-primary' : 'text-faint'}`}>{label}</span>
    </div>
  );
}

function EulaStep({ onComplete }: { onComplete: () => void }) {
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!accepted) return;
    setSubmitting(true);
    setError(null);
    try {
      await acceptEula();
      onComplete();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to accept EULA');
    } finally {
      setSubmitting(false);
    }
  }, [accepted, onComplete]);

  return (
    <div className="overflow-hidden rounded-lg surface shadow-lg">
      <div className="bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-6 py-4 sm:px-8">
        <h2 className="text-2xl font-semibold text-white">End User License Agreement</h2>
      </div>
      <div className="p-6 sm:p-8">
      <p className="mb-6 text-sm text-muted">
        Please read and accept the following agreement to continue.
      </p>

      {/* Scrollable EULA text */}
      <div className="mb-6 h-80 overflow-y-auto rounded-lg border border-subtle surface-muted p-4 text-sm leading-relaxed text-secondary">
        <h3 className="mb-3 font-bold">HARVEX END USER LICENSE AGREEMENT</h3>
        <p className="mb-3">
          This End User License Agreement ("Agreement") is entered into between Green Consulting
          International Services Inc. ("GCIS") and the user ("User") accessing the Harvex
          platform.
        </p>
        <h4 className="mb-2 font-semibold">1. Acceptance of Terms</h4>
        <p className="mb-3">
          By accessing and using the Harvex, User agrees to be bound by the terms and
          conditions of this Agreement. If User does not agree to these terms, User must not use the
          Marketplace.
        </p>
        <h4 className="mb-2 font-semibold">2. Platform Usage</h4>
        <p className="mb-3">
          The Harvex is a B2B platform connecting licensed cannabis producers with
          authorized international buyers. All transactions facilitated through the platform are
          subject to applicable laws and regulations in the jurisdictions involved.
        </p>
        <h4 className="mb-2 font-semibold">3. User Obligations</h4>
        <p className="mb-3">
          User agrees to: (a) provide accurate and current information; (b) maintain the security
          of their account credentials; (c) comply with all applicable laws and regulations;
          (d) not misuse the platform or engage in fraudulent activity.
        </p>
        <h4 className="mb-2 font-semibold">4. Product Listings</h4>
        <p className="mb-3">
          All product information displayed on the Marketplace is sourced from licensed producers
          and verified by GCIS to the extent possible. GCIS does not guarantee the accuracy of
          product specifications and users should conduct their own due diligence.
        </p>
        <h4 className="mb-2 font-semibold">5. Bidding and Transactions</h4>
        <p className="mb-3">
          Bids placed through the Marketplace are non-binding expressions of interest. Final
          transaction terms are subject to negotiation and agreement between the parties, with
          GCIS acting as an intermediary. GCIS reserves the right to reject bids that do not
          comply with platform policies.
        </p>
        <h4 className="mb-2 font-semibold">6. Confidentiality</h4>
        <p className="mb-3">
          User agrees to treat all pricing, product, and transaction information obtained through
          the Marketplace as confidential. Sharing Marketplace data with unauthorized third parties
          is strictly prohibited.
        </p>
        <h4 className="mb-2 font-semibold">7. Limitation of Liability</h4>
        <p className="mb-3">
          GCIS provides the Marketplace on an "as is" basis. GCIS shall not be liable for any
          indirect, incidental, consequential, or punitive damages arising from use of the platform.
        </p>
        <h4 className="mb-2 font-semibold">8. Termination</h4>
        <p className="mb-3">
          GCIS reserves the right to terminate or suspend User's access to the Marketplace at any
          time, with or without cause. User may terminate their account by contacting GCIS support.
        </p>
        <h4 className="mb-2 font-semibold">9. Governing Law</h4>
        <p>
          This Agreement shall be governed by and construed in accordance with the laws of the
          Province of Ontario, Canada.
        </p>
      </div>

      {/* Checkbox */}
      <label className="mb-6 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-default text-brand-teal focus:ring-brand-teal"
        />
        <span className="text-sm text-secondary">
          I have read and agree to the Harvex End User License Agreement.
        </span>
      </label>

      {error && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!accepted || submitting}
        className="w-full rounded-lg bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-6 py-3 font-semibold text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Accepting...' : 'Accept and Continue'}
      </button>
      </div>
    </div>
  );
}

function DocUploadStep({ onComplete }: { onComplete: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) setFile(selectedFile);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      // TODO: In Phase 4, actually upload the file to Zoho Contact attachments.
      // For now, just mark the flag.
      await uploadDoc();
      onComplete();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to upload document');
    } finally {
      setSubmitting(false);
    }
  }, [file, onComplete]);

  return (
    <div className="overflow-hidden rounded-lg surface shadow-lg">
      <div className="bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-6 py-4 sm:px-8">
        <h2 className="text-2xl font-semibold text-white">Upload Agreement Document</h2>
      </div>
      <div className="p-6 sm:p-8">
      <p className="mb-6 text-sm text-muted">
        Please upload your signed buyer/seller agreement to complete your account setup.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mb-6 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition ${
          dragOver ? 'border-brand-teal bg-brand-sage/10' : 'border-default surface-muted'
        }`}
      >
        {file ? (
          <div className="text-center">
            <svg className="mx-auto mb-2 h-10 w-10 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p className="font-medium text-primary">{file.name}</p>
            <p className="text-sm text-muted">{(file.size / 1024).toFixed(1)} KB</p>
            <button
              onClick={() => setFile(null)}
              className="mt-2 text-sm text-red-600 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <svg className="mb-3 h-10 w-10 text-faint" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <p className="mb-1 font-medium text-secondary">
              Drag and drop your file here
            </p>
            <p className="mb-3 text-sm text-muted">or</p>
            <label className="cursor-pointer rounded-lg surface px-4 py-2 text-sm font-medium text-brand-teal shadow-sm ring-1 ring-gray-300 dark:ring-slate-600 transition hover-surface-muted">
              Browse Files
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <p className="mt-3 text-xs text-faint">PDF, DOC, DOCX, PNG, or JPG (max 10 MB)</p>
          </>
        )}
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || submitting}
        className="w-full rounded-lg bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-6 py-3 font-semibold text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Uploading...' : 'Upload and Complete Setup'}
      </button>
      </div>
    </div>
  );
}
