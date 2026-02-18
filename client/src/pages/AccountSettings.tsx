import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import {
  changePassword,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  NotificationPreferences,
  NotificationTypeEnum,
} from '../lib/api';
import { useUserStatus } from '../lib/useUserStatus';

type Section = 'password' | 'notifications';

const MENU_ITEMS: { key: Section; label: string; icon: React.ReactNode }[] = [
  {
    key: 'password',
    label: 'Password',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
    ),
  },
];

const TYPE_LABELS: Record<string, string> = {
  BID_RECEIVED: 'Bid Received',
  BID_ACCEPTED: 'Bid Accepted',
  BID_REJECTED: 'Bid Rejected',
  BID_COUNTERED: 'Bid Countered',
  BID_OUTCOME: 'Delivery Outcome',
  PRODUCT_NEW: 'New Product',
  PRODUCT_PRICE: 'Price Change',
  PRODUCT_STOCK: 'Stock Change',
  MATCH_SUGGESTION: 'Match Suggestion',
  COA_PROCESSED: 'CoA Processed',
  PREDICTION_DUE: 'Reorder Prediction',
  SHORTLIST_PRICE_DROP: 'Shortlist Price Drop',
  SYSTEM_ANNOUNCEMENT: 'System Announcement',
};

const BID_TYPES: NotificationTypeEnum[] = ['BID_RECEIVED', 'BID_ACCEPTED', 'BID_REJECTED', 'BID_COUNTERED', 'BID_OUTCOME'];
const PRODUCT_TYPES: NotificationTypeEnum[] = ['PRODUCT_NEW', 'PRODUCT_PRICE', 'PRODUCT_STOCK', 'COA_PROCESSED', 'SHORTLIST_PRICE_DROP'];
const MATCH_TYPES: NotificationTypeEnum[] = ['MATCH_SUGGESTION', 'PREDICTION_DUE'];
const SYSTEM_TYPES: NotificationTypeEnum[] = ['SYSTEM_ANNOUNCEMENT'];

const PREF_GROUPS = [
  { label: 'Bids', types: BID_TYPES },
  { label: 'Products', types: PRODUCT_TYPES },
  { label: 'Matches & Predictions', types: MATCH_TYPES },
  { label: 'System', types: SYSTEM_TYPES },
];

const SELLER_ONLY_TYPES = new Set<string>(['BID_RECEIVED', 'COA_PROCESSED']);

// ─── Password Section ───

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setSuccess('Password changed successfully. You will need to sign in again.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.details?.[0]?.message || 'Failed to change password';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-primary">Change Password</h2>
      <p className="mb-5 text-sm text-muted">Update your password. You'll need to sign in again after changing it.</p>

      <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium text-secondary mb-1">
            Current Password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-default bg-transparent px-3 py-2 text-sm text-primary focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-secondary mb-1">
            New Password
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-lg border border-default bg-transparent px-3 py-2 text-sm text-primary focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
          <p className="mt-1 text-xs text-muted">Minimum 8 characters</p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-secondary mb-1">
            Confirm New Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-default bg-transparent px-3 py-2 text-sm text-primary focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-300">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !currentPassword || !newPassword || !confirmPassword}
          className="rounded-lg bg-brand-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-blue disabled:opacity-50"
        >
          {loading ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}

// ─── Notifications Section ───

function NotificationsSection() {
  const { data: userData } = useUserStatus();
  const isSeller = userData?.user?.contactType?.includes('Seller') ?? false;

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchNotificationPreferences();
        setPrefs(res.preferences);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  async function togglePref(type: NotificationTypeEnum) {
    if (!prefs || type === 'SYSTEM_ANNOUNCEMENT') return;
    setError('');
    const oldVal = prefs[type];
    const newVal = !oldVal;

    // Optimistic update
    setPrefs(prev => prev ? { ...prev, [type]: newVal } : prev);

    try {
      const res = await updateNotificationPreferences({ [type]: newVal });
      // Use the server's authoritative response
      setPrefs(res.preferences);
    } catch (err: any) {
      // Revert on failure
      setPrefs(prev => prev ? { ...prev, [type]: oldVal } : prev);
      const msg = err?.response?.data?.error || 'Failed to update preference';
      setError(msg);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-teal border-t-transparent" />
      </div>
    );
  }

  if (!prefs) {
    return <p className="text-sm text-muted">Failed to load notification preferences.</p>;
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-primary">Notification Preferences</h2>
      <p className="mb-5 text-sm text-muted">Choose which notifications you'd like to receive.</p>

      {error && (
        <div className="mb-4 max-w-md rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="max-w-md space-y-6">
        {PREF_GROUPS.map((group) => {
          const visibleTypes = group.types.filter(
            (t) => isSeller || !SELLER_ONLY_TYPES.has(t),
          );
          if (visibleTypes.length === 0) return null;
          return (
            <div key={group.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {group.label}
              </h3>
              <div className="rounded-lg surface border border-default divide-y divide-default">
                {visibleTypes.map((type) => {
                  const isSystem = type === 'SYSTEM_ANNOUNCEMENT';
                  return (
                    <div
                      key={type}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-sm text-primary">{TYPE_LABELS[type] || type}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={prefs[type]}
                        onClick={() => togglePref(type)}
                        disabled={isSystem}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                          prefs[type] ? 'bg-brand-teal' : 'bg-gray-300 dark:bg-gray-600'
                        } ${isSystem ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        title={isSystem ? 'System announcements cannot be disabled' : undefined}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                            prefs[type] ? 'translate-x-[21px]' : 'translate-x-0.5'
                          }`}
                          style={{ marginTop: '2px' }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Settings Page ───

export default function AccountSettings() {
  const [section, setSection] = useState<Section>('password');

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">Settings</h1>
        <div className="mt-1 h-0.5 w-12 bg-brand-yellow rounded" />
      </div>

      <div className="flex flex-col gap-6 sm:flex-row">
        {/* Sidebar menu */}
        <nav className="flex sm:w-48 sm:flex-col sm:flex-shrink-0 gap-1">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition text-left ${
                section === item.key
                  ? 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20'
                  : 'text-secondary hover:text-primary hover-surface-muted'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1 rounded-lg surface p-6 shadow-sm">
          {section === 'password' && <PasswordSection />}
          {section === 'notifications' && <NotificationsSection />}
        </div>
      </div>
    </Layout>
  );
}
