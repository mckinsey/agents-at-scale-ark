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

const {runLogin} = await import('./login.js');
type LoginDeps = (typeof import('./login.js'))['defaultDeps'];
const {AuthHttpError, McpAuthClient} = await import('./authClient.js');

function makeDeps(overrides: Partial<LoginDeps> = {}) {
  const stop = vi.fn();
  return {
    deps: {
      buildClient:
        overrides.buildClient ??
        ((baseUrl: string) => new McpAuthClient(baseUrl)),
      openBrowser:
        overrides.openBrowser ?? vi.fn().mockResolvedValue(undefined),
      resolveNs: overrides.resolveNs ?? vi.fn().mockReturnValue('default'),
      startProxy:
        overrides.startProxy ??
        vi.fn().mockResolvedValue({baseUrl: 'http://localhost:1234', stop}),
      sleep: overrides.sleep ?? vi.fn().mockResolvedValue(undefined),
      now: overrides.now ?? (() => 0),
    },
    stop,
  };
}

const STDOUT_LINES: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  STDOUT_LINES.length = 0;
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    STDOUT_LINES.push(args.join(' '));
  });
});

describe('runLogin happy path', () => {
  it('returns 0 on authorized and prints expires_at', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'https://idp/example',
        flow_expires_at: '2026-01-01T00:00:00Z',
      }),
      status: vi
        .fn()
        .mockResolvedValueOnce({state: 'pending'})
        .mockResolvedValueOnce({
          state: 'authorized',
          expires_at: '2026-01-02T00:00:00Z',
        }),
      logout: vi.fn(),
    };
    const openBrowser = vi.fn().mockResolvedValue(undefined);
    const {deps, stop} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser,
    });

    const code = await runLogin('notion-mcp', {}, deps);
    expect(code).toBe(0);
    expect(client.start).toHaveBeenCalledWith('notion-mcp', 'default', {});
    expect(openBrowser).toHaveBeenCalledWith('https://idp/example');
    expect(client.status).toHaveBeenCalledTimes(2);
    expect(mockOutput.success).toHaveBeenCalledWith(
      'authorized (token expires at 2026-01-02T00:00:00Z)'
    );
    expect(stop).toHaveBeenCalled();
  });
});

describe('runLogin --no-open', () => {
  it('prints URL but does not call openBrowser', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'https://idp/example',
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'authorized'}),
      logout: vi.fn(),
    };
    const openBrowser = vi.fn();
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser,
    });
    const code = await runLogin('notion-mcp', {open: false}, deps);
    expect(code).toBe(0);
    expect(openBrowser).not.toHaveBeenCalled();
    expect(STDOUT_LINES.some((l) => l.includes('https://idp/example'))).toBe(
      true
    );
  });
});

describe('runLogin flag mapping', () => {
  it('passes force in body', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'https://idp/example',
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'authorized'}),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    await runLogin('notion-mcp', {force: true, open: false}, deps);
    expect(client.start).toHaveBeenCalledWith('notion-mcp', 'default', {
      force: true,
    });
  });
});

describe('runLogin negative paths', () => {
  it('surfaces 409 verbatim', async () => {
    const client = {
      start: vi
        .fn()
        .mockRejectedValue(new AuthHttpError(409, 'already authorized')),
      status: vi.fn(),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    const code = await runLogin('notion-mcp', {open: false}, deps);
    expect(code).toBe(1);
    expect(mockOutput.error).toHaveBeenCalledWith(
      'mcp auth failed:',
      'already authorized'
    );
  });

  it('exits non-zero on failed status with reason', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'x',
        flow_expires_at: 'x',
      }),
      status: vi
        .fn()
        .mockResolvedValue({state: 'failed', message: 'invalid_grant'}),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    const code = await runLogin('notion-mcp', {open: false}, deps);
    expect(code).toBe(1);
    expect(mockOutput.error).toHaveBeenCalledWith(
      'mcp auth failed:',
      'invalid_grant'
    );
  });

  it('exits non-zero on poll timeout', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'x',
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'pending'}),
      logout: vi.fn(),
    };
    let virtualNow = 0;
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
      sleep: vi.fn().mockImplementation(async () => {
        virtualNow += 60_000;
      }),
      now: () => virtualNow,
    });
    const code = await runLogin(
      'notion-mcp',
      {open: false, timeout: '60s'},
      deps
    );
    expect(code).toBe(1);
    expect(mockOutput.error).toHaveBeenCalledWith(
      'mcp auth failed:',
      'timed out waiting for authorization'
    );
  });

  it('rejects 0s timeout before contacting proxy', async () => {
    const client = {
      start: vi.fn(),
      status: vi.fn(),
      logout: vi.fn(),
    };
    const startProxy = vi.fn();
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
      startProxy,
    });
    const code = await runLogin(
      'notion-mcp',
      {timeout: '0s', open: false},
      deps
    );
    expect(code).toBe(1);
    expect(startProxy).not.toHaveBeenCalled();
    expect(client.start).not.toHaveBeenCalled();
  });

  it('proxy startup failure bubbles up as exit 1', async () => {
    const client = {start: vi.fn(), status: vi.fn(), logout: vi.fn()};
    const startProxy = vi.fn().mockRejectedValue(new Error('proxy down'));
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      startProxy,
    });
    await expect(runLogin('notion-mcp', {open: false}, deps)).rejects.toThrow(
      'proxy down'
    );
  });
});

