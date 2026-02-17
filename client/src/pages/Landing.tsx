import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSignIn, useSignUp, SignedIn, SignedOut } from '@clerk/clerk-react';
import HarvexLogo from '../components/HarvexLogo';

const inputClass =
  'w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-brand-sage focus:ring-1 focus:ring-brand-sage';

function CustomSignIn({ onSwitch }: { onSwitch: () => void }) {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsSecondFactor, setNeedsSecondFactor] = useState(false);
  const [code, setCode] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError('');
    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/marketplace');
      } else if (result.status === 'needs_second_factor') {
        await signIn.prepareSecondFactor({ strategy: 'email_code' });
        setNeedsSecondFactor(true);
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Sign in failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSecondFactor(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError('');
    setLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({ strategy: 'email_code', code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/marketplace');
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Verification failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (needsSecondFactor) {
    return (
      <div className="rounded-xl border border-white/25 bg-white/20 p-6 backdrop-blur-md shadow-2xl">
        <h3 className="mb-1 text-lg font-semibold text-white">Check your email</h3>
        <p className="mb-5 text-sm text-white/50">
          We sent a verification code to <span className="text-white/80">{email}</span>
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSecondFactor} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Verification code</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 6-digit code"
              className={inputClass}
              autoComplete="one-time-code"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full cursor-pointer rounded-lg bg-white py-2.5 text-sm font-semibold text-brand-teal transition hover:bg-white/90 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      </div>
    );
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

function CustomSignUp({ onSwitch }: { onSwitch: () => void }) {
  const { signUp, setActive, isLoaded } = useSignUp();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError('');
    setLoading(true);
    try {
      await signUp.create({
        firstName,
        lastName,
        emailAddress: email,
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Sign up failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError('');
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/onboarding');
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Verification failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (pendingVerification) {
    return (
      <div className="rounded-xl border border-white/25 bg-white/20 p-6 backdrop-blur-md shadow-2xl">
        <h3 className="mb-1 text-lg font-semibold text-white">Check your email</h3>
        <p className="mb-5 text-sm text-white/50">
          We sent a verification code to <span className="text-white/80">{email}</span>
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Verification code</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 6-digit code"
              className={inputClass}
              autoComplete="one-time-code"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full cursor-pointer rounded-lg bg-white py-2.5 text-sm font-semibold text-brand-teal transition hover:bg-white/90 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/25 bg-white/20 p-6 backdrop-blur-md shadow-2xl">
      <h3 className="mb-1 text-lg font-semibold text-white">Create your account</h3>
      <p className="mb-5 text-sm text-white/50">Join the Harvex marketplace</p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-white/70">First name</label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First"
              className={inputClass}
              autoComplete="given-name"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-white/70">Last name</label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last"
              className={inputClass}
              autoComplete="family-name"
            />
          </div>
        </div>
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
            placeholder="Create a password"
            className={inputClass}
            autoComplete="new-password"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full cursor-pointer rounded-lg bg-white py-2.5 text-sm font-semibold text-brand-teal transition hover:bg-white/90 disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>

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

      <SignedOut>
        <div className="w-full max-w-sm">
          {mode === 'sign-in' ? (
            <CustomSignIn onSwitch={() => setMode('sign-up')} />
          ) : (
            <CustomSignUp onSwitch={() => setMode('sign-in')} />
          )}
        </div>
      </SignedOut>

      <SignedIn>
        <Link
          to="/marketplace"
          className="rounded-lg bg-white px-6 py-3 font-semibold text-brand-teal transition hover:bg-brand-sage/20"
        >
          Go to Marketplace
        </Link>
      </SignedIn>
    </div>
  );
}
