import {Buffer} from 'buffer';
import http from 'http';
import {AddressInfo} from 'net';
import {URL, URLSearchParams} from 'url';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCode,
  registerClient,
  runAuth,
  runLogout,
  writeSecret,
  type AuthDeps,
  type MCPServerResource,
} from './auth.js';

function startMockOAuthServer(opts: {
  expectResource: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/register') && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const parsed = JSON.parse(body);
        res.writeHead(201, {'content-type': 'application/json'});
        res.end(
          JSON.stringify({
            client_id: 'test-client',
            client_secret: 'test-secret',
            redirect_uris: parsed.redirect_uris,
          })
        );
      });
      return;
    }
    if (req.url?.startsWith('/token') && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const params = new URLSearchParams(body);
        if (params.get('resource') !== opts.expectResource) {
          res.writeHead(400, {'content-type': 'application/json'});
          res.end(JSON.stringify({error: 'bad_resource'}));
          return;
        }
        const auth = req.headers['authorization'] || '';
        if (!auth.toString().startsWith('Basic ')) {
          res.writeHead(401, {'content-type': 'application/json'});
          res.end(JSON.stringify({error: 'invalid_client'}));
          return;
        }
        res.writeHead(200, {'content-type': 'application/json'});
        res.end(
          JSON.stringify({
            access_token: opts.accessToken,
            refresh_token: opts.refreshToken,
            expires_in: opts.expiresIn,
            token_type: 'bearer',
          })
        );
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise<{baseUrl: string; close: () => Promise<void>}>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe('buildAuthorizeUrl', () => {
  it('includes all required OAuth + RFC 8707 params', () => {
    const url = buildAuthorizeUrl({
      authorizationEndpoint: 'https://as.example/authorize',
      clientId: 'abc',
      redirectUri: 'http://127.0.0.1:9999/callback',
      state: 'xyz',
      codeChallenge: 'challenge',
      resource: 'https://mcp.example/mcp',
    });
    const u = new URL(url);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('abc');
    expect(u.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:9999/callback'
    );
    expect(u.searchParams.get('state')).toBe('xyz');
    expect(u.searchParams.get('code_challenge')).toBe('challenge');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('resource')).toBe('https://mcp.example/mcp');
  });
});

describe('registerClient', () => {
  it('rejects when redirect_uris mismatch', async () => {
    const server = await startMockOAuthServer({
      expectResource: 'x',
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 10,
    });
    try {
      const custom: typeof fetch = async (input, init) => {
        // Rewrite the response to drop redirect_uris.
        const real = await fetch(input as string, init);
        const json = await real.json();
        delete (json as Record<string, unknown>).redirect_uris;
        (json as Record<string, unknown>).redirect_uris = ['http://evil/cb'];
        // eslint-disable-next-line no-undef
        return new Response(JSON.stringify(json), {
          status: real.status,
          headers: {'content-type': 'application/json'},
        });
      };
      await expect(
        registerClient(
          `${server.baseUrl}/register`,
          'http://127.0.0.1:1/callback',
          custom
        )
      ).rejects.toThrow(/redirect_uris/);
    } finally {
      await server.close();
    }
  });

  it('returns client_id + client_secret on success', async () => {
    const server = await startMockOAuthServer({
      expectResource: 'x',
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 10,
    });
    try {
      const reg = await registerClient(
        `${server.baseUrl}/register`,
        'http://127.0.0.1:1/callback',
        fetch
      );
      expect(reg.client_id).toBe('test-client');
      expect(reg.client_secret).toBe('test-secret');
    } finally {
      await server.close();
    }
  });
});

