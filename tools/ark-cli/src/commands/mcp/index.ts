import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';
import {runAuth, runLogout} from './auth.js';
import {parseGoDuration} from './duration.js';

function parsePositiveInt(value: string, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${field} must be a non-negative integer, got ${value}`);
  }
  return n;
}

export function createMcpCommand(_config: ArkConfig): Command {
  const mcp = new Command('mcp');
  mcp.description('Interact with MCPServer resources');

  const auth = new Command('auth');
  auth.description('Manage OAuth credentials for MCPServer resources');

  auth
    .command('login')
    .description(
      'Drive the OAuth 2.1 (DCR + PKCE) flow for an MCPServer and write the ' +
        'resulting tokens to its referenced Secret'
    )
    .argument('<server-name>', 'Name of the MCPServer resource')
    .option('-n, --namespace <namespace>', 'Kubernetes namespace')
    .option(
      '--force',
      'Run the flow even when status.authorization.state is not Required'
    )
    .option(
      '--port <port>',
      'Fixed loopback port for the OAuth redirect (default: pick a free port)',
      (v) => parsePositiveInt(v, '--port')
    )
    .option('--no-open', "Don't auto-open the browser; just print the URL")
    .option(
      '--timeout <duration>',
      'Max wait for the callback as a Go-duration string (e.g. 60s, 5m)',
      parseGoDuration
    )
    .action(async (serverName: string, opts) => {
      try {
        await runAuth(serverName, {
          namespace: opts.namespace,
          force: opts.force,
          port: opts.port,
          open: opts.open,
          timeout: opts.timeout,
        });
      } catch (e) {
        output.error(
          'mcp auth login failed:',
          e instanceof Error ? e.message : String(e)
        );
        process.exit(1);
      }
    });

  auth
    .command('logout')
    .description(
      'Clear OAuth tokens from the Secret referenced by an MCPServer'
    )
    .argument('<server-name>', 'Name of the MCPServer resource')
    .option('-n, --namespace <namespace>', 'Kubernetes namespace')
    .option(
      '--keep-client',
      'Clear access/refresh/expires tokens only; preserve client_id and client_secret'
    )
    .option(
      '--delete-secret',
      'Delete the Secret entirely instead of patching empty values'
    )
    .action(async (serverName: string, opts) => {
      try {
        await runLogout(serverName, {
          namespace: opts.namespace,
          keepClient: opts.keepClient,
          deleteSecret: opts.deleteSecret,
        });
      } catch (e) {
        output.error(
          'mcp auth logout failed:',
          e instanceof Error ? e.message : String(e)
        );
        process.exit(1);
      }
    });

  mcp.addCommand(auth);
  return mcp;
}
