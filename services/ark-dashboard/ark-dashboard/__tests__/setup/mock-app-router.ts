import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

let searchParams = new URLSearchParams();
const listeners = new Set<() => void>();
let queued: string[] = [];
let deferLanding = false;

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

/**
 * A real `router.replace` lands a render later than the call. That gap is where
 * a second writer on the same screen can build on a URL that predates the first
 * write, so a test has to be able to sit inside it: call
 * `deferAppRouterLanding()` first, then `applyAppRouterNavigations()` to let the
 * queue through. Landing immediately is the default.
 *
 * A test that leaves a navigation unlanded must also call `resetPendingParams`
 * from the hook, since an unlanded write is remembered per screen. This module
 * cannot do it: importing the hook here would close an import cycle through the
 * `next/navigation` mock factory and hang the run.
 */
function navigate(target: string): void {
  if (deferLanding) {
    queued.push(target);
    return;
  }
  applyTarget(target);
}

const router = {
  replace: vi.fn(navigate),
  push: vi.fn(navigate),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

/** The shared router mock, for asserting on navigations. */
export function getAppRouterMock() {
  return router;
}

/** Holds every navigation from here on until they are landed. */
export function deferAppRouterLanding(): void {
  deferLanding = true;
}

/** Applies the held navigations in the order they were issued. */
export function applyAppRouterNavigations(): void {
  const pending = queued;
  queued = [];
  for (const target of pending) {
    applyTarget(target);
  }
}

export function resetAppRouterMock(query = ''): void {
  searchParams = new URLSearchParams(query);
  queued = [];
  deferLanding = false;
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
