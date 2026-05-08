import {Buffer} from 'buffer';
import http from 'http';
import {AddressInfo} from 'net';
import {URL, URLSearchParams} from 'url';
import {execa} from 'execa';
import openDefault from 'open';
import output from '../../lib/output.js';
import {generatePkcePair, generateState} from './pkce.js';

// Kept out of the command surface so integration tests can stand in a mock.
export interface BrowserOpener {
  (url: string): Promise<unknown>;
}

export interface AuthDeps {
  openBrowser: BrowserOpener;
  kubectl: typeof execa;
  fetch: typeof fetch;
}

export const defaultDeps: AuthDeps = {
  openBrowser: (url) => openDefault(url),
  kubectl: execa,
  fetch: (...args) => fetch(...(args as Parameters<typeof fetch>)),
};

export interface AuthorizationStatus {
  state?: string;
  resource?: string;
  resourceName?: string;
  registrationEndpoint?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  scopesSupported?: string[];
}

export interface TokenSecretRef {
  name: string;
  accessTokenKey?: string;
  refreshTokenKey?: string;
  expiresAtKey?: string;
  clientIDKey?: string;
  clientSecretKey?: string;
}

export interface MCPServerResource {
  metadata: {name: string; namespace?: string};
  spec?: {
    authorization?: {
      tokenSecretRef: TokenSecretRef;
    };
  };
  status?: {
    authorization?: AuthorizationStatus;
  };
}

export interface AuthOptions {
  namespace?: string;
  force?: boolean;
  port?: number;
  open?: boolean;
  timeout?: number; // ms
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const SECRET_KEY_DEFAULTS = {
  accessTokenKey: 'access_token',
  refreshTokenKey: 'refresh_token',
  expiresAtKey: 'expires_at',
  clientIDKey: 'client_id',
  clientSecretKey: 'client_secret',
};

function resolvedKeys(ref: TokenSecretRef) {
  return {
    accessTokenKey: ref.accessTokenKey || SECRET_KEY_DEFAULTS.accessTokenKey,
    refreshTokenKey: ref.refreshTokenKey || SECRET_KEY_DEFAULTS.refreshTokenKey,
    expiresAtKey: ref.expiresAtKey || SECRET_KEY_DEFAULTS.expiresAtKey,
    clientIDKey: ref.clientIDKey || SECRET_KEY_DEFAULTS.clientIDKey,
    clientSecretKey:
      ref.clientSecretKey || SECRET_KEY_DEFAULTS.clientSecretKey,
  };
}

export async function getMCPServer(
  name: string,
  namespace: string | undefined,
  kubectl: typeof execa
): Promise<MCPServerResource> {
  const args = ['get', 'mcpserver', name, '-o', 'json'];
  if (namespace) args.push('-n', namespace);
  const {stdout} = await kubectl('kubectl', args, {stdio: 'pipe'});
  return JSON.parse(stdout) as MCPServerResource;
}

export async function resolveNamespace(
  flag: string | undefined,
  kubectl: typeof execa
): Promise<string> {
  if (flag) return flag;
  try {
    const {stdout} = await kubectl(
      'kubectl',
      [
        'config',
        'view',
        '--minify',
        '-o',
        'jsonpath={..namespace}',
      ],
      {stdio: 'pipe'}
    );
    const ns = stdout.trim();
    return ns || 'default';
  } catch {
    return 'default';
  }
}

interface RegisteredClient {
  client_id: string;
  client_secret?: string;
}

export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
  fetchImpl: typeof fetch
): Promise<RegisteredClient> {
  const body = {
    client_name: 'ark mcp auth',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_basic',
  };
  const res = await fetchImpl(registrationEndpoint, {
    method: 'POST',
    headers: {'content-type': 'application/json', accept: 'application/json'},
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `dynamic client registration failed: ${res.status} ${text}`
    );
  }
  const data = (await res.json()) as RegisteredClient & {
    redirect_uris?: string[];
  };
  if (data.redirect_uris && !data.redirect_uris.includes(redirectUri)) {
    throw new Error(
      `registration endpoint returned redirect_uris that do not include ${redirectUri}`
    );
  }
  return data;
}

