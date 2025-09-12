import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import middleware from '@/middleware';
import type { NextRequestWithAuth } from '@/auth';

// Mock NextResponse methods
vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn(() => ({ type: 'next' })),
    redirect: vi.fn((url) => ({ type: 'redirect', url }))
  }
}));

// Mock getToken since the internal middleware uses it
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn().mockResolvedValue(null)
}));

// Mock the auth wrapper - it will call our callback function with the request
vi.mock('@/auth', () => ({
  auth: vi.fn((callback) => callback)
}));

describe('middleware default export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = (pathname: string): NextRequestWithAuth => {
    const url = new URL(`https://example.com${pathname}`);
    return {
      nextUrl: {
        pathname,
        search: '',
        protocol: 'https:',
        origin: url.origin
      },
      url: url.toString(),
      headers: new Map([
        ['host', 'example.com']
      ]),
      auth: null
    } as unknown as NextRequestWithAuth;
  };

  describe('authentication logic', () => {
    it('should redirect when req.auth is falsy', async () => {
      const request = createMockRequest('/dashboard');
      request.auth = null; // Falsy auth

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        new URL('/api/auth/signin?callbackUrl=https%3A%2F%2Fexample.com%2Fdashboard', 'https://example.com')
      );
    });

    it('should call middleware function when authenticated', async () => {
      const request = createMockRequest('/dashboard');
      request.auth = {
        user: {
          id: 'user123',
          email: 'test@example.com'
        },
        expires: ''
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      // Should proceed normally for authenticated users (calls internal middleware which returns NextResponse.next())
      expect(NextResponse.next).toHaveBeenCalled();
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });
  });
});
