import { useState, FormEvent } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { resetPassword } from '../lib/api';
import HarvexLogo from '../components/HarvexLogo';

const inputClass =
  'w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-brand-sage focus:ring-1 focus:ring-brand-sage';

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!token) {
      setError('Invalid reset link');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setSuccess(true);
      // Auto-redirect after 3 seconds
      setTimeout(() => navigate('/'), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reset password. The link may have expired.');
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
          {!success ? (
            <>
              <h3 className="mb-1 text-lg font-semibold text-white">Set new password</h3>
              <p className="mb-5 text-sm text-white/50">
                Choose a new password for your account.
              </p>

              {error && (
                <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-200">
                  {error}
                  {error.includes('expired') && (
                    <div className="mt-2">
                      <Link to="/forgot-password" className="font-medium text-brand-yellow underline">
                        Request a new link
                      </Link>
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/70">New password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className={inputClass}
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/70">Confirm new password</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full cursor-pointer rounded-lg bg-white py-2.5 text-sm font-semibold text-brand-teal transition hover:bg-white/90 disabled:opacity-50"
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-sage/30">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">Password reset!</h3>
              <p className="text-sm text-white/60">
                Your password has been updated. Redirecting to sign in...
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
