'use client';

import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const dismissedInMemory = new Set<string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readDismissed(storageKey: string): boolean {
  if (dismissedInMemory.has(storageKey)) {
    return true;
  }
  try {
    return Boolean(globalThis.localStorage?.getItem(storageKey));
  } catch {
    return false;
  }
}

export interface UseDismissibleNoticeResult {
  dismissed: boolean;
  dismiss: () => void;
}

export function useDismissibleNotice(
  storageKey: string,
): UseDismissibleNoticeResult {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed(storageKey),
    () => true,
  );

  const dismiss = useCallback(() => {
    try {
      globalThis.localStorage?.setItem(storageKey, 'true');
    } catch {
      dismissedInMemory.add(storageKey);
    }
    listeners.forEach(listener => listener());
  }, [storageKey]);

  return { dismissed, dismiss };
}
