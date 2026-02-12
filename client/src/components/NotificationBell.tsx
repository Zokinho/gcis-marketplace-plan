import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications } from '../lib/useNotifications';
import { fetchNotifications, markAllNotificationsRead, markNotificationsRead, NotificationRecord } from '../lib/api';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getNotificationLink(n: NotificationRecord): string | null {
  const data = n.data;
  if (!data) return null;
  if (data.productId) return `/marketplace/${data.productId}`;
  if (data.matchId) return '/my-matches';
  if (data.bidId) return '/orders';
  return null;
}

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

export default function NotificationBell() {
  const { unreadCount, refreshCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Fetch recent notifications when dropdown opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchNotifications({ limit: 5 })
      .then((res) => setRecent(res.notifications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setRecent((prev) => prev.map((n) => ({ ...n, read: true })));
      refreshCount();
    } catch { /* ignore */ }
  }

  async function handleClickNotification(n: NotificationRecord) {
    if (!n.read) {
      markNotificationsRead([n.id]).catch(() => {});
      setRecent((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
      refreshCount();
    }
    const link = getNotificationLink(n);
    setOpen(false);
    if (link) navigate(link);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-1.5 text-white/70 hover:text-white transition"
        aria-label="Notifications"
      >
        {/* Bell icon */}
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-coral px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg shadow-xl surface border border-default z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-default px-4 py-2.5">
            <span className="text-sm font-semibold text-primary">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-brand-blue hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-teal border-t-transparent" />
              </div>
            ) : recent.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted">No notifications yet</div>
            ) : (
              recent.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover-surface-muted ${!n.read ? 'bg-brand-blue/5 dark:bg-brand-blue/10' : ''}`}
                >
                  <span className="mt-0.5 text-base">{getTypeIcon(n.type)}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-primary' : 'text-primary'}`}>
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted line-clamp-2">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted/60">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-brand-blue" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-default px-4 py-2.5 text-center">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-brand-blue hover:underline"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
