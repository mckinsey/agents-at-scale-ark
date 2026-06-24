import open from 'open';
import output from '../../lib/output.js';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';
import {loadConfig} from '../../lib/config.js';
import {resolveNamespace} from './namespace.js';
import {parseTimeoutDuration} from './timeout.js';
import {AuthHttpError, McpAuthClient, AuthStartBody} from './authClient.js';

export interface LoginOptions {
  namespace?: string;
  force?: boolean;
  open?: boolean;
  timeout?: string;
  scope?: string;
}

export interface LoginDeps {
  buildClient: (baseUrl: string) => McpAuthClient;
  openBrowser: (url: string) => Promise<unknown>;
  resolveNs: (explicit?: string) => string;
  startProxy: () => Promise<{baseUrl: string; stop: () => void}>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export const defaultDeps: LoginDeps = {
  buildClient: (baseUrl: string) => new McpAuthClient(baseUrl),
  openBrowser: (url: string) => open(url),
  resolveNs: (explicit?: string) => resolveNamespace(explicit),
  startProxy: async () => {
    const config = loadConfig();
    const proxy = new ArkApiProxy(
      undefined,
      config.services?.reusePortForwards ?? false
    );
    const client = await proxy.start();
    return {
      baseUrl: client.getBaseUrl(),
      stop: () => proxy.stop(),
    };
  },
  sleep: (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const LOOPBACK_LITERALS = new Set(['127.0.0.1', '::1', 'localhost']);

function warnIfCallbackUnreachable(
  authorizationUrl: string,
  proxyBaseUrl: string
): void {
  let redirect: URL;
  try {
    const raw = new URL(authorizationUrl).searchParams.get('redirect_uri');
    if (!raw) return;
    redirect = new URL(raw);
  } catch {
    return;
  }

  const host = redirect.hostname.replace(/^\[|\]$/g, '');
  if (!LOOPBACK_LITERALS.has(host)) return;

  const proxyPort = new URL(proxyBaseUrl).port;
  if (redirect.port && proxyPort && redirect.port !== proxyPort) {
    output.warning(
      `callback is configured for ${redirect.host} but the CLI port-forward is on ` +
        `port ${proxyPort}; the browser redirect will not reach ark-api. Set ` +
        `ARK_API_PUBLIC_CALLBACK_URL to use port ${proxyPort}, or port-forward ` +
        `ark-api on port ${redirect.port}.`
    );
  }
}

export async function runLogin(
  serverName: string,
  options: LoginOptions,
  deps: LoginDeps = defaultDeps
): Promise<number> {
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (options.timeout !== undefined) {
    try {
      timeoutMs = parseTimeoutDuration(options.timeout);
    } catch (err) {
      output.error('mcp auth failed:', (err as Error).message);
      return 1;
    }
  }

  const namespace = deps.resolveNs(options.namespace);
  const body: AuthStartBody = {};
  if (options.force) body.force = true;
  if (options.scope) {
    body.scope = options.scope.split(/[\s,]+/).filter((s) => s.length > 0);
  }

  const proxy = await deps.startProxy();
  try {
    const client = deps.buildClient(proxy.baseUrl);

    let startResponse;
    try {
      startResponse = await client.start(serverName, namespace, body);
    } catch (err) {
      if (err instanceof AuthHttpError) {
        output.error('mcp auth failed:', err.body || `HTTP ${err.status}`);
      } else {
        output.error('mcp auth failed:', (err as Error).message);
      }
      return 1;
    }

    warnIfCallbackUnreachable(startResponse.authorization_url, proxy.baseUrl);

    console.log(`Authorization URL: ${startResponse.authorization_url}`);
    if (options.open !== false) {
      try {
        await deps.openBrowser(startResponse.authorization_url);
      } catch {
        // ignore — URL is already printed
      }
    }

    const deadline = deps.now() + timeoutMs;
    while (deps.now() < deadline) {
      let status;
      try {
        status = await client.status(
          serverName,
          namespace,
          startResponse.auth_id
        );
      } catch (err) {
        if (err instanceof AuthHttpError) {
          output.error('mcp auth failed:', err.body || `HTTP ${err.status}`);
        } else {
          output.error('mcp auth failed:', (err as Error).message);
        }
        return 1;
      }

      if (status.state === 'authorized') {
        if (status.expires_at) {
          output.success(`authorized (token expires at ${status.expires_at})`);
        } else {
          output.success('authorized');
        }
        return 0;
      }
      if (status.state === 'failed' || status.state === 'expired') {
        const reason = status.message || status.state;
        output.error('mcp auth failed:', reason);
        return 1;
      }

      await deps.sleep(POLL_INTERVAL_MS);
    }

    output.error('mcp auth failed:', 'timed out waiting for authorization');
    return 1;
  } finally {
    proxy.stop();
  }
}
