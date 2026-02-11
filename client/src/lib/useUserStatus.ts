import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { fetchUserStatus, setAuthTokenGetter, type UserStatus } from './api';

/**
 * Hook that fetches the user's marketplace account status.
 * Returns loading, error, status data, and a refetch function.
 */
export function useUserStatus() {
  const { getToken, isSignedIn } = useAuth();
  const [data, setData] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Set up auth token getter once
  useEffect(() => {
    if (!initialized && isSignedIn) {
      setAuthTokenGetter(getToken);
      setInitialized(true);
    }
  }, [isSignedIn, getToken, initialized]);

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
    if (initialized) {
      refetch();
    }
  }, [initialized, refetch]);

  return { data, loading, error, refetch };
}
