import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import HarvexLogo from '../components/HarvexLogo';

const inputClass =
  'w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-brand-sage focus:ring-1 focus:ring-brand-sage';

const selectClass =
  'w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white outline-none transition focus:border-brand-sage focus:ring-1 focus:ring-brand-sage [&>option]:bg-brand-teal [&>option]:text-white';

function SignInForm({ onSwitch }: { onSwitch: () => void }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/marketplace');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/25 bg-white/20 p-6 backdrop-blur-md shadow-2xl">
      <h3 className="mb-1 text-lg font-semibold text-white">Sign in</h3>
      <p className="mb-5 text-sm text-white/50">Welcome back to Harvex</p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-white/70">Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={inputClass}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-white/70">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className={inputClass}
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full cursor-pointer rounded-lg bg-white py-2.5 text-sm font-semibold text-brand-teal transition hover:bg-white/90 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-white/50">
        Don't have an account?{' '}
        <button onClick={onSwitch} className="cursor-pointer font-medium text-brand-yellow transition hover:text-brand-yellow/80">
          Sign up
        </button>
      </p>
    </div>
  );
}

// ─── Multi-Step Sign-Up Wizard ───

interface SignUpData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  contactType: 'Buyer' | 'Buyer; Seller';
  address: string;
  city: string;
  postalCode: string;
  mailingCountry: string;
  eulaAccepted: boolean;
}

const INITIAL_DATA: SignUpData = {
  email: '',
  password: '',
  confirmPassword: '',
  firstName: '',
  lastName: '',
  phone: '',
  companyName: '',
  contactType: 'Buyer',
  address: '',
  city: '',
  postalCode: '',
  mailingCountry: 'Canada',
  eulaAccepted: false,
};

const STEPS = ['Account', 'Company', 'Agreement'];

