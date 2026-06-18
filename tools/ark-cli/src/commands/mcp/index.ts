import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';
import {runLogin} from './login.js';
import {runLogout} from './logout.js';

export function createMcpCommand(_config: ArkConfig): Command {
  const mcp = new Command('mcp');
  mcp.description('manage MCP servers');

  const auth = new Command('auth');
  auth.description('manage MCP server authorization');

  auth
    .command('login <server-name>')
    .description('start an OAuth flow for an MCPServer via ark-api')
    .option('-n, --namespace <namespace>', 'namespace of the MCPServer')
    .option(
      '--force',
      'bypass the Authorized preflight and force fresh client registration'
    )
    .option('--no-open', 'do not open a browser; print the URL only')
    .option(
      '--timeout <duration>',
      'how long to wait for authorization to complete (e.g. 60s, 5m, 1h)'
    )
    .option(
      '--scope <scope>',
      'space- or comma-separated list of OAuth scopes to request'
    )
    .action(async (serverName: string, options) => {
      const exitCode = await runLogin(serverName, {
        namespace: options.namespace,
        force: options.force,
        open: options.open,
        timeout: options.timeout,
        scope: options.scope,
      });
      process.exit(exitCode);
    });

  auth
    .command('logout <server-name>')
    .description('clear OAuth state for an MCPServer via ark-api')
    .option('-n, --namespace <namespace>', 'namespace of the MCPServer')
    .option(
      '--keep-client',
      'preserve cached client_id/client_secret in the Secret'
    )
    .option('--delete-secret', 'delete the entire token Secret')
    .action(async (serverName: string, options) => {
      const exitCode = await runLogout(serverName, {
        namespace: options.namespace,
        keepClient: options.keepClient,
        deleteSecret: options.deleteSecret,
      });
      process.exit(exitCode);
    });

  mcp.addCommand(auth);
  return mcp;
}
