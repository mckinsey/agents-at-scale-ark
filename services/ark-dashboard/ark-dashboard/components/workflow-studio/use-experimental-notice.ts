'use client';

import { useDismissibleNotice } from '@/lib/hooks/use-dismissible-notice';

export const EXPERIMENTAL_NOTICE_STORAGE_KEY =
  'ark-dashboard:argo-make-experimental-acknowledged';

export interface UseExperimentalNoticeResult {
  visible: boolean;
  dismiss: () => void;
}

export function useExperimentalNotice(): UseExperimentalNoticeResult {
  const { dismissed, dismiss } = useDismissibleNotice(
    EXPERIMENTAL_NOTICE_STORAGE_KEY,
  );
  return { visible: !dismissed, dismiss };
}
