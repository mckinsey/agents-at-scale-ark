import {vi} from 'vitest';

const mockOutput = {
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../lib/output.js', () => ({default: mockOutput}));

const mockExeca = vi.fn();
vi.mock('execa', () => ({execa: mockExeca}));

const {runLogout} = await import('./logout.js');
type LogoutDeps = (typeof import('./logout.js'))['defaultLogoutDeps'];
const {AuthHttpError, McpAuthClient} = await import('./authClient.js');

function makeDeps(overrides: Partial<LogoutDeps> = {}): {
  deps: LogoutDeps;
  stop: ReturnType<typeof vi.fn>;
} {
  const stop = vi.fn();
  return {
    deps: {
      buildClient:
        overrides.buildClient ??
        ((baseUrl: string) => new McpAuthClient(baseUrl)),
      resolveNs: overrides.resolveNs ?? vi.fn().mockReturnValue('default'),
      startProxy:
        overrides.startProxy ??
        vi.fn().mockResolvedValue({baseUrl: 'http://localhost:1234', stop}),
    },
    stop,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runLogout', () => {
  it('default body clears keys and exits 0', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi.fn().mockResolvedValue({
        cleared_keys: [
          'access_token',
          'refresh_token',
          'expires_at',
          'client_id',
          'client_secret',
        ],
      }),
    };
    const {deps, stop} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
    });
    const code = await runLogout('notion-mcp', {}, deps);
    expect(code).toBe(0);
    expect(client.logout).toHaveBeenCalledWith('notion-mcp', 'default', {});
    expect(mockOutput.success).toHaveBeenCalledWith('logout: cleared 5 key(s)');
    expect(stop).toHaveBeenCalled();
  });

  it('--keep-client passes keep_client: true', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi.fn().mockResolvedValue({
        cleared_keys: ['access_token', 'refresh_token', 'expires_at'],
      }),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
    });
    const code = await runLogout('notion-mcp', {keepClient: true}, deps);
    expect(code).toBe(0);
    expect(client.logout).toHaveBeenCalledWith('notion-mcp', 'default', {
      keep_client: true,
    });
  });

  it('--delete-secret passes delete_secret: true', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi.fn().mockResolvedValue({deleted: true}),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
    });
    const code = await runLogout('notion-mcp', {deleteSecret: true}, deps);
    expect(code).toBe(0);
    expect(client.logout).toHaveBeenCalledWith('notion-mcp', 'default', {
      delete_secret: true,
    });
    expect(mockOutput.success).toHaveBeenCalledWith('logout: secret deleted');
  });

  it('mutual exclusion rejected client-side', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
    });
    const code = await runLogout(
      'notion-mcp',
      {keepClient: true, deleteSecret: true},
      deps
    );
    expect(code).toBe(1);
    expect(client.logout).not.toHaveBeenCalled();
    expect(mockOutput.error).toHaveBeenCalledWith(
      'mcp auth failed:',
      '--keep-client and --delete-secret are mutually exclusive'
    );
  });

  it('noop response prints noop and exits 0', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi.fn().mockResolvedValue({noop: true}),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
    });
    const code = await runLogout('notion-mcp', {}, deps);
    expect(code).toBe(0);
    expect(mockOutput.success).toHaveBeenCalledWith('logout: nothing to clear');
  });

  it('404 surfaces as MCPServer not found and exits 1', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi.fn().mockRejectedValue(new AuthHttpError(404, 'not found')),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
    });
    const code = await runLogout('notion-mcp', {}, deps);
    expect(code).toBe(1);
    expect(mockOutput.error).toHaveBeenCalledWith(
      'mcp auth failed:',
      'MCPServer not found'
    );
  });
});

describe('runLogout error fallbacks', () => {
  it('non-404 AuthHttpError surfaces body verbatim', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi
        .fn()
        .mockRejectedValue(new AuthHttpError(500, 'server explosion')),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
    });
    const code = await runLogout('notion-mcp', {}, deps);
    expect(code).toBe(1);
    expect(mockOutput.error).toHaveBeenCalledWith(
      'mcp auth failed:',
      'server explosion'
    );
  });

  it('non-404 AuthHttpError with empty body falls back to HTTP <status>', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi.fn().mockRejectedValue(new AuthHttpError(502, '')),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
    });
    const code = await runLogout('notion-mcp', {}, deps);
    expect(code).toBe(1);
    expect(mockOutput.error).toHaveBeenCalledWith(
      'mcp auth failed:',
      'HTTP 502'
    );
  });

  it('generic Error from logout() is surfaced and exits 1', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi.fn().mockRejectedValue(new Error('network gone')),
    };
    const {deps, stop} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
    });
    const code = await runLogout('notion-mcp', {}, deps);
    expect(code).toBe(1);
    expect(mockOutput.error).toHaveBeenCalledWith(
      'mcp auth failed:',
      'network gone'
    );
    expect(stop).toHaveBeenCalled();
  });
});

describe('logout execa carve-out', () => {
  it('runLogout never shells out to kubectl get/patch — only port-forward is allowed', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi.fn().mockResolvedValue({noop: true}),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
    });
    await runLogout('notion-mcp', {}, deps);

    for (const call of mockExeca.mock.calls) {
      const [bin, args] = call as [string, string[]];
      if (bin === 'kubectl') {
        expect(args[0]).toBe('port-forward');
      }
    }
  });
});