describe('runLogin redaction', () => {
  it('never prints client_id, client_secret, tokens, or verifier from upstream', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url:
          'https://idp/example?client_id=cid&code_challenge=cc',
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({
        state: 'authorized',
        expires_at: '2026-01-02T00:00:00Z',
      }),
      logout: vi.fn(),
    };
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        STDOUT_LINES.push(args.join(' '));
      });
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    await runLogin('notion-mcp', {open: false}, deps);

    const blob = STDOUT_LINES.join('\n');
    for (const needle of [
      'access_token',
      'refresh_token',
      'client_secret',
      'code_verifier',
    ]) {
      expect(blob).not.toMatch(new RegExp(needle));
    }
    errorSpy.mockRestore();
  });
});

describe('runLogin scope splitting', () => {
  it('splits scope on whitespace and commas, dropping empties', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'x',
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'authorized'}),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    await runLogin(
      'notion-mcp',
      {scope: 'read  write,, admin', open: false},
      deps
    );
    expect(client.start).toHaveBeenCalledWith('notion-mcp', 'default', {
      scope: ['read', 'write', 'admin'],
    });
  });
});

describe('runLogin invalid --timeout', () => {
  it('rejects garbage --timeout before contacting proxy', async () => {
    const client = {start: vi.fn(), status: vi.fn(), logout: vi.fn()};
    const startProxy = vi.fn();
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      startProxy,
    });
    const code = await runLogin(
      'notion-mcp',
      {timeout: 'not-a-duration', open: false},
      deps
    );
    expect(code).toBe(1);
    expect(startProxy).not.toHaveBeenCalled();
    expect(mockOutput.error).toHaveBeenCalledWith(
      'mcp auth failed:',
      expect.stringContaining('invalid --timeout value')
    );
  });
});

describe('runLogin openBrowser failure', () => {
  it('swallows browser open errors and continues polling', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'https://idp/example',
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'authorized'}),
      logout: vi.fn(),
    };
    const openBrowser = vi.fn().mockRejectedValue(new Error('no browser'));
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser,
    });
    const code = await runLogin('notion-mcp', {}, deps);
    expect(code).toBe(0);
    expect(openBrowser).toHaveBeenCalledWith('https://idp/example');
    expect(client.status).toHaveBeenCalled();
  });
});

describe('runLogin status error mid-poll', () => {
  it('surfaces AuthHttpError thrown by status() with body', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'x',
        flow_expires_at: 'x',
      }),
      status: vi
        .fn()
        .mockRejectedValue(new AuthHttpError(500, 'kaboom')),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    const code = await runLogin('notion-mcp', {open: false}, deps);
    expect(code).toBe(1);
    expect(mockOutput.error).toHaveBeenCalledWith('mcp auth failed:', 'kaboom');
  });
});

describe('runLogin start error fallback', () => {
  it('falls back to HTTP <status> when AuthHttpError body is empty', async () => {
    const client = {
      start: vi.fn().mockRejectedValue(new AuthHttpError(500, '')),
      status: vi.fn(),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    const code = await runLogin('notion-mcp', {open: false}, deps);
    expect(code).toBe(1);
    expect(mockOutput.error).toHaveBeenCalledWith(
      'mcp auth failed:',
      'HTTP 500'
    );
  });
});

describe('runLogin authorized without expires_at', () => {
  it('prints "authorized" without timestamp suffix', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'x',
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'authorized'}),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    const code = await runLogin('notion-mcp', {open: false}, deps);
    expect(code).toBe(0);
    expect(mockOutput.success).toHaveBeenCalledWith('authorized');
  });
});

describe('runLogin expired terminal state', () => {
  it('returns 1 on expired state with no message, using state as reason', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'x',
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'expired'}),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    const code = await runLogin('notion-mcp', {open: false}, deps);
    expect(code).toBe(1);
    expect(mockOutput.error).toHaveBeenCalledWith('mcp auth failed:', 'expired');
  });
});

describe('runLogin callback reachability guard', () => {
  const authUrlWithRedirect = (redirectUri: string) =>
    `https://idp/authorize?client_id=cid&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=s`;

  it('warns when the callback port differs from the port-forward port', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: authUrlWithRedirect(
          'http://127.0.0.1:34780/v1/mcp/auth/callback'
        ),
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'authorized'}),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    await runLogin('notion-mcp', {open: false}, deps);
    expect(mockOutput.warning).toHaveBeenCalledWith(
      expect.stringContaining('port 1234')
    );
  });

  it('does not warn when the callback port matches the port-forward port', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: authUrlWithRedirect(
          'http://127.0.0.1:1234/v1/mcp/auth/callback'
        ),
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'authorized'}),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    await runLogin('notion-mcp', {open: false}, deps);
    expect(mockOutput.warning).not.toHaveBeenCalled();
  });

  it('does not warn for a public https callback host', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: authUrlWithRedirect(
          'https://ark.example.com/v1/mcp/auth/callback'
        ),
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'authorized'}),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    await runLogin('notion-mcp', {open: false}, deps);
    expect(mockOutput.warning).not.toHaveBeenCalled();
  });
});

describe('execa carve-out', () => {
  it('runLogin never shells out to kubectl get/patch — only port-forward is allowed', async () => {
    const client = {
      start: vi.fn().mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'x',
        flow_expires_at: 'x',
      }),
      status: vi.fn().mockResolvedValue({state: 'authorized'}),
      logout: vi.fn(),
    };
    const {deps} = makeDeps({
      buildClient: () =>
        client as unknown as InstanceType<typeof McpAuthClient>,
      openBrowser: vi.fn(),
    });
    await runLogin('notion-mcp', {open: false}, deps);

    for (const call of mockExeca.mock.calls) {
      const [bin, args] = call as [string, string[]];
      if (bin === 'kubectl') {
        expect(args[0]).toBe('port-forward');
      }
    }
  });
});