export function buildAuthorizeUrl(params: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource: string;
  scope?: string;
}): string {
  const u = new URL(params.authorizationEndpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', params.clientId);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('state', params.state);
  u.searchParams.set('code_challenge', params.codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('resource', params.resource);
  if (params.scope) u.searchParams.set('scope', params.scope);
  return u.toString();
}

interface CallbackResult {
  code: string;
  state: string;
}

export function startCallbackListener(
  port: number | undefined,
  timeoutMs: number
): {
  server: http.Server;
  port: Promise<number>;
  awaitCode: Promise<CallbackResult>;
} {
  let resolvePort!: (p: number) => void;
  let rejectPort!: (e: Error) => void;
  const portPromise = new Promise<number>((res, rej) => {
    resolvePort = res;
    rejectPort = rej;
  });

  let resolveCode!: (r: CallbackResult) => void;
  let rejectCode!: (e: Error) => void;
  const codePromise = new Promise<CallbackResult>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  const server = http.createServer((req, res) => {
    if (!req.url || !req.url.startsWith('/callback')) {
      res.writeHead(404);
      res.end();
      return;
    }
    const reqUrl = new URL(req.url, 'http://127.0.0.1');
    const code = reqUrl.searchParams.get('code');
    const state = reqUrl.searchParams.get('state');
    const error = reqUrl.searchParams.get('error');

    if (error) {
      res.writeHead(400, {'content-type': 'text/html'});
      res.end(
        `<html><body><h1>Authorization failed</h1><p>${escapeHtml(error)}</p></body></html>`
      );
      rejectCode(new Error(`authorization error: ${error}`));
      return;
    }
    if (!code || !state) {
      res.writeHead(400, {'content-type': 'text/html'});
      res.end('<html><body>missing code or state</body></html>');
      rejectCode(new Error('callback missing code or state'));
      return;
    }

    res.writeHead(200, {'content-type': 'text/html'});
    res.end(
      '<html><body><h1>Authorization complete</h1><p>You may close this window.</p></body></html>'
    );
    resolveCode({code, state});
  });

  // Empty string binds to all, but we want loopback only — 127.0.0.1 keeps the
  // OAuth redirect off the LAN.
  server.listen(port ?? 0, '127.0.0.1', () => {
    const addr = server.address() as AddressInfo | null;
    if (!addr) {
      rejectPort(new Error('failed to bind callback listener'));
      return;
    }
    resolvePort(addr.port);
  });

  server.on('error', (e) => {
    rejectPort(e);
    rejectCode(e);
  });

  const timer = setTimeout(() => {
    rejectCode(
      new Error(`timed out waiting for OAuth callback after ${timeoutMs}ms`)
    );
    server.close();
  }, timeoutMs);
  // Never let the timer keep Node alive past a resolved promise.
  timer.unref?.();
  codePromise.finally(() => clearTimeout(timer)).catch(() => {});

  return {server, port: portPromise, awaitCode: codePromise};
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&'
      ? '&amp;'
      : c === '<'
        ? '&lt;'
        : c === '>'
          ? '&gt;'
          : c === '"'
            ? '&quot;'
            : '&#39;'
  );
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export async function exchangeCode(params: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string;
  fetchImpl: typeof fetch;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
    resource: params.resource,
  });
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (params.clientSecret) {
    const b64 = Buffer.from(
      `${params.clientId}:${params.clientSecret}`
    ).toString('base64');
    headers['authorization'] = `Basic ${b64}`;
  } else {
    body.set('client_id', params.clientId);
  }

  const res = await params.fetchImpl(params.tokenEndpoint, {
    method: 'POST',
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `token exchange failed: ${res.status} ${res.statusText} — ${text}`
    );
  }
  return (await res.json()) as TokenResponse;
}

function b64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

interface SecretWriteInput {
  namespace: string;
  name: string;
  keys: ReturnType<typeof resolvedKeys>;
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  clientId: string;
  clientSecret?: string;
}

