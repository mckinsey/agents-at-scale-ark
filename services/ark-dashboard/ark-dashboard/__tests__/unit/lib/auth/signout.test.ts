import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signout } from '@/lib/auth/signout';

describe('signout', () => {
  const originalHref = window.location.href;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { href: originalHref },
      writable: true,
    });
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    vi.clearAllMocks();
  });

  it('navigates to the federated signout route at the root when no basePath', () => {
    signout();
    expect(window.location.href).toBe('/api/auth/federated-signout');
  });

  it('prepends the basePath so the tenant prefix is preserved', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/tenant-a';
    signout();
    expect(window.location.href).toBe('/tenant-a/api/auth/federated-signout');
  });
});
