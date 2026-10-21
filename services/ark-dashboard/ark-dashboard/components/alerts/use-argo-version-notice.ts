'use client';

import { useCallback, useEffect, useState } from 'react';

export const ARGO_VERSION_NOTICE_STORAGE_KEY =
  'ark-dashboard:argo-version-warning-dismissed';

export interface UseArgoVersionNoticeResult {
  dismissed: boolean;
  dismiss: () => void;
}

export function useArgoVersionNotice(): UseArgoVersionNoticeResult {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      if (window.localStorage.getItem(ARGO_VERSION_NOTICE_STORAGE_KEY)) {
        setDismissed(true);
      }
    } catch {
      // Storage disabled; default to not dismissed.
    }
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(ARGO_VERSION_NOTICE_STORAGE_KEY, 'true');
    } catch {
      // Storage disabled; state still reflects the dismissal.
    }
  }, []);

  return { dismissed, dismiss };
}
