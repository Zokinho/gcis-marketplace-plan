import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { fetchUserStatus, type UserStatus } from './api';

/**
 * Hook that fetches the user's marketplace account status.
 * Returns loading, error, status data, and a refetch function.
 */
export function useUserStatus() {
  const { isSignedIn, accessToken } = useAuth();
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

  useEffect(() => {
    if (isSignedIn && accessToken) {
      refetch();
    } else if (!isSignedIn) {
      setLoading(false);
    }
  }, [isSignedIn, accessToken, refetch]);

  return { data, loading, error, refetch };
}
