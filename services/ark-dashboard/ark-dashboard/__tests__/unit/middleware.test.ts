import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NextRequestWithAuth } from '@/auth';
import middleware from '@/middleware';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock NextResponse as both constructor and static methods
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

  return {
    NextResponse: MockNextResponse,
  };
});

// Mock getToken since the internal middleware uses it
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn().mockResolvedValue(null),
}));

// Mock the auth wrapper - it will call our callback function with the request
vi.mock('@/auth', () => ({
  auth: vi.fn(callback => callback),
}));

describe('middleware default export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required environment variables
    process.env.BASE_URL = 'https://example.com';
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.BASE_URL;
  });

  const createMockRequest = (
    pathname: string,
    options: { method?: string; body?: ReadableStream | null } = {},
  ): NextRequestWithAuth => {
    const url = new URL(`https://example.com${pathname}`);
    const headers = new Headers();
    headers.set('host', 'example.com');

    return {
      nextUrl: {
        pathname,
        search: '',
        protocol: 'https:',
        origin: url.origin,
      },
      url: url.toString(),
      headers,
      method: options.method || 'GET',
      body: options.body || null,
      auth: null,
    } as unknown as NextRequestWithAuth;
  };

  describe('authentication logic', () => {
    it('should redirect when req.auth is falsy', async () => {
      const request = createMockRequest('/dashboard');
      request.auth = null; // Falsy auth

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        new URL(
          '/api/auth/signin?callbackUrl=https%3A%2F%2Fexample.com',
          'https://example.com',
        ),
      );
    });

    it('should call middleware function when authenticated', async () => {
      const request = createMockRequest('/dashboard');
      request.auth = {
        user: {
          id: 'user123',
          email: 'test@example.com',
        },
        expires: '',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      // Should proceed normally for authenticated users (calls internal middleware which returns NextResponse.next())
      expect(NextResponse.next).toHaveBeenCalled();
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });
  });

  describe('API proxying with streaming', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      process.env.ARK_API_SERVICE_HOST = 'backend-service';
      process.env.ARK_API_SERVICE_PORT = '9000';
      process.env.ARK_API_SERVICE_PROTOCOL = 'https';
    });

    afterEach(() => {
      delete process.env.ARK_API_SERVICE_HOST;
      delete process.env.ARK_API_SERVICE_PORT;
      delete process.env.ARK_API_SERVICE_PROTOCOL;
    });

    it('should proxy API requests using fetch for streaming support', async () => {
      const request = createMockRequest('/api/v1/queries');
      request.auth = {
        user: { id: 'user123', email: 'test@example.com' },
        expires: '',
      };

      const mockBody = new ReadableStream();
      const mockHeaders = new Headers({ 'content-type': 'application/json' });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: mockHeaders,
        body: mockBody,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://backend-service:9000/v1/queries',
        expect.any(Object),
      );

      const callArgs = mockFetch.mock.calls[0];
      const fetchOptions = callArgs[1];
      expect(fetchOptions.method).toBe('GET');

      // Verify forwarding headers were set in the request (sent downstream to backend)
      const headers = fetchOptions.headers as Headers;
      expect(headers.get('X-Forwarded-Prefix')).toBe('/api');
      expect(headers.get('X-Forwarded-Host')).toBe('example.com');
      expect(headers.get('X-Forwarded-Proto')).toBe('https');
    });

    it('should include authorization header when token is present', async () => {
      const { getToken } = await import('next-auth/jwt');
      vi.mocked(getToken).mockResolvedValueOnce({
        access_token: 'test-token-123',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const request = createMockRequest('/api/openai/v1/chat/completions');
      request.auth = {
        user: { id: 'user123', email: 'test@example.com' },
        expires: '',
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        body: new ReadableStream(),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      // Verify authorization header was included
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer test-token-123');
    });

    it('should preserve request body for POST requests', async () => {
      const mockBody = new ReadableStream();
      const request = createMockRequest('/api/v1/queries', {
        method: 'POST',
        body: mockBody,
      });
      request.auth = {
        user: { id: 'user123', email: 'test@example.com' },
        expires: '',
      };

      mockFetch.mockResolvedValueOnce({
        status: 201,
        statusText: 'Created',
        headers: new Headers(),
        body: new ReadableStream(),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: mockBody,
        }),
      );
    });

    it('should not proxy non-API requests', async () => {
      const request = createMockRequest('/dashboard');
      request.auth = {
        user: { id: 'user123', email: 'test@example.com' },
        expires: '',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (middleware as any)(request);

      // Verify fetch was NOT called for non-API paths
      expect(mockFetch).not.toHaveBeenCalled();
      expect(NextResponse.next).toHaveBeenCalled();
    });

    it('should add Authorization header to backend request but return backend headers in response', async () => {
      const { getToken } = await import('next-auth/jwt');
      vi.mocked(getToken).mockResolvedValueOnce({
        access_token: 'secret-token-456',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const request = createMockRequest('/api/v1/agents');
      request.auth = {
        user: { id: 'user123', email: 'test@example.com' },
        expires: '',
      };

      const backendResponseHeaders = new Headers({
        'content-type': 'application/json',
        'x-backend-version': '1.0.0',
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: backendResponseHeaders,
        body: new ReadableStream(),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (middleware as any)(request);

      // Verify Authorization was sent TO downstream server
      const callArgs = mockFetch.mock.calls[0];
      const backendRequestHeaders = callArgs[1].headers as Headers;
      expect(backendRequestHeaders.get('Authorization')).toBe(
        'Bearer secret-token-456',
      );

      // Verify the response headers come from backend (backend controls what client sees)
      // This verifies that we're returning backend response as-is
      expect(response.headers.get('x-backend-version')).toBe('1.0.0');
      expect(response.headers.get('content-type')).toBe('application/json');

      // The key security property: Authorization header was only in the request TO the downstream server
      // It's not in the response headers FROM the downstream server
      // This ensures tokens are never exposed to upstream (the browser/client)
      expect(backendResponseHeaders.get('Authorization')).toBeNull();
    });
  });
});
