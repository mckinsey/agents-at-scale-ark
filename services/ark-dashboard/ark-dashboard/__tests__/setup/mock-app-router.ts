import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

let searchParams = new URLSearchParams();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): URLSearchParams {
  return searchParams;
}

function applyTarget(target: string): void {
  searchParams = new URLSearchParams(target.split('?')[1] ?? '');
  emit();
}

const router = {
  replace: vi.fn(applyTarget),
  push: vi.fn(applyTarget),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

/** The shared router mock, for asserting on navigations. */
export function getAppRouterMock() {
  return router;
}

export function resetAppRouterMock(query = ''): void {
  searchParams = new URLSearchParams(query);
  router.replace.mockClear();
  router.push.mockClear();
  emit();
}

export function createAppRouterMock(pathname = '/list') {
  return {
    useRouter: () => router,
    usePathname: () => pathname,
    useSearchParams: () =>
      useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
  };
}
