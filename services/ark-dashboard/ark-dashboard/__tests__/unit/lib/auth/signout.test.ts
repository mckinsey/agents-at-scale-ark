import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { signout } from '@/lib/auth/signout';

describe('signout', () => {
  const originalHref = window.location.href;

  beforeEach(() => {
    // Mock window.location.href setter
    Object.defineProperty(window, 'location', {
      value: {
        href: ''
      },
      writable: true
    });
  });

  afterEach(() => {
    // Restore original href
    Object.defineProperty(window, 'location', {
      value: {
        href: originalHref
      },
      writable: true
    });
    vi.clearAllMocks();
  });

  it('should redirect to federated signout path', () => {
    signout();

    expect(window.location.href).toBe('/api/auth/federated-signout');
  });

  it('should always set location href when called', () => {
    // Call signout multiple times to ensure it always sets the href
    signout();
    expect(window.location.href).toBe('/api/auth/federated-signout');

    // Reset and call again
    window.location.href = 'https://example.com/some-page';
    signout();
    expect(window.location.href).toBe('/api/auth/federated-signout');
  });
});
