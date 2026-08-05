'use client';

import { useCallback, useEffect, useState } from 'react';

export const EXPERIMENTAL_NOTICE_STORAGE_KEY =
  'ark-dashboard:argo-make-experimental-acknowledged';

export interface UseExperimentalNoticeResult {
  visible: boolean;
  dismiss: () => void;
}

export function useExperimentalNotice(): UseExperimentalNoticeResult {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      if (!window.localStorage.getItem(EXPERIMENTAL_NOTICE_STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(EXPERIMENTAL_NOTICE_STORAGE_KEY, 'true');
    } catch {
      // Storage disabled; state still reflects the dismissal.
    }
  }, []);

  return { visible, dismiss };
}