function SignUpWizard({ onSwitch }: { onSwitch: () => void }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SignUpData>(INITIAL_DATA);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field: keyof SignUpData, value: string | boolean) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function nextStep(e: FormEvent) {
    e.preventDefault();
    setError('');

    // Validation for step 0
    if (step === 0) {
      if (data.password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (data.password !== data.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!data.eulaAccepted) {
      setError('You must accept the EULA to continue');
      return;
    }

    setLoading(true);
    try {
      await register({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        companyName: data.companyName,
        phone: data.phone || undefined,
        contactType: data.contactType,
        address: data.address || undefined,
        city: data.city || undefined,
        postalCode: data.postalCode || undefined,
        mailingCountry: data.mailingCountry || undefined,
      });
      navigate('/onboarding');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/25 bg-white/20 p-6 backdrop-blur-md shadow-2xl">
      <h3 className="mb-1 text-lg font-semibold text-white">Create your account</h3>

      {/* Step indicator */}
      <div className="mb-5 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition ${
                i <= step ? 'bg-brand-yellow text-brand-teal' : 'bg-white/20 text-white/50'
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-xs ${i <= step ? 'text-white/80' : 'text-white/40'}`}>{label}</span>
            {i < STEPS.length - 1 && <div className="mx-1 h-px w-4 bg-white/20" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Step 0: Account */}
      {step === 0 && (
        <form onSubmit={nextStep} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-white/70">First name</label>
              <input type="text" required value={data.firstName} onChange={(e) => update('firstName', e.target.value)} placeholder="First" className={inputClass} autoComplete="given-name" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-white/70">Last name</label>
              <input type="text" required value={data.lastName} onChange={(e) => update('lastName', e.target.value)} placeholder="Last" className={inputClass} autoComplete="family-name" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Email address</label>
            <input type="email" required value={data.email} onChange={(e) => update('email', e.target.value)} placeholder="you@company.com" className={inputClass} autoComplete="email" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Phone (optional)</label>
            <input type="tel" value={data.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+1 (555) 000-0000" className={inputClass} autoComplete="tel" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Password</label>
            <input type="password" required value={data.password} onChange={(e) => update('password', e.target.value)} placeholder="Min 8 characters" className={inputClass} autoComplete="new-password" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Confirm password</label>
            <input type="password" required value={data.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} placeholder="Confirm password" className={inputClass} autoComplete="new-password" />
          </div>
          <button type="submit" className="w-full cursor-pointer rounded-lg bg-white py-2.5 text-sm font-semibold text-brand-teal transition hover:bg-white/90">
            Next
          </button>
        </form>
      )}

      {/* Step 1: Company */}
      {step === 1 && (
        <form onSubmit={nextStep} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Company name</label>
            <input type="text" required value={data.companyName} onChange={(e) => update('companyName', e.target.value)} placeholder="Your company" className={inputClass} autoComplete="organization" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Account type</label>
            <select value={data.contactType} onChange={(e) => update('contactType', e.target.value)} className={selectClass}>
              <option value="Buyer">Buyer</option>
              <option value="Buyer; Seller">Buyer & Seller</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Street address (optional)</label>
            <input type="text" value={data.address} onChange={(e) => update('address', e.target.value)} placeholder="123 Main St" className={inputClass} autoComplete="street-address" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-white/70">City</label>
              <input type="text" value={data.city} onChange={(e) => update('city', e.target.value)} placeholder="City" className={inputClass} autoComplete="address-level2" />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs font-medium text-white/70">Postal code</label>
              <input type="text" value={data.postalCode} onChange={(e) => update('postalCode', e.target.value)} placeholder="A1B 2C3" className={inputClass} autoComplete="postal-code" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Country</label>
            <select value={data.mailingCountry} onChange={(e) => update('mailingCountry', e.target.value)} className={selectClass}>
              <option value="Canada">Canada</option>
              <option value="United States">United States</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={prevStep} className="w-1/3 cursor-pointer rounded-lg border border-white/30 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
              Back
            </button>
            <button type="submit" className="flex-1 cursor-pointer rounded-lg bg-white py-2.5 text-sm font-semibold text-brand-teal transition hover:bg-white/90">
              Next
            </button>
          </div>
        </form>
      )}

      {/* Step 2: EULA Agreement */}
      {step === 2 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="max-h-48 overflow-y-auto rounded-lg border border-white/20 bg-white/5 p-4 text-xs text-white/70 leading-relaxed">
            <p className="mb-2 font-semibold text-white/90">End-User License Agreement (EULA)</p>
            <p className="mb-2">By creating an account on Harvex Marketplace, you agree to the following terms:</p>
            <p className="mb-2">1. You represent that you are a licensed entity authorized to buy and/or sell cannabis products in Canada under applicable federal and provincial regulations.</p>
            <p className="mb-2">2. All product listings, bids, and transactions conducted through this platform are subject to Health Canada's Cannabis Act and associated regulations.</p>
            <p className="mb-2">3. You agree to maintain accurate and up-to-date information in your account profile, including your company details and licensing information.</p>
            <p className="mb-2">4. Harvex acts solely as a marketplace facilitator. All transactions are between buyers and sellers directly. Harvex does not take title to any products.</p>
            <p className="mb-2">5. You agree to comply with all applicable laws regarding the transportation, storage, and sale of cannabis products.</p>
            <p className="mb-2">6. Harvex reserves the right to suspend or terminate accounts that violate these terms or applicable regulations.</p>
            <p>7. This agreement is governed by the laws of the Province of Ontario, Canada.</p>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.eulaAccepted}
              onChange={(e) => update('eulaAccepted', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/30 accent-brand-yellow"
            />
            <span className="text-sm text-white/70">I accept the End-User License Agreement and agree to the terms above</span>
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={prevStep} className="w-1/3 cursor-pointer rounded-lg border border-white/30 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
              Back
            </button>
            <button
              type="submit"
              disabled={loading || !data.eulaAccepted}
              className="flex-1 cursor-pointer rounded-lg bg-white py-2.5 text-sm font-semibold text-brand-teal transition hover:bg-white/90 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </div>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-white/50">
        Already have an account?{' '}
        <button onClick={onSwitch} className="cursor-pointer font-medium text-brand-yellow transition hover:text-brand-yellow/80">
          Sign in
        </button>
      </p>
    </div>
  );
}

export default function Landing() {
  const { isSignedIn, logout } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-brand-teal to-brand-blue text-white px-4 pb-24">
      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-24 h-[500px] w-[500px] rounded-full bg-brand-sage/10 blur-3xl" />
      <div className="pointer-events-none absolute right-1/4 top-1/4 h-64 w-64 rounded-full bg-brand-blue/20 blur-2xl" />

      <HarvexLogo size="xl" color="white" className="mb-4" />
      <p className="mb-8 max-w-md text-center text-lg text-white/70">
        The B2B cannabis marketplace connecting licensed producers with Canadian buyers.
      </p>

      {!isSignedIn ? (
        <div className="w-full max-w-sm">
          {mode === 'sign-in' ? (
            <SignInForm onSwitch={() => setMode('sign-up')} />
          ) : (
            <SignUpWizard onSwitch={() => setMode('sign-in')} />
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Link
            to="/marketplace"
            className="rounded-lg bg-white px-6 py-3 font-semibold text-brand-teal transition hover:bg-brand-sage/20"
          >
            Go to Marketplace
          </Link>
          <button
            onClick={() => logout()}
            className="cursor-pointer text-sm text-white/50 transition hover:text-white/80"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
