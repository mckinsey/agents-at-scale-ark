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
    delete process.env.NEXT_PUBLIC_AUTH_HUB_URL;
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { href: originalHref },
      writable: true,
    });
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    delete process.env.NEXT_PUBLIC_AUTH_HUB_URL;
    vi.clearAllMocks();
  });

  it('redirects to the federated signout path at the root when no basePath/hub', () => {
    signout();
    expect(window.location.href).toBe('/api/auth/federated-signout');
  });

  it('prepends the basePath so the tenant prefix is preserved', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/tenant-a';
    signout();
    expect(window.location.href).toBe('/tenant-a/api/auth/federated-signout');
  });

  it('signs out at the hub when NEXT_PUBLIC_AUTH_HUB_URL is set (takes precedence over basePath)', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/tenant-a';
    process.env.NEXT_PUBLIC_AUTH_HUB_URL = 'http://localhost:3002';
    signout();
    expect(window.location.href).toBe(
      'http://localhost:3002/api/auth/federated-signout',
    );
  });

  it('strips a trailing slash from the hub URL', () => {
    process.env.NEXT_PUBLIC_AUTH_HUB_URL = 'http://localhost:3002/';
    signout();
    expect(window.location.href).toBe(
      'http://localhost:3002/api/auth/federated-signout',
    );
  });
});