// Merges tokens into the named Secret — creates it opaque if missing, patches it
// otherwise. Patch (not replace) is deliberate so unrelated keys survive.
export async function writeSecret(
  input: SecretWriteInput,
  kubectl: typeof execa
): Promise<void> {
  const data: Record<string, string> = {
    [input.keys.accessTokenKey]: b64(input.accessToken),
    [input.keys.expiresAtKey]: b64(input.expiresAt),
    [input.keys.clientIDKey]: b64(input.clientId),
  };
  if (input.refreshToken) {
    data[input.keys.refreshTokenKey] = b64(input.refreshToken);
  }
  if (input.clientSecret) {
    data[input.keys.clientSecretKey] = b64(input.clientSecret);
  }

  let exists = false;
  try {
    await kubectl(
      'kubectl',
      ['get', 'secret', input.name, '-n', input.namespace],
      {stdio: 'pipe'}
    );
    exists = true;
  } catch {
    // Secret does not exist — we'll create it below.
  }

  if (exists) {
    const patch = JSON.stringify({data});
    await kubectl(
      'kubectl',
      ['patch', 'secret', input.name, '-n', input.namespace, '--type=merge', '-p', patch],
      {stdio: 'pipe'}
    );
  } else {
    const manifest = {
      apiVersion: 'v1',
      kind: 'Secret',
      type: 'Opaque',
      metadata: {name: input.name, namespace: input.namespace},
      data,
    };
    await kubectl('kubectl', ['apply', '-f', '-'], {
      input: JSON.stringify(manifest),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
}

export async function runAuth(
  serverName: string,
  options: AuthOptions,
  deps: AuthDeps = defaultDeps
): Promise<void> {
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const namespace = await resolveNamespace(options.namespace, deps.kubectl);
  const server = await getMCPServer(serverName, namespace, deps.kubectl);

  const auth = server.status?.authorization;
  if (!auth) {
    throw new Error(
      `MCPServer ${serverName} has no status.authorization — nothing to authorize against. ` +
        `Has the controller reconciled it yet?`
    );
  }
  if (auth.state !== 'Required' && !options.force) {
    throw new Error(
      `MCPServer ${serverName} is in state ${auth.state ?? '(empty)'}; ` +
        `pass --force to rotate tokens anyway`
    );
  }
  if (!auth.authorizationEndpoint || !auth.tokenEndpoint) {
    throw new Error(
      `MCPServer ${serverName} is missing authorizationEndpoint / tokenEndpoint in status — discovery incomplete`
    );
  }
  if (!auth.resource) {
    throw new Error(
      `MCPServer ${serverName} is missing status.authorization.resource — required for RFC 8707`
    );
  }
  const tokenSecretRef = server.spec?.authorization?.tokenSecretRef;
  if (!tokenSecretRef) {
    throw new Error(
      `MCPServer ${serverName} has no spec.authorization.tokenSecretRef — cannot persist tokens`
    );
  }

  // Bind the loopback FIRST so we know the port to register with DCR.
  const listener = startCallbackListener(options.port, timeoutMs);
  let boundPort: number;
  try {
    boundPort = await listener.port;
  } catch (e) {
    listener.server.close();
    throw e;
  }
  const redirectUri = `http://127.0.0.1:${boundPort}/callback`;

  try {
    let clientId: string;
    let clientSecret: string | undefined;
    if (auth.registrationEndpoint) {
      const reg = await registerClient(
        auth.registrationEndpoint,
        redirectUri,
        deps.fetch
      );
      clientId = reg.client_id;
      clientSecret = reg.client_secret;
      output.info(`registered OAuth client_id=${clientId}`);
    } else {
      throw new Error(
        'no registrationEndpoint in status and pre-registered client support is not implemented yet'
      );
    }

    const pkce = generatePkcePair();
    const state = generateState();
    const authorizeUrl = buildAuthorizeUrl({
      authorizationEndpoint: auth.authorizationEndpoint,
      clientId,
      redirectUri,
      state,
      codeChallenge: pkce.challenge,
      resource: auth.resource,
    });

    console.log('\nOpen this URL in your browser to authorize:\n');
    console.log(authorizeUrl);
    console.log('');

    if (options.open !== false) {
      try {
        await deps.openBrowser(authorizeUrl);
      } catch {
        output.warning('failed to open browser automatically; paste the URL above');
      }
    }

    const callback = await listener.awaitCode;
    if (callback.state !== state) {
      throw new Error(
        'state parameter mismatch — aborting, possible CSRF'
      );
    }

    const tokens = await exchangeCode({
      tokenEndpoint: auth.tokenEndpoint,
      clientId,
      clientSecret,
      code: callback.code,
      redirectUri,
      codeVerifier: pkce.verifier,
      resource: auth.resource,
      fetchImpl: deps.fetch,
    });

    const expiresAt = new Date(
      Date.now() + (tokens.expires_in ?? 3600) * 1000
    ).toISOString();

    await writeSecret(
      {
        namespace,
        name: tokenSecretRef.name,
        keys: resolvedKeys(tokenSecretRef),
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        clientId,
        clientSecret,
      },
      deps.kubectl
    );

    output.success(
      `tokens written to secret ${tokenSecretRef.name} in namespace ${namespace}`
    );
    console.log(`  resource:   ${auth.resource}`);
    console.log(`  expires_at: ${expiresAt}`);
    console.log(
      `  state:      Required -> Authorized (expected within pollInterval)`
    );
  } finally {
    listener.server.close();
  }
}

export interface LogoutOptions {
  namespace?: string;
  keepClient?: boolean;
  deleteSecret?: boolean;
}

async function secretExists(
  name: string,
  namespace: string,
  kubectl: typeof execa
): Promise<boolean> {
  try {
    await kubectl(
      'kubectl',
      ['get', 'secret', name, '-n', namespace],
      {stdio: 'pipe'}
    );
    return true;
  } catch {
    return false;
  }
}

export async function runLogout(
  serverName: string,
  options: LogoutOptions,
  deps: AuthDeps = defaultDeps
): Promise<void> {
  if (options.keepClient && options.deleteSecret) {
    throw new Error(
      '--keep-client and --delete-secret are mutually exclusive'
    );
  }

  const namespace = await resolveNamespace(options.namespace, deps.kubectl);
  const server = await getMCPServer(serverName, namespace, deps.kubectl);

  const tokenSecretRef = server.spec?.authorization?.tokenSecretRef;
  if (!tokenSecretRef) {
    throw new Error(
      `MCPServer ${serverName} has no spec.authorization.tokenSecretRef — nothing to clear`
    );
  }
  const keys = resolvedKeys(tokenSecretRef);
  const secretName = tokenSecretRef.name;

  if (options.deleteSecret) {
    await deps.kubectl(
      'kubectl',
      [
        'delete',
        'secret',
        secretName,
        '-n',
        namespace,
        '--ignore-not-found=true',
      ],
      {stdio: 'pipe'}
    );
    output.success(
      `deleted secret ${secretName} in namespace ${namespace}`
    );
    console.log(
      `  run 'ark mcp auth login ${serverName}' to re-authenticate`
    );
    return;
  }

  const exists = await secretExists(secretName, namespace, deps.kubectl);
  if (!exists) {
    output.info(
      `secret ${secretName} not found in namespace ${namespace} — nothing to do`
    );
    return;
  }

  const clearedKeys: string[] = options.keepClient
    ? [keys.accessTokenKey, keys.refreshTokenKey, keys.expiresAtKey]
    : [
        keys.accessTokenKey,
        keys.refreshTokenKey,
        keys.expiresAtKey,
        keys.clientIDKey,
        keys.clientSecretKey,
      ];

  const data: Record<string, string> = {};
  for (const k of clearedKeys) data[k] = '';
  const patch = JSON.stringify({data});

  await deps.kubectl(
    'kubectl',
    [
      'patch',
      'secret',
      secretName,
      '-n',
      namespace,
      '--type=merge',
      '-p',
      patch,
    ],
    {stdio: 'pipe'}
  );

  output.success(
    `cleared ${clearedKeys.join(', ')} in secret ${secretName} (namespace ${namespace})`
  );
  console.log(
    `  run 'ark mcp auth login ${serverName}' to re-authenticate`
  );
}
