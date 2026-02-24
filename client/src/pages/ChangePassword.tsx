import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { changePassword } from '../lib/api';
import HarvexLogo from '../components/HarvexLogo';

export default function ChangePassword() {
  const { logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordValid = newPassword.length >= 8;
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = currentPassword && passwordValid && passwordsMatch && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!passwordValid) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      await refreshUser();
      navigate('/marketplace', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 dark:bg-slate-900">
      <header className="bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <HarvexLogo size="sm" color="white" />
          <button onClick={() => logout().then(() => navigate('/'))} className="cursor-pointer text-sm text-white/60 hover:text-white">Sign out</button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12">
        <div className="rounded-xl bg-white dark:bg-slate-800 p-8 shadow-lg">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal/10">
              <svg className="h-6 w-6 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-primary">Change Your Password</h1>
            <p className="mt-1 text-sm text-muted">
              Your password was set by an administrator. Please choose a new password to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-primary">
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-primary focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
                placeholder="Enter temporary password"
                required
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-primary">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-primary focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
              {newPassword && !passwordValid && (
                <p className="mt-1 text-xs text-red-500">Password must be at least 8 characters</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-primary">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-primary focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
                placeholder="Re-enter new password"
                required
              />
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-lg bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-blue disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Changing Password...' : 'Set New Password'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
