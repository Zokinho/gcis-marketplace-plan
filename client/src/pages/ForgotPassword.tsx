import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../lib/api';
import HarvexLogo from '../components/HarvexLogo';

const inputClass =
  'w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-brand-sage focus:ring-1 focus:ring-brand-sage';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-brand-teal to-brand-blue text-white px-4">
      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-24 h-[500px] w-[500px] rounded-full bg-brand-sage/10 blur-3xl" />

      <HarvexLogo size="xl" color="white" className="mb-4" />

      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-white/25 bg-white/20 p-6 backdrop-blur-md shadow-2xl">
          {!sent ? (
            <>
              <h3 className="mb-1 text-lg font-semibold text-white">Reset your password</h3>
              <p className="mb-5 text-sm text-white/50">
                Enter your email address and we'll send you a link to reset your password.
              </p>

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
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full cursor-pointer rounded-lg bg-white py-2.5 text-sm font-semibold text-brand-teal transition hover:bg-white/90 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-sage/30">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">Check your email</h3>
              <p className="text-sm text-white/60">
                If an account exists for <span className="font-medium text-white/80">{email}</span>, you'll receive a password reset link shortly.
              </p>
            </div>
          )}

          <p className="mt-5 text-center text-sm text-white/50">
            <Link to="/" className="font-medium text-brand-yellow transition hover:text-brand-yellow/80">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
