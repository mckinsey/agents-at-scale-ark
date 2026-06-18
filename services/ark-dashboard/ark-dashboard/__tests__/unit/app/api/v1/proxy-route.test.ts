import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH, POST, PUT } from '@/app/api/v1/[...proxy]/route';

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/auth/auth-config', () => ({
  SESSION_COOKIE_NAME: 'authjs.session-token',
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function makeBackendResponse(init?: {
  status?: number;
  body?: BodyInit | null;
  headers?: HeadersInit;
}): Response {
  // Preserve explicit `body: null` (status 204 forbids a body per the spec).
  const body = init && 'body' in init ? init.body : '{}';
  return new Response(body ?? null, {
    status: init?.status ?? 200,
    statusText: 'OK',
    headers: new Headers(
      init?.headers ?? { 'content-type': 'application/json' },
    ),
  });
}

function makeRequest(
  pathname: string,
  options: {
    method?: string;
    search?: string;
    headers?: Record<string, string>;
    body?: ReadableStream | null;
  } = {},
): NextRequest {
  const search = options.search ?? '';
  const headers = new Headers({
    host: 'example.com',
    ...(options.headers ?? {}),
  });
  return {
    nextUrl: {
      pathname,
      search,
      protocol: 'https:',
    },
    method: options.method ?? 'GET',
    headers,
    body: options.body ?? null,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

function makeContext(proxy: string[]) {
  return { params: Promise.resolve({ proxy }) };
}

describe('app/api/v1/[...proxy]/route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ARK_API_SERVICE_HOST = 'ark-api';
    process.env.ARK_API_SERVICE_PORT = '80';
    process.env.ARK_API_SERVICE_PROTOCOL = 'http';
    process.env.AUTH_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.ARK_API_SERVICE_HOST;
    delete process.env.ARK_API_SERVICE_PORT;
    delete process.env.ARK_API_SERVICE_PROTOCOL;
    delete process.env.AUTH_SECRET;
  });

  describe('GET', () => {
    it('proxies to ark-api at /v1/<path> using the configured service env', async () => {
      mockFetch.mockResolvedValueOnce(makeBackendResponse());

      const request = makeRequest('/api/v1/agents', {
        search: '?namespace=default',
      });
      const response = await GET(request, makeContext(['agents']));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://ark-api:80/v1/agents?namespace=default');
      expect((init as RequestInit).method).toBe('GET');
      expect(response.status).toBe(200);
    });

    it('honours ARK_API_SERVICE_PROTOCOL / HOST / PORT overrides', async () => {
      process.env.ARK_API_SERVICE_PROTOCOL = 'https';
      process.env.ARK_API_SERVICE_HOST = 'backend.internal';
      process.env.ARK_API_SERVICE_PORT = '8443';
      mockFetch.mockResolvedValueOnce(makeBackendResponse());

      await GET(makeRequest('/api/v1/queries'), makeContext(['queries']));

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://backend.internal:8443/v1/queries');
    });

    it('sets X-Forwarded-* headers and drops the browser Host header', async () => {
      mockFetch.mockResolvedValueOnce(makeBackendResponse());

      await GET(
        makeRequest('/api/v1/agents', { headers: { host: 'mydomain.com' } }),
        makeContext(['agents']),
      );

      const [, init] = mockFetch.mock.calls[0];
      const headers = (init as RequestInit).headers as Headers;
      expect(headers.get('X-Forwarded-Prefix')).toBe('/api');
      expect(headers.get('X-Forwarded-Host')).toBe('mydomain.com');
      expect(headers.get('X-Forwarded-Proto')).toBe('https');
      expect(headers.get('host')).toBeNull();
    });

    it('mints Authorization: Bearer when getToken returns an access_token (SSO mode)', async () => {
      const { getToken } = await import('next-auth/jwt');
      vi.mocked(getToken).mockResolvedValueOnce({
        access_token: 'ya29.abc',
      } as unknown as Awaited<ReturnType<typeof getToken>>);
      mockFetch.mockResolvedValueOnce(makeBackendResponse());

      await GET(makeRequest('/api/v1/agents'), makeContext(['agents']));

      const [, init] = mockFetch.mock.calls[0];
      const headers = (init as RequestInit).headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer ya29.abc');
    });

    it('omits Authorization when getToken returns null (open mode)', async () => {
      const { getToken } = await import('next-auth/jwt');
      vi.mocked(getToken).mockResolvedValueOnce(null);
      mockFetch.mockResolvedValueOnce(makeBackendResponse());

      await GET(makeRequest('/api/v1/agents'), makeContext(['agents']));

      const [, init] = mockFetch.mock.calls[0];
      const headers = (init as RequestInit).headers as Headers;
      expect(headers.get('Authorization')).toBeNull();
    });

    it('omits Authorization when the token has no access_token', async () => {
      const { getToken } = await import('next-auth/jwt');
      vi.mocked(getToken).mockResolvedValueOnce({
        sub: 'user-123',
      } as unknown as Awaited<ReturnType<typeof getToken>>);
      mockFetch.mockResolvedValueOnce(makeBackendResponse());

      await GET(makeRequest('/api/v1/agents'), makeContext(['agents']));

      const [, init] = mockFetch.mock.calls[0];
      const headers = (init as RequestInit).headers as Headers;
      expect(headers.get('Authorization')).toBeNull();
    });

    it('reads the session cookie under SESSION_COOKIE_NAME (handles __Secure- prefix)', async () => {
      const { getToken } = await import('next-auth/jwt');
      vi.mocked(getToken).mockResolvedValueOnce(null);
      mockFetch.mockResolvedValueOnce(makeBackendResponse());

      await GET(makeRequest('/api/v1/agents'), makeContext(['agents']));

      expect(getToken).toHaveBeenCalledWith(
        expect.objectContaining({
          cookieName: 'authjs.session-token',
          secret: 'test-secret',
        }),
      );
    });

    it('strips hop-by-hop response headers (content-length, transfer-encoding, connection)', async () => {
      mockFetch.mockResolvedValueOnce(
        makeBackendResponse({
          headers: {
            'content-type': 'application/json',
            'content-length': '42',
            'transfer-encoding': 'chunked',
            connection: 'keep-alive',
            'x-custom': 'kept',
          },
        }),
      );

      const response = await GET(
        makeRequest('/api/v1/agents'),
        makeContext(['agents']),
      );

      expect(response.headers.get('content-length')).toBeNull();
      expect(response.headers.get('transfer-encoding')).toBeNull();
      expect(response.headers.get('connection')).toBeNull();
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('x-custom')).toBe('kept');
    });

    it('returns the YAML export mock for /agents/<name>/export without hitting ark-api', async () => {
      const response = await GET(
        makeRequest('/api/v1/agents/my-agent/export'),
        makeContext(['agents', 'my-agent', 'export']),
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/yaml');
      expect(response.headers.get('Content-Disposition')).toBe(
        'attachment; filename="my-agent.yaml"',
      );
      const body = await response.text();
      expect(body).toContain('kind: Agent');
      expect(body).toContain('name: my-agent');
    });

    it('returns the right YAML kind for each known resource type', async () => {
      const cases: Array<[string, string]> = [
        ['models', 'kind: Model'],
        ['secrets', 'kind: Secret'],
        ['teams', 'kind: Team'],
        ['mcp-servers', 'kind: MCPServer'],
        ['memories', 'kind: Memory'],
        ['workflow-templates', 'kind: WorkflowTemplate'],
      ];
      for (const [resource, expectedKind] of cases) {
        const response = await GET(
          makeRequest(`/api/v1/${resource}/sample/export`),
          makeContext([resource, 'sample', 'export']),
        );
        expect(response.status).toBe(200);
        expect(await response.text()).toContain(expectedKind);
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('proxies (does not YAML-mock) when the path does not match the export shape', async () => {
      mockFetch.mockResolvedValueOnce(makeBackendResponse());
      await GET(
        makeRequest('/api/v1/agents/export'),
        makeContext(['agents', 'export']),
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://ark-api:80/v1/agents/export');
    });
  });

  describe('write methods', () => {
    it.each([
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
    ] as const)(
      'proxies %s with request body and duplex: half',
      async (method, handler) => {
        mockFetch.mockResolvedValueOnce(makeBackendResponse());
        const body = new ReadableStream();

        await handler(
          makeRequest('/api/v1/queries', { method, body }),
          makeContext(['queries']),
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe('http://ark-api:80/v1/queries');
        const fetchInit = init as RequestInit & { duplex?: 'half' };
        expect(fetchInit.method).toBe(method);
        expect(fetchInit.body).toBe(body);
        expect(fetchInit.duplex).toBe('half');
      },
    );

    it('DELETE proxies and does NOT attach a body or duplex flag', async () => {
      mockFetch.mockResolvedValueOnce(
        makeBackendResponse({ status: 204, body: null }),
      );

      const response = await DELETE(
        makeRequest('/api/v1/agents/foo', { method: 'DELETE' }),
        makeContext(['agents', 'foo']),
      );

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://ark-api:80/v1/agents/foo');
      const fetchInit = init as RequestInit & { duplex?: string };
      expect(fetchInit.method).toBe('DELETE');
      expect(fetchInit.body).toBeUndefined();
      expect(fetchInit.duplex).toBeUndefined();
      expect(response.status).toBe(204);
    });

    it('GET never attaches a body even if request.body is non-null', async () => {
      mockFetch.mockResolvedValueOnce(makeBackendResponse());

      await GET(
        makeRequest('/api/v1/agents', {
          method: 'GET',
          body: new ReadableStream(),
        }),
        makeContext(['agents']),
      );

      const [, init] = mockFetch.mock.calls[0];
      const fetchInit = init as RequestInit & { duplex?: string };
      expect(fetchInit.body).toBeUndefined();
      expect(fetchInit.duplex).toBeUndefined();
    });
  });

  describe('response passthrough', () => {
    it('forwards the backend status code', async () => {
      mockFetch.mockResolvedValueOnce(makeBackendResponse({ status: 422 }));

      const response = await POST(
        makeRequest('/api/v1/queries', { method: 'POST' }),
        makeContext(['queries']),
      );

      expect(response.status).toBe(422);
    });

    it('forwards the backend response body', async () => {
      mockFetch.mockResolvedValueOnce(
        makeBackendResponse({ body: '{"items":[]}' }),
      );

      const response = await GET(
        makeRequest('/api/v1/agents'),
        makeContext(['agents']),
      );

      expect(await response.text()).toBe('{"items":[]}');
    });
  });
});
