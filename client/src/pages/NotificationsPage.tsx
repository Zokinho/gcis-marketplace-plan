import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  fetchNotifications,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  markAllNotificationsRead,
  markNotificationsRead,
  NotificationRecord,
  NotificationPreferences,
  NotificationTypeEnum,
  Pagination,
} from '../lib/api';
import { useUserStatus } from '../lib/useUserStatus';

type FilterTab = 'all' | 'unread' | 'bids' | 'products' | 'matches' | 'system';

const BID_TYPES: NotificationTypeEnum[] = ['BID_RECEIVED', 'BID_ACCEPTED', 'BID_REJECTED', 'BID_COUNTERED', 'BID_OUTCOME'];
const PRODUCT_TYPES: NotificationTypeEnum[] = ['PRODUCT_NEW', 'PRODUCT_PRICE', 'PRODUCT_STOCK', 'COA_PROCESSED'];
const MATCH_TYPES: NotificationTypeEnum[] = ['MATCH_SUGGESTION', 'PREDICTION_DUE'];
const SYSTEM_TYPES: NotificationTypeEnum[] = ['SYSTEM_ANNOUNCEMENT'];

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
  SYSTEM_ANNOUNCEMENT: 'System Announcement',
};

const PREF_GROUPS = [
  { label: 'Bids', types: BID_TYPES },
  { label: 'Products', types: PRODUCT_TYPES },
  { label: 'Matches & Predictions', types: MATCH_TYPES },
  { label: 'System', types: SYSTEM_TYPES },
];

function getTypeIcon(type: string): string {
  switch (type) {
    case 'BID_RECEIVED': return '📥';
    case 'BID_ACCEPTED': return '✅';
    case 'BID_REJECTED': return '❌';
    case 'BID_COUNTERED': return '↔️';
    case 'BID_OUTCOME': return '📦';
    case 'PRODUCT_NEW': return '🆕';
    case 'PRODUCT_PRICE': return '💰';
    case 'PRODUCT_STOCK': return '📊';
    case 'MATCH_SUGGESTION': return '🎯';
    case 'COA_PROCESSED': return '🔬';
    case 'PREDICTION_DUE': return '📅';
    case 'SYSTEM_ANNOUNCEMENT': return '📢';
    default: return '🔔';
  }
}

function getNotificationLink(n: NotificationRecord): string | null {
  const data = n.data;
  if (!data) return null;
  if (data.productId) return `/marketplace/${data.productId}`;
  if (data.matchId) return '/my-matches';
  if (data.bidId) return '/orders';
  return null;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const SELLER_ONLY_TYPES = new Set<string>(['BID_RECEIVED', 'COA_PROCESSED']);

export default function NotificationsPage() {
  const { data: userData } = useUserStatus();
  const isSeller = userData?.user?.contactType?.includes('Seller') ?? false;
  const navigate = useNavigate();

  const [tab, setTab] = useState<FilterTab>('all');
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Preferences
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (tab === 'unread') params.unreadOnly = true;
      const res = await fetchNotifications(params);

      let filtered = res.notifications;
      if (tab === 'bids') filtered = filtered.filter((n) => BID_TYPES.includes(n.type));
      else if (tab === 'products') filtered = filtered.filter((n) => PRODUCT_TYPES.includes(n.type));
      else if (tab === 'matches') filtered = filtered.filter((n) => MATCH_TYPES.includes(n.type));
      else if (tab === 'system') filtered = filtered.filter((n) => SYSTEM_TYPES.includes(n.type));

      setNotifications(filtered);
      setPagination(res.pagination);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, tab]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch { /* ignore */ }
  }

  async function handleClickNotification(n: NotificationRecord) {
    if (!n.read) {
      markNotificationsRead([n.id]).catch(() => {});
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
    }
    const link = getNotificationLink(n);
    if (link) navigate(link);
  }

  async function loadPrefs() {
    setPrefsLoading(true);
    try {
      const res = await fetchNotificationPreferences();
      setPrefs(res.preferences);
    } catch { /* ignore */ }
    setPrefsLoading(false);
  }

  async function togglePref(type: NotificationTypeEnum) {
    if (!prefs || type === 'SYSTEM_ANNOUNCEMENT') return;
    const newVal = !prefs[type];
    const updated = { ...prefs, [type]: newVal };
    setPrefs(updated);
    try {
      await updateNotificationPreferences({ [type]: newVal });
    } catch {
      setPrefs(prefs); // revert on error
    }
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'bids', label: 'Bids' },
    { key: 'products', label: 'Products' },
    { key: 'matches', label: 'Matches' },
    { key: 'system', label: 'System' },
  ];

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">Notifications</h1>
          <div className="flex gap-2">
            <button
              onClick={handleMarkAllRead}
              className="rounded-lg border border-default px-3 py-1.5 text-xs font-medium text-primary hover-surface-muted transition"
            >
              Mark all read
            </button>
            <button
              onClick={() => { setShowPrefs(!showPrefs); if (!prefs) loadPrefs(); }}
              className="rounded-lg border border-default px-3 py-1.5 text-xs font-medium text-primary hover-surface-muted transition"
            >
              {showPrefs ? 'Hide' : 'Preferences'}
            </button>
          </div>
        </div>

        {/* Preferences panel */}
        {showPrefs && (
          <div className="mb-6 rounded-lg surface border border-default p-4">
            <h2 className="mb-3 text-sm font-semibold text-primary">Notification Preferences</h2>
            {prefsLoading || !prefs ? (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-teal border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-4">
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
                      <div className="space-y-1">
                        {visibleTypes.map((type) => (
                          <label
                            key={type}
                            className="flex items-center justify-between rounded-md px-2 py-1.5 hover-surface-muted transition cursor-pointer"
                          >
                            <span className="text-sm text-primary">
                              {getTypeIcon(type)} {TYPE_LABELS[type] || type}
                            </span>
                            <button
                              onClick={() => togglePref(type)}
                              disabled={type === 'SYSTEM_ANNOUNCEMENT'}
                              className={`relative h-5 w-9 rounded-full transition ${
                                prefs[type] ? 'bg-brand-teal' : 'bg-gray-300 dark:bg-gray-600'
                              } ${type === 'SYSTEM_ANNOUNCEMENT' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span
                                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                  prefs[type] ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Filter tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-default">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                tab === t.key
                  ? 'border-brand-teal text-brand-teal'
                  : 'border-transparent text-muted hover:text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Notification list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-teal border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg surface border border-default py-12 text-center text-sm text-muted">
            No notifications{tab !== 'all' ? ` in this category` : ''}
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClickNotification(n)}
                className={`flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left transition hover-surface-muted ${
                  !n.read ? 'surface border border-brand-blue/20' : 'surface border border-transparent'
                }`}
              >
                <span className="mt-0.5 text-lg">{getTypeIcon(n.type)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className={`text-sm ${!n.read ? 'font-semibold text-primary' : 'text-primary'}`}>
                      {n.title}
                    </p>
                    <span className="flex-shrink-0 text-[11px] text-muted/60">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{n.body}</p>
                </div>
                {!n.read && (
                  <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-brand-blue" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-default px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover-surface-muted transition"
            >
              Previous
            </button>
            <span className="text-xs text-muted">
              Page {page} of {pagination.totalPages}
            </span>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-default px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover-surface-muted transition"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