describe('exchangeCode', () => {
  it('posts form-encoded with Basic auth and parses tokens', async () => {
    const server = await startMockOAuthServer({
      expectResource: 'https://mcp.example/mcp',
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
      expiresIn: 3600,
    });
    try {
      const tokens = await exchangeCode({
        tokenEndpoint: `${server.baseUrl}/token`,
        clientId: 'test-client',
        clientSecret: 'test-secret',
        code: 'the-code',
        redirectUri: 'http://127.0.0.1:1/callback',
        codeVerifier: 'the-verifier',
        resource: 'https://mcp.example/mcp',
        fetchImpl: fetch,
      });
      expect(tokens.access_token).toBe('access-123');
      expect(tokens.refresh_token).toBe('refresh-456');
      expect(tokens.expires_in).toBe(3600);
    } finally {
      await server.close();
    }
  });

  it('surfaces 4xx response body in error', async () => {
    const server = await startMockOAuthServer({
      expectResource: 'match',
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 10,
    });
    try {
      await expect(
        exchangeCode({
          tokenEndpoint: `${server.baseUrl}/token`,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          code: 'c',
          redirectUri: 'http://127.0.0.1:1/callback',
          codeVerifier: 'v',
          resource: 'wrong',
          fetchImpl: fetch,
        })
      ).rejects.toThrow(/token exchange failed.*bad_resource/);
    } finally {
      await server.close();
    }
  });
});

describe('writeSecret', () => {
  it('patches when the secret exists', async () => {
    const kubectl = vi.fn(async (_bin: string, args: string[]) => {
      if (args[0] === 'get') return {stdout: '{}'} as any;
      return {stdout: ''} as any;
    });
    await writeSecret(
      {
        namespace: 'default',
        name: 'notion-tokens',
        keys: {
          accessTokenKey: 'access_token',
          refreshTokenKey: 'refresh_token',
          expiresAtKey: 'expires_at',
          clientIDKey: 'client_id',
          clientSecretKey: 'client_secret',
        },
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: '2025-01-01T00:00:00.000Z',
        clientId: 'cid',
        clientSecret: 'csec',
      },
      kubectl as any
    );
    const calls = kubectl.mock.calls.map((c) => c[1]);
    expect(calls[0][0]).toBe('get');
    expect(calls[1][0]).toBe('patch');
    // The patch payload is the last arg; confirm base64 encoding happened.
    const patchJson = JSON.parse(calls[1][calls[1].length - 1] as string);
    expect(
      Buffer.from(patchJson.data.access_token, 'base64').toString('utf8')
    ).toBe('a');
    expect(
      Buffer.from(patchJson.data.refresh_token, 'base64').toString('utf8')
    ).toBe('r');
  });

  it('creates a new Opaque secret when missing', async () => {
    const kubectl = vi.fn(async (_bin: string, args: string[]) => {
      if (args[0] === 'get') throw new Error('NotFound');
      return {stdout: ''} as any;
    });
    await writeSecret(
      {
        namespace: 'ns',
        name: 'tokens',
        keys: {
          accessTokenKey: 'access_token',
          refreshTokenKey: 'refresh_token',
          expiresAtKey: 'expires_at',
          clientIDKey: 'client_id',
          clientSecretKey: 'client_secret',
        },
        accessToken: 'a',
        expiresAt: 't',
        clientId: 'cid',
      },
      kubectl as any
    );
    const applyCall = kubectl.mock.calls.find((c) => (c[1] as string[])[0] === 'apply');
    expect(applyCall).toBeTruthy();
    const opts = applyCall![2] as {input: string};
    const manifest = JSON.parse(opts.input);
    expect(manifest.kind).toBe('Secret');
    expect(manifest.type).toBe('Opaque');
    expect(manifest.metadata.namespace).toBe('ns');
  });
});

