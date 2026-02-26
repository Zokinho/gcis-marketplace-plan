import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { fetchUserStatus, type UserStatus } from './api';

/**
 * Hook that fetches the user's marketplace account status.
 * Returns loading, error, status data, and a refetch function.
 */
export function useUserStatus() {
  const { isSignedIn } = useAuth();
  const [data, setData] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchUserStatus();
      setData(result);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load account status');
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  // Fetch once when the user signs in.
  // Do NOT depend on accessToken — silent token refreshes must not
  // trigger a re-fetch (which causes MarketplaceGuard to remount children,
  // wiping form state on pages like CreateListing).
  useEffect(() => {
    if (isSignedIn) {
      refetch();
    } else {
      setLoading(false);
    }
  }, [isSignedIn, refetch]);

  return { data, loading, error, refetch };
}
