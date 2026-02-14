import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { toggleShortlist as apiToggle, checkShortlist, fetchShortlistCount } from './api';

interface ShortlistContextValue {
  /** Check if a product is currently shortlisted (from local state) */
  isShortlisted: (productId: string) => boolean;
  /** Toggle shortlist state with optimistic update */
  toggle: (productId: string) => Promise<void>;
  /** Bulk preload shortlist states for a set of product IDs */
  preload: (productIds: string[]) => Promise<void>;
  /** Total shortlist count */
  count: number;
}

const ShortlistContext = createContext<ShortlistContextValue | null>(null);

export function ShortlistProvider({ children }: { children: ReactNode }) {
  const [shortlisted, setShortlisted] = useState<Record<string, boolean>>({});
  const [count, setCount] = useState(0);

  const isShortlisted = useCallback(
    (productId: string) => shortlisted[productId] ?? false,
    [shortlisted],
  );

  const toggle = useCallback(async (productId: string) => {
    const wasShortlisted = shortlisted[productId] ?? false;

    // Optimistic update
    setShortlisted((prev) => ({ ...prev, [productId]: !wasShortlisted }));
    setCount((prev) => (wasShortlisted ? Math.max(0, prev - 1) : prev + 1));

    try {
      const result = await apiToggle(productId);
      // Reconcile with server
      setShortlisted((prev) => ({ ...prev, [productId]: result.shortlisted }));
    } catch (err: any) {
      // TODO: REMOVE debug logging
      console.error('[SHORTLIST] Toggle failed:', err?.response?.status, err?.response?.data || err?.message);
      // Rollback on error
      setShortlisted((prev) => ({ ...prev, [productId]: wasShortlisted }));
      setCount((prev) => (wasShortlisted ? prev + 1 : Math.max(0, prev - 1)));
    }
  }, [shortlisted]);

  const preload = useCallback(async (productIds: string[]) => {
    if (productIds.length === 0) return;

    // Only check IDs we haven't loaded yet
    const unchecked = productIds.filter((id) => !(id in shortlisted));
    if (unchecked.length === 0) return;

    try {
      const [result, totalCount] = await Promise.all([
        checkShortlist(unchecked),
        fetchShortlistCount(),
      ]);
      setShortlisted((prev) => ({ ...prev, ...result }));
      setCount(totalCount);
    } catch {
      // Silently fail — shortlist state just won't show
    }
  }, [shortlisted]);

  return (
    <ShortlistContext.Provider value={{ isShortlisted, toggle, preload, count }}>
      {children}
    </ShortlistContext.Provider>
  );
}

export function useShortlist() {
  const ctx = useContext(ShortlistContext);
  if (!ctx) {
    throw new Error('useShortlist must be used within a ShortlistProvider');
  }
  return ctx;
}
