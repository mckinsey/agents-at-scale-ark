import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { vi } from 'vitest';

export function mockAppRouter(
  overrides: Partial<AppRouterInstance> = {},
): AppRouterInstance {
  return {
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    bfcacheId: 'test-bfcache-id',
    ...overrides,
  };
}
