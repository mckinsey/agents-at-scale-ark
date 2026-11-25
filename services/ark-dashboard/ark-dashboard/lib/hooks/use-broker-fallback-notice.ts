'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

export interface UseBrokerFallbackNoticeResult {
  visible: boolean;
  notify: () => void;
  dismiss: () => void;
}

export function useBrokerFallbackNotice(): UseBrokerFallbackNoticeResult {
  const [visible, setVisible] = useState(false);
  const dismissedRef = useRef(false);

  const notify = useCallback(() => {
    if (!dismissedRef.current) {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setVisible(false);
  }, []);

  return useMemo(
    () => ({ visible, notify, dismiss }),
    [visible, notify, dismiss],
  );
}
