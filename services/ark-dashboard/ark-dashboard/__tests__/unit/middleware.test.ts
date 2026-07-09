import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NextRequestWithAuth } from '@/auth';
import middleware from '@/middleware';

// Mock NextResponse's static helpers so we can assert on redirect/next.
vi.mock('next/server', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockNextResponse: any = vi.fn((body, init) => ({
    body,
    status: init?.status,
    statusText: init?.statusText,
    headers: init?.headers,
  }));
  MockNextResponse.next = vi.fn(() => ({ type: 'next' }));
  MockNextResponse.redirect = vi.fn(url => ({ type: 'redirect', url }));

  return { NextResponse: MockNextResponse };
});

// The auth() wrapper just hands our callback the request in tests, so we can
// drive req.auth directly (sso: NextAuth populates it; open: openauth injects a
// dummy session — both reduce to "is req.auth truthy" here).
vi.mock('@/auth', () => ({
  auth: vi.fn(callback => callback),
}));

const BASE_URL = 'https://example.com';
const HUB_URL = 'https://hub.example.com';

const createMockRequest = (pathname: string): NextRequestWithAuth => {
  const url = new URL(`${BASE_URL}${pathname}`);
  const headers = new Headers();
  headers.set('host', 'example.com');

  return {
    nextUrl: {
      pathname,
      search: '',
      protocol: 'https:',
      origin: url.origin,
      href: url.toString(),
    },
    url: url.toString(),
    headers,
    method: 'GET',
    body: null,
    auth: null,
  } as unknown as NextRequestWithAuth;
};

describe('middleware (auth gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BASE_URL = BASE_URL;
  });

  afterEach(() => {
    delete process.env.BASE_URL;
    delete process.env.AUTH_HUB_URL;
  });

  describe('unauthenticated requests redirect to the local sign-in (no AUTH_HUB_URL)', () => {
    // Regression guard: the proxied API must be gated, not just UI pages.
    // Before the middleware was restored, GET /api/v1/* returned 200 + data
    // to anonymous callers.
    it('redirects the proxied API route /api/v1/context', async () => {
      const request = createMockRequest('/api/v1/context');
      request.auth = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        new URL(
          '/api/auth/signin?callbackUrl=https%3A%2F%2Fexample.com%2Fapi%2Fv1%2Fcontext',
          BASE_URL,
        ).toString(),
      );
      expect(NextResponse.next).not.toHaveBeenCalled();
    });

    it('redirects a UI page route', async () => {
      const request = createMockRequest('/dashboard');
      request.auth = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        new URL(
          '/api/auth/signin?callbackUrl=https%3A%2F%2Fexample.com%2Fdashboard',
          BASE_URL,
        ).toString(),
      );
    });
  });

  describe('hub model: unauthenticated requests redirect to AUTH_HUB_URL', () => {
    beforeEach(() => {
      process.env.AUTH_HUB_URL = HUB_URL;
    });

    it('redirects to the hub sign-in with the tenant URL as callbackUrl', async () => {
      const request = createMockRequest('/tenant-a');
      request.auth = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        `${HUB_URL}/api/auth/signin?callbackUrl=https%3A%2F%2Fexample.com%2Ftenant-a`,
      );
      expect(NextResponse.next).not.toHaveBeenCalled();
    });

    it('strips a trailing slash from AUTH_HUB_URL', async () => {
      process.env.AUTH_HUB_URL = `${HUB_URL}/`;
      const request = createMockRequest('/tenant-b');
      request.auth = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        `${HUB_URL}/api/auth/signin?callbackUrl=https%3A%2F%2Fexample.com%2Ftenant-b`,
      );
    });
  });

  describe('authenticated requests pass through', () => {
    it('calls NextResponse.next() and does not redirect (even with AUTH_HUB_URL set)', async () => {
      process.env.AUTH_HUB_URL = HUB_URL;
      const request = createMockRequest('/tenant-a/api/v1/context');
      request.auth = {
        user: { id: 'user123', email: 'test@example.com' },
        expires: '',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });
  });

  describe('excluded paths are never gated', () => {
    // These must pass through even with no session, or the auth flow and
    // static assets break. (Replaces the old config.matcher, which compiles to
    // an invalid RegExp under Next.js 16.)
    it.each([
      '/api/auth/signin',
      '/api/auth/providers',
      '/api/auth/session',
      '/signout',
      '/_next/static/chunk.js',
      '/_next/image',
      '/favicon.ico',
    ])('passes through %s without a session', async pathname => {
      const request = createMockRequest(pathname);
      request.auth = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      expect(NextResponse.redirect).not.toHaveBeenCalled();
      expect(NextResponse.next).toHaveBeenCalled();
    });
  });
});
