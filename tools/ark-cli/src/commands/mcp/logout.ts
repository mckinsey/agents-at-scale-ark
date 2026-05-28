import output from '../../lib/output.js';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';
import {loadConfig} from '../../lib/config.js';
import {resolveNamespace} from './namespace.js';
import {AuthHttpError, McpAuthClient, AuthLogoutBody} from './authClient.js';

export interface LogoutOptions {
  namespace?: string;
  keepClient?: boolean;
  deleteSecret?: boolean;
}

export interface LogoutDeps {
  buildClient: (baseUrl: string) => McpAuthClient;
  resolveNs: (explicit?: string) => string;
  startProxy: () => Promise<{baseUrl: string; stop: () => void}>;
}

export const defaultLogoutDeps: LogoutDeps = {
  buildClient: (baseUrl: string) => new McpAuthClient(baseUrl),
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
};

export async function runLogout(
  serverName: string,
  options: LogoutOptions,
  deps: LogoutDeps = defaultLogoutDeps
): Promise<number> {
  if (options.keepClient && options.deleteSecret) {
    output.error(
      'mcp auth failed:',
      '--keep-client and --delete-secret are mutually exclusive'
    );
    return 1;
  }

  const namespace = deps.resolveNs(options.namespace);
  const body: AuthLogoutBody = {};
  if (options.keepClient) body.keep_client = true;
  if (options.deleteSecret) body.delete_secret = true;

  const proxy = await deps.startProxy();
  try {
    const client = deps.buildClient(proxy.baseUrl);
    let response;
    try {
      response = await client.logout(serverName, namespace, body);
    } catch (err) {
      if (err instanceof AuthHttpError) {
        if (err.status === 404) {
          output.error('mcp auth failed:', 'MCPServer not found');
        } else {
          output.error('mcp auth failed:', err.body || `HTTP ${err.status}`);
        }
        return 1;
      }
      output.error('mcp auth failed:', (err as Error).message);
      return 1;
    }

    if (response.noop) {
      output.success('logout: nothing to clear');
    } else if (response.deleted) {
      output.success('logout: secret deleted');
    } else {
      const keys = response.cleared_keys ?? [];
      output.success(`logout: cleared ${keys.length} key(s)`);
    }
    return 0;
  } finally {
    proxy.stop();
  }
}