describe('runAuth end-to-end', () => {
  let mock: {baseUrl: string; close: () => Promise<void>};

  beforeEach(async () => {
    mock = await startMockOAuthServer({
      expectResource: 'https://mcp.example/mcp',
      accessToken: 'e2e-access',
      refreshToken: 'e2e-refresh',
      expiresIn: 120,
    });
  });
  afterEach(async () => {
    await mock.close();
  });

  it('runs DCR + PKCE + callback + token exchange + secret patch', async () => {
    const mcpServer: MCPServerResource = {
      metadata: {name: 'notion', namespace: 'default'},
      spec: {authorization: {tokenSecretRef: {name: 'notion-tokens'}}},
      status: {
        authorization: {
          state: 'Required',
          resource: 'https://mcp.example/mcp',
          registrationEndpoint: `${mock.baseUrl}/register`,
          authorizationEndpoint: `${mock.baseUrl}/authorize`,
          tokenEndpoint: `${mock.baseUrl}/token`,
        },
      },
    };

    // Capture kubectl calls and simulate cluster responses.
    const kubectlCalls: string[][] = [];
    const kubectl = vi.fn(async (_bin: string, args: string[]) => {
      kubectlCalls.push(args);
      if (args[0] === 'config') return {stdout: 'default'} as any;
      if (args[0] === 'get' && args[1] === 'mcpserver') {
        return {stdout: JSON.stringify(mcpServer)} as any;
      }
      if (args[0] === 'get' && args[1] === 'secret') {
        // Pretend it exists so we exercise the patch path.
        return {stdout: '{}'} as any;
      }
      return {stdout: ''} as any;
    });

    // The opener walks the authorize URL and drives the callback itself, same
    // shape a browser would.
    const openBrowser = vi.fn(async (url: string) => {
      const u = new URL(url);
      const redirect = u.searchParams.get('redirect_uri')!;
      const state = u.searchParams.get('state')!;
      const cb = new URL(redirect);
      cb.searchParams.set('code', 'mock-auth-code');
      cb.searchParams.set('state', state);
      const res = await fetch(cb.toString());
      await res.text();
    });

    const deps: AuthDeps = {
      openBrowser,
      kubectl: kubectl as any,
      fetch,
    };

    await runAuth('notion', {namespace: 'default', timeout: 10_000}, deps);

    expect(openBrowser).toHaveBeenCalledOnce();
    const patchCall = kubectlCalls.find((c) => c[0] === 'patch');
    expect(patchCall).toBeTruthy();
    const patch = JSON.parse(patchCall![patchCall!.length - 1]);
    expect(
      Buffer.from(patch.data.access_token, 'base64').toString('utf8')
    ).toBe('e2e-access');
    expect(
      Buffer.from(patch.data.refresh_token, 'base64').toString('utf8')
    ).toBe('e2e-refresh');
    expect(
      Buffer.from(patch.data.client_id, 'base64').toString('utf8')
    ).toBe('test-client');
    expect(
      Buffer.from(patch.data.client_secret, 'base64').toString('utf8')
    ).toBe('test-secret');
    // expires_at must be ISO 8601.
    const expIso = Buffer.from(patch.data.expires_at, 'base64').toString(
      'utf8'
    );
    expect(Number.isNaN(Date.parse(expIso))).toBe(false);
  });

  it('refuses when state is not Required and --force not passed', async () => {
    const mcpServer: MCPServerResource = {
      metadata: {name: 'notion'},
      spec: {authorization: {tokenSecretRef: {name: 'notion-tokens'}}},
      status: {authorization: {state: 'Authorized'}},
    };
    const kubectl = vi.fn(async (_bin: string, args: string[]) => {
      if (args[0] === 'config') return {stdout: 'default'} as any;
      if (args[0] === 'get' && args[1] === 'mcpserver') {
        return {stdout: JSON.stringify(mcpServer)} as any;
      }
      return {stdout: ''} as any;
    });
    const deps: AuthDeps = {
      openBrowser: vi.fn(),
      kubectl: kubectl as any,
      fetch,
    };
    await expect(runAuth('notion', {}, deps)).rejects.toThrow(/--force/);
  });
});

