import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchUnreadCount } from './api';

const POLL_INTERVAL = 30_000; // 30 seconds

export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      // Silently fail — user may not be authenticated yet
    }
  }, []);

  useEffect(() => {
    refreshCount();
    intervalRef.current = setInterval(refreshCount, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshCount]);

  return { unreadCount, refreshCount };
}
