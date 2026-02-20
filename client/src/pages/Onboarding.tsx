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
  const isSeller = data?.user?.contactType?.includes('Seller') ?? false;

  if (!needsEula && !needsDoc) {
    // Onboarding complete — redirect to pending approval
    navigate('/pending', { replace: true });
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
          <StepIndicator step={1} label="Accept Terms" active={needsEula} completed={!needsEula} />
          {isSeller && (
            <>
              <div className="h-px w-12 bg-gray-300 dark:bg-slate-600" />
              <StepIndicator step={2} label="Upload Agreement" active={needsDoc} completed={false} />
            </>
          )}
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
        <h2 className="text-2xl font-semibold text-white">Harvex&trade; Platform Terms and Conditions</h2>
      </div>
      <div className="p-6 sm:p-8">
      <p className="mb-6 text-sm text-muted">
        Please read and accept the following agreement to continue.
      </p>

      {/* Scrollable Terms and Conditions */}
      <div className="mb-6 h-[28rem] overflow-y-auto rounded-lg border border-subtle surface-muted p-4 text-sm leading-relaxed text-secondary">
        <h3 className="mb-3 font-bold">Harvex&trade; Platform Terms and Conditions Agreement</h3>

        <h4 className="mb-2 mt-4 font-semibold">1. INTRODUCTION AND ACCEPTANCE OF TERMS</h4>
        <p className="mb-3">
          This Agreement becomes effective on the date the User clicks the acceptance box on the Platform (the &ldquo;Effective Date&rdquo;).
        </p>

        <h4 className="mb-2 mt-4 font-semibold">2. DEFINITIONS</h4>
        <p className="mb-2"><strong>2.1</strong> &ldquo;Agreement&rdquo; means these Terms and Conditions, as originally executed by the User, including any future amendments, updates, or modifications made by the Company in accordance with the amendment procedures set out in this Agreement. Such amendments shall only be valid if communicated to the User in writing or posted on the Platform and shall take effect as specified in the relevant amendment notice or as otherwise stipulated herein. For the sake of clarity, if the User renews its access by signing electronically on renewed terms and conditions then those will supersede the ones previously agreed.</p>
        <p className="mb-2"><strong>2.2</strong> &ldquo;Company&rdquo; means 12279398 Canada Inc., doing business as Green Consulting Intl. Services (GCIS), the operator and owner of the Platform.</p>
        <p className="mb-2"><strong>2.3</strong> &ldquo;Consulting &amp; Services Agreement&rdquo; means a separate written agreement between the Company and a User, required for the listing of products on the Platform.</p>
        <p className="mb-2"><strong>2.4</strong> &ldquo;Effective Date&rdquo; means the date on which the User clicks the acceptance box indicating agreement to these Terms and Conditions on the Platform.</p>
        <p className="mb-2"><strong>2.5</strong> &ldquo;Harvex&rdquo; or &ldquo;Platform&rdquo; means the proprietary web-based platform owned and operated by the Company, accessible at www.harvex.app, through which Users may view listings and place bids on commercial product offerings.</p>
        <p className="mb-2"><strong>2.6</strong> &ldquo;Intellectual Property&rdquo; means all copyrights, trademarks (including Harvex&trade;), trade secrets, and any other proprietary rights associated with the Platform or Company materials. For the purposes of this Agreement, &ldquo;trade secrets&rdquo; include any confidential business information, technical data, know-how, methods, processes, algorithms, platform architecture, marketing strategies, and other non-public information that provides the Company with a competitive advantage and is subject to reasonable efforts to maintain its secrecy.</p>
        <p className="mb-2"><strong>2.7</strong> &ldquo;Listings&rdquo; or &ldquo;Product Listings&rdquo; means any product or service described and made visible on the Platform for the purpose of generating commercial interest or bids.</p>
        <p className="mb-2"><strong>2.8</strong> &ldquo;User&rdquo; means any legal entity that has executed this Agreement and has been granted access to the Platform for the purpose of viewing product listings or placing bids.</p>
        <p className="mb-2"><strong>2.9</strong> &ldquo;Bid&rdquo; means a non-binding expression of commercial interest submitted by a User through the Platform in response to a Product Listing, subject to further facilitation and confirmation by the Company.</p>
        <p className="mb-3"><strong>2.10</strong> &ldquo;Transaction&rdquo; means any formalized commercial arrangement between a supplier and a buyer that originates through or is facilitated by the Platform or the Company, even if concluded outside of the Platform.</p>

        <h4 className="mb-2 mt-4 font-semibold">3. ELIGIBILITY AND USER REGISTRATION</h4>
        <p className="mb-2"><strong>3.1 Eligibility.</strong> Access to the Platform is strictly limited to legal entities that operate within Canada and hold a valid license issued by Health Canada under the Cannabis Act or the Industrial Hemp Regulations. By signing this Agreement, the User represents and warrants that it is duly organized, validly existing, and in good standing under the laws of Canada applicable to its incorporation or registration.</p>
        <p className="mb-2"><strong>3.2 Authorized Signatory.</strong> The individual signing this Agreement on behalf of the User affirms that they have full legal authority to bind the User to the terms of this Agreement.</p>
        <p className="mb-2"><strong>3.3</strong> Clicked the acceptance box stating: &ldquo;As an authorized signatory of the Company, I hereby affirm that we have read the Harvex Terms and Conditions 2025 and duly accept them.&rdquo;</p>
        <p className="mb-2"><strong>3.4 User Account.</strong> Upon approval, the Company will provide the User with access credentials to a Harvex account. The User is responsible for maintaining the confidentiality of its login credentials and for all actions taken under its account.</p>
        <p className="mb-3"><strong>3.5 Right to Refuse or Terminate Access.</strong> The Company reserves the right to refuse, suspend, or terminate access to the Platform at its sole discretion, including if it determines that the User has provided false information or fails to meet the eligibility criteria set forth herein.</p>

        <h4 className="mb-2 mt-4 font-semibold">4. GRANT OF ACCESS AND LIMITED LICENSE</h4>
        <p className="mb-2"><strong>4.1 Limited License.</strong> Subject to the terms and conditions of this Agreement, the Company grants the User a non-exclusive, non-transferable, non-sublicensable, revocable license to access and use the Platform solely for the purposes of: Viewing Product Listings; and Placing non-binding Bids on products of interest.</p>
        <p className="mb-2"><strong>4.2 No Right to List Products.</strong> This Agreement does not grant the User the right to create or publish Product Listings on the Platform. Product listing privileges are granted exclusively under a separate Consulting &amp; Services Agreement to be entered into between the User and the Company.</p>
        <p className="mb-2"><strong>4.3 Platform Restrictions.</strong> The User shall not, directly or indirectly: Copy, modify, distribute, sell, lease, or create derivative works from any part of the Platform; Reverse-engineer, decompile, or attempt to extract the source code of the Platform; Use the Platform for any purpose other than as expressly permitted under this Agreement; or Permit any third party to access the Platform using the User&rsquo;s credentials without prior written authorization from the Company.</p>
        <p className="mb-3"><strong>4.4 Reservation of Rights.</strong> All rights not expressly granted to the User in this Agreement are reserved by the Company. Nothing in this Agreement shall be construed as granting any ownership interest in or to the Platform, its software, trademarks, or other Intellectual Property.</p>

        <h4 className="mb-2 mt-4 font-semibold">5. USER RESPONSIBILITIES</h4>
        <p className="mb-2"><strong>5.1 Compliance with Laws.</strong> The User agrees to comply with all applicable federal, provincial, and municipal laws, regulations, and licensing conditions governing the cannabis and hemp sectors in Canada, including but not limited to the Cannabis Act and the Industrial Hemp Regulations.</p>
        <p className="mb-2"><strong>5.2 Accurate Information.</strong> The User agrees to provide information that is, to the best of its knowledge, accurate, current, and complete at the time of submission. While minor inaccuracies may not affect Platform access, the User acknowledges that all information may be subject to verification by the Company prior to any commercial introductions or engagement. The User further agrees to update the Company promptly if any submitted information becomes outdated or materially incorrect.</p>
        <p className="mb-2"><strong>5.3 Prohibited Conduct.</strong> The User shall not: Misrepresent its licensing status, product offerings, or business activities; Use the Platform in a manner that is deceptive, misleading, unethical, or in violation of applicable law; Upload or transmit any material that contains malware, viruses, or harmful code; Engage in any activity that may harm the reputation, integrity, or security of the Platform or the Company; or Use the Platform to promote, facilitate, or conceal any unlawful or unauthorized activity, including but not limited to fraud, diversion, or unlicensed cannabis or hemp transactions.</p>
        <p className="mb-2"><strong>5.4 Account Security.</strong> The User is responsible for maintaining the confidentiality of its account credentials and shall be liable for all activity conducted through its account, whether authorized or unauthorized. The User agrees to notify the Company immediately upon becoming aware of any unauthorized use of its account or any other security breach.</p>
        <p className="mb-3"><strong>5.5 Platform Use Limitation.</strong> The Platform is to be used solely for viewing listings, placing bids, and initiating business engagement via the Company. The User shall not use the Platform as a transaction processor, marketing tool, or external solicitation platform.</p>

        <h4 className="mb-2 mt-4 font-semibold">6. COMMISSION AND COMMERCIAL ATTRIBUTION</h4>
        <p className="mb-2"><strong>6.1 Attribution of Commercial Activity.</strong> All inquiries, expressions of interest, or bids submitted through the Platform are, by design, made on a no-name basis. As such, the involvement of the Company is necessary for any commercial introductions to occur between Users. All such introductions are subject to the Company&rsquo;s review and approval. Any resulting commercial activity between Users, following such introductions, shall be governed by separate agreement(s) signed by the User, as applicable. This Agreement does not bind the User to compensate the Company in any way.</p>
        <p className="mb-2"><strong>6.2 Scope of this Agreement.</strong> This Agreement governs access to the Platform solely for the purposes of viewing product listings and submitting non-binding bids. It does not authorize the User to engage in outbound solicitations or to receive any services from the Company beyond access to Harvex.</p>
        <p className="mb-2"><strong>6.3 Separate Agreement Required for Listings.</strong> Users wishing to list products on the Platform, or to engage the Company in brokerage or sales support services, must enter into a separate Consulting &amp; Services Agreement with the Company. That agreement will govern the commercial terms of such services, including any applicable fees, commissions, or obligations.</p>
        <p className="mb-3"><strong>6.4 Relationship Governed by Separate Agreement.</strong> Nothing in this Agreement obligates the User to enter into a commercial relationship with the Company. However, the User acknowledges that in order to receive commercial introductions&mdash;whether originating from the Platform or facilitated directly by the Company&mdash;a separate Consulting &amp; Services Agreement must be executed. All commercial terms, including fees, brokerage entitlements, rights to introductions, and any restrictive covenants, shall be exclusively governed by such agreement.</p>

        <h4 className="mb-2 mt-4 font-semibold">7. INTELLECTUAL PROPERTY</h4>
        <p className="mb-2"><strong>7.1 Ownership.</strong> The Platform and all associated content, features, functionality, software, design elements, trademarks (including Harvex&trade;), and underlying source code are the sole and exclusive property of the Company. The User acknowledges and agrees that it acquires no ownership interest in any part of the Platform or the Company&rsquo;s Intellectual Property by virtue of this Agreement or through use of the Platform.</p>
        <p className="mb-2"><strong>7.2 Restrictions.</strong> The User shall not: Copy, reproduce, modify, adapt, translate, distribute, display, or create derivative works based on the Platform or any part thereof; Use any trademark, logo, or other proprietary graphic of the Company without prior written consent; Remove or obscure any copyright, trademark, or proprietary notices contained in or on the Platform; Attempt to access or reverse-engineer the Platform&rsquo;s source code, data architecture, or algorithms.</p>
        <p className="mb-2"><strong>7.3 Feedback.</strong> If the User provides the Company with any suggestions, ideas, or feedback relating to the Platform (&ldquo;Feedback&rdquo;), such Feedback shall be deemed non-confidential and the Company shall be free to use, disclose, and incorporate it into its products or services without restriction or compensation to the User.</p>
        <p className="mb-3"><strong>7.4 Survival of Intellectual Property Protections.</strong> The Company&rsquo;s rights in and to its Intellectual Property, including the Platform, trademarks, and any proprietary materials, shall survive the termination of this Agreement for a period of one (1) year. During this period, the User shall not use, reference, or reproduce any part of the Company&rsquo;s Intellectual Property without prior written consent.</p>

        <h4 className="mb-2 mt-4 font-semibold">8. CONFIDENTIALITY</h4>
        <p className="mb-2"><strong>8.1 Definition of Confidential Information.</strong> For the purposes of this Agreement, &ldquo;Confidential Information&rdquo; means any non-public, proprietary, or sensitive information made available to the User through the Harvex Platform. This includes, but is not limited to: Product descriptions, specifications, and documentation displayed on the Platform; Pricing information, quantities, or trade parameters associated with listings; Non-public bidding activity or expressions of interest submitted through the Platform.</p>
        <p className="mb-2"><strong>8.2 Duty of Confidentiality.</strong> The User agrees to maintain the confidentiality of all Confidential Information accessed through the Platform and shall not disclose, reproduce, or use such information for any purpose other than internal business evaluation of listings or bids. Any disclosure to third parties requires prior written consent from the Company.</p>
        <p className="mb-2"><strong>8.3 Exclusions.</strong> Confidential Information does not include information that: Is or becomes publicly known through no breach of this Agreement; Is lawfully obtained from a third party without a confidentiality obligation; Is independently developed without use of information from the Platform; Must be disclosed by law or regulatory obligation, provided the User gives prompt written notice to the Company (where legally permitted) and reasonably limits the scope of such disclosure.</p>
        <p className="mb-3"><strong>8.4 Duration.</strong> The confidentiality obligations set forth in this Section shall survive the termination of this Agreement for a period of two (2) years.</p>

        <h4 className="mb-2 mt-4 font-semibold">9. TERM AND TERMINATION</h4>
        <p className="mb-2"><strong>9.1 Term.</strong> This Agreement shall commence on the Effective Date and shall remain in effect for a period of one (1) year, unless earlier terminated in accordance with this Section. Thereafter, the Agreement shall automatically renew for successive one-year terms unless either party provides written notice of non-renewal at least ten (10) days prior to the expiration of the then-current term.</p>
        <p className="mb-2"><strong>9.2 Termination by Either Party.</strong> Either the User or the Company may terminate this Agreement at any time, for any reason, by providing ten (10) days&rsquo; written notice to the other party.</p>
        <p className="mb-2"><strong>9.3 Immediate Suspension.</strong> Notwithstanding Section 9.2, the Company may suspend or terminate the User&rsquo;s access to the Platform immediately and without prior notice in the event of: Material breach of this Agreement; Conduct that, in the Company&rsquo;s sole discretion, poses a legal, regulatory, reputational, or operational risk to the Platform or the Company.</p>
        <p className="mb-3"><strong>9.4 Effect of Termination.</strong> Upon termination of this Agreement: The User&rsquo;s access to the Platform will be deactivated; All rights granted to the User under this Agreement shall immediately cease; The User remains obligated to maintain confidentiality in accordance with Section 8; Termination of this Agreement shall not affect any rights, entitlements, or obligations under a separate Consulting &amp; Services Agreement, if one has been executed between the User and the Company.</p>

        <h4 className="mb-2 mt-4 font-semibold">10. DISCLAIMERS AND LIMITATIONS OF LIABILITY</h4>
        <p className="mb-2"><strong>10.1 Platform Provided &ldquo;As-Is.&rdquo;</strong> The Platform is provided on an &ldquo;as-is&rdquo; and &ldquo;as-available&rdquo; basis. The Company makes no warranties, express or implied, regarding the accuracy, completeness, reliability, or availability of the Platform or any content displayed on it. The User acknowledges that the Platform is intended solely as a business tool to facilitate bidding and discovery of potential commercial opportunities, and that all transactions are concluded off-platform.</p>
        <p className="mb-2"><strong>10.2 No Warranty of Results.</strong> The Company does not guarantee that the use of the Platform will result in commercial opportunities, introductions, transactions, or revenue. The User assumes full responsibility for any business decisions made based on information accessed through the Platform.</p>
        <p className="mb-2"><strong>10.3 Limitation of Liability.</strong> To the maximum extent permitted by applicable law, neither party shall be liable to the other for any indirect, incidental, consequential, special, or punitive damages, including lost profits, lost data, or loss of business opportunity, arising out of or related to this Agreement, even if advised of the possibility of such damages.</p>
        <p className="mb-3"><strong>10.4 Aggregate Liability Cap.</strong> Except in cases of gross negligence, willful misconduct, fraud, or breach of confidentiality, each party&rsquo;s total cumulative liability under this Agreement shall not exceed one thousand Canadian dollars (CAD $1,000).</p>

        <h4 className="mb-2 mt-4 font-semibold">11. GOVERNING LAW AND JURISDICTION</h4>
        <p className="mb-2"><strong>11.1 Governing Law.</strong> This Agreement shall be governed by and construed in accordance with the laws of the Province of Qu&eacute;bec and the federal laws of Canada applicable therein, without regard to any conflict of laws principles.</p>
        <p className="mb-2"><strong>11.2 Jurisdiction.</strong> The parties agree that any dispute, claim, or proceeding arising out of or relating to this Agreement shall be subject to the exclusive jurisdiction of the courts of the Province of Qu&eacute;bec, judicial district of Montr&eacute;al, and each party hereby attorns to the jurisdiction of such courts.</p>
        <p className="mb-3"><strong>11.3 Language.</strong> The parties confirm that it is their express wish that this Agreement and all related documents be drawn up in English only. / Les parties confirment leur volont&eacute; expresse que la pr&eacute;sente convention ainsi que tous les documents s&rsquo;y rapportant soient r&eacute;dig&eacute;s en anglais seulement.</p>

        <h4 className="mb-2 mt-4 font-semibold">12. GENERAL PROVISIONS</h4>
        <p className="mb-2"><strong>12.1 Amendments.</strong> The Company reserves the right to amend this Agreement at any time by providing written notice to the User or by posting the updated version on the Platform. Continued use of the Platform following such notice shall constitute acceptance of the amended terms. Material changes may, at the Company&rsquo;s discretion, require re-execution of the Agreement.</p>
        <p className="mb-2"><strong>12.2 Entire Agreement.</strong> This Agreement constitutes the entire agreement between the User and the Company with respect to access to and use of the Harvex Platform. It supersedes all prior and contemporaneous understandings, communications, or agreements, whether oral or written, relating to its subject matter. This Agreement does not govern any broader commercial relationship or brokerage engagement between the User and the Company, which shall be governed exclusively by a separate Consulting &amp; Services Agreement, if executed.</p>
        <p className="mb-3"><strong>12.3 Execution.</strong> This Agreement may be executed in one or more counterparts, each of which shall be deemed an original and all of which taken together shall constitute one and the same instrument. This Agreement may be executed and delivered electronically (including by PDF or electronic signature), and such execution shall be deemed binding as if signed in original ink.</p>

        <p className="mt-4 text-xs italic text-muted">
          IN WITNESS WHEREOF, by clicking the acceptance box, the authorized signatory of the User confirms that the User has read, understood, and agreed to be bound by this Agreement as of the Effective Date.
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
          As an authorized signatory of the Company, I hereby affirm that we have read the Harvex Terms and Conditions 2025 and duly accept them.
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
      await uploadDoc(file);
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
            <p className="mt-3 text-xs text-faint">PDF, DOC, DOCX, PNG, or JPG (max 20 MB)</p>
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