describe('runLogout', () => {
  const baseServer: MCPServerResource = {
    metadata: {name: 'notion', namespace: 'default'},
    spec: {authorization: {tokenSecretRef: {name: 'notion-tokens'}}},
    status: {authorization: {state: 'Authorized'}},
  };

  function makeKubectl(opts: {
    server?: MCPServerResource;
    secretExists?: boolean;
    onCall?: (args: string[]) => void;
  }) {
    const server = opts.server ?? baseServer;
    const secretExists = opts.secretExists ?? true;
    const calls: string[][] = [];
    const fn = vi.fn(async (_bin: string, args: string[]) => {
      calls.push(args);
      opts.onCall?.(args);
      if (args[0] === 'config') return {stdout: 'default'} as any;
      if (args[0] === 'get' && args[1] === 'mcpserver') {
        return {stdout: JSON.stringify(server)} as any;
      }
      if (args[0] === 'get' && args[1] === 'secret') {
        if (!secretExists) throw new Error('NotFound');
        return {stdout: '{}'} as any;
      }
      return {stdout: ''} as any;
    });
    return {fn, calls};
  }

  it('default logout patches all five keys to empty', async () => {
    const {fn, calls} = makeKubectl({});
    const deps: AuthDeps = {
      openBrowser: vi.fn(),
      kubectl: fn as any,
      fetch,
    };
    await runLogout('notion', {namespace: 'default'}, deps);
    const patchCall = calls.find((c) => c[0] === 'patch');
    expect(patchCall).toBeTruthy();
    const patch = JSON.parse(patchCall![patchCall!.length - 1]);
    expect(Object.keys(patch.data).sort()).toEqual([
      'access_token',
      'client_id',
      'client_secret',
      'expires_at',
      'refresh_token',
    ]);
    for (const v of Object.values(patch.data)) expect(v).toBe('');
  });

  it('--keep-client patches only the three token keys', async () => {
    const {fn, calls} = makeKubectl({});
    const deps: AuthDeps = {
      openBrowser: vi.fn(),
      kubectl: fn as any,
      fetch,
    };
    await runLogout(
      'notion',
      {namespace: 'default', keepClient: true},
      deps
    );
    const patchCall = calls.find((c) => c[0] === 'patch');
    expect(patchCall).toBeTruthy();
    const patch = JSON.parse(patchCall![patchCall!.length - 1]);
    expect(Object.keys(patch.data).sort()).toEqual([
      'access_token',
      'expires_at',
      'refresh_token',
    ]);
    for (const v of Object.values(patch.data)) expect(v).toBe('');
  });

  it('--delete-secret issues kubectl delete with --ignore-not-found=true', async () => {
    const {fn, calls} = makeKubectl({});
    const deps: AuthDeps = {
      openBrowser: vi.fn(),
      kubectl: fn as any,
      fetch,
    };
    await runLogout(
      'notion',
      {namespace: 'default', deleteSecret: true},
      deps
    );
    const deleteCall = calls.find((c) => c[0] === 'delete');
    expect(deleteCall).toBeTruthy();
    expect(deleteCall).toEqual([
      'delete',
      'secret',
      'notion-tokens',
      '-n',
      'default',
      '--ignore-not-found=true',
    ]);
    expect(calls.find((c) => c[0] === 'patch')).toBeUndefined();
  });

  it('rejects --keep-client + --delete-secret without issuing any kubectl call', async () => {
    const fn = vi.fn(async () => ({stdout: ''}) as any);
    const deps: AuthDeps = {
      openBrowser: vi.fn(),
      kubectl: fn as any,
      fetch,
    };
    await expect(
      runLogout(
        'notion',
        {namespace: 'default', keepClient: true, deleteSecret: true},
        deps
      )
    ).rejects.toThrow(/mutually exclusive/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('missing Secret is a no-op and exits zero', async () => {
    const {fn, calls} = makeKubectl({secretExists: false});
    const deps: AuthDeps = {
      openBrowser: vi.fn(),
      kubectl: fn as any,
      fetch,
    };
    await runLogout('notion', {namespace: 'default'}, deps);
    expect(calls.find((c) => c[0] === 'patch')).toBeUndefined();
    expect(calls.find((c) => c[0] === 'delete')).toBeUndefined();
  });

  it('never echoes any token value to stdout/stderr', async () => {
    // Pre-existing tokens in the secret would only be visible if logout
    // logged them; runLogout never reads the secret data, so probe the
    // command surface to be sure no stray value appears.
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const {fn} = makeKubectl({});
      const deps: AuthDeps = {
        openBrowser: vi.fn(),
        kubectl: fn as any,
        fetch,
      };
      await runLogout('notion', {namespace: 'default'}, deps);
      const captured = [
        ...stdoutWrite.mock.calls,
        ...stderrWrite.mock.calls,
        ...consoleLog.mock.calls,
        ...consoleError.mock.calls,
      ]
        .flat()
        .map((c) => (typeof c === 'string' ? c : String(c)))
        .join('\n');
      // Sentinels for token-shaped strings — none should ever leak.
      expect(captured).not.toMatch(/eyJ[A-Za-z0-9_-]+\./); // JWT-ish
      expect(captured).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
      expect(captured).not.toMatch(/access_token["']?\s*[:=]\s*["'][^"']+["']/);
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
      consoleLog.mockRestore();
      consoleError.mockRestore();
    }
  });
});
