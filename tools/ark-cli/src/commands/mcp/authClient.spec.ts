import {vi, type Mock} from 'vitest';

const mockFetch = vi.fn() as Mock;
globalThis.fetch = mockFetch as unknown as typeof fetch;

const {McpAuthClient, AuthHttpError} = await import('./authClient.js');

describe('McpAuthClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs JSON body and namespace query to auth/start', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        auth_id: 'aid',
        authorization_url: 'https://idp/example',
        flow_expires_at: '2026-01-01T00:00:00Z',
      }),
    });

    const client = new McpAuthClient('http://localhost:8080');
    const out = await client.start('notion-mcp', 'team-a', {
      force: true,
      scope: ['read', 'write'],
    });
    expect(out.auth_id).toBe('aid');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      'http://localhost:8080/v1/mcp-servers/notion-mcp/auth/start?namespace=team-a'
    );
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      force: true,
      scope: ['read', 'write'],
    });
  });

  it('GETs auth/status with auth_id query', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({state: 'pending'}),
    });
    const client = new McpAuthClient('http://localhost:8080');
    await client.status('notion-mcp', 'default', 'aid');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      'http://localhost:8080/v1/mcp-servers/notion-mcp/auth/status?namespace=default&auth_id=aid'
    );
  });

  it('raises AuthHttpError with body on non-2xx', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => 'already authorized',
    });
    const client = new McpAuthClient('http://localhost:8080');
    await expect(client.start('notion-mcp', 'default', {})).rejects.toThrow(
      AuthHttpError
    );
  });

  it('status() raises AuthHttpError with body on non-2xx', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    });
    const client = new McpAuthClient('http://localhost:8080');
    await expect(
      client.status('notion-mcp', 'default', 'aid')
    ).rejects.toThrow(AuthHttpError);
    try {
      await client.status('notion-mcp', 'default', 'aid');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthHttpError);
      expect((err as InstanceType<typeof AuthHttpError>).status).toBe(503);
      expect((err as InstanceType<typeof AuthHttpError>).body).toBe(
        'service unavailable'
      );
    }
  });

  it('logout() raises AuthHttpError with body on non-2xx', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });
    const client = new McpAuthClient('http://localhost:8080');
    await expect(
      client.logout('notion-mcp', 'default', {delete_secret: true})
    ).rejects.toThrow(AuthHttpError);
  });

  it('POSTs to auth/logout', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({noop: true}),
    });
    const client = new McpAuthClient('http://localhost:8080');
    await client.logout('notion-mcp', 'default', {delete_secret: true});
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      'http://localhost:8080/v1/mcp-servers/notion-mcp/auth/logout?namespace=default'
    );
    expect(JSON.parse(init.body)).toEqual({delete_secret: true});
  });
});
