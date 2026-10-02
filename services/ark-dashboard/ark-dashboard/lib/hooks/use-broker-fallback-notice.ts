'use client';

import { useCallback, useMemo, useState } from 'react';

export const BROKER_FALLBACK_NOTICE_STORAGE_KEY =
  'ark-dashboard:broker-fallback-acknowledged';

export interface UseBrokerFallbackNoticeResult {
  visible: boolean;
  notify: () => void;
  dismiss: () => void;
}

function isAcknowledged(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return (
      window.localStorage.getItem(BROKER_FALLBACK_NOTICE_STORAGE_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

export function useBrokerFallbackNotice(): UseBrokerFallbackNoticeResult {
  const [visible, setVisible] = useState(false);

  const notify = useCallback(() => {
    if (!isAcknowledged()) {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(BROKER_FALLBACK_NOTICE_STORAGE_KEY, 'true');
    } catch {}
  }, []);

  return useMemo(
    () => ({ visible, notify, dismiss }),
    [visible, notify, dismiss],
  );
}
