import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';
import {loadConfig} from '../../lib/config.js';
import output from '../../lib/output.js';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';

export async function listSessions(options: {output?: string}) {
  try {
    const config = loadConfig();
    const proxy = new ArkApiProxy(
      undefined,
      config.services?.reusePortForwards ?? false
    );
    const arkApiClient = await proxy.start();

    const sessions = await arkApiClient.getSessions();

    if (options.output === 'json') {
      output.info(JSON.stringify(sessions, null, 2));
      return;
    }

    if (sessions.length === 0) {
      output.info('No sessions found');
      return;
    }

    output.info('Sessions:');
    sessions.forEach((session: any) => {
      output.info(`  ${session.sessionId} (memory: ${session.memoryName})`);
    });

    proxy.stop();
  } catch (error) {
    output.error('Failed to list sessions:', error);
    process.exit(1);
  }
}

export async function deleteSession(
  sessionId: string,
  options: {output?: string}
) {
  try {
    const config = loadConfig();
    const proxy = new ArkApiProxy(
      undefined,
      config.services?.reusePortForwards ?? false
    );
    const arkApiClient = await proxy.start();

    const response = await arkApiClient.deleteSession(sessionId);

    if (options.output === 'json') {
      output.info(JSON.stringify(response, null, 2));
      return;
    }

    output.success(`Session ${sessionId} deleted successfully`);

    proxy.stop();
  } catch (error) {
    output.error(`Failed to delete session ${sessionId}:`, error);
    process.exit(1);
  }
}

export async function deleteQuery(
  sessionId: string,
  queryId: string,
  options: {output?: string}
) {
  try {
    const config = loadConfig();
    const proxy = new ArkApiProxy(
      undefined,
      config.services?.reusePortForwards ?? false
    );
    const arkApiClient = await proxy.start();

    const response = await arkApiClient.deleteQueryMessages(sessionId, queryId);

    if (options.output === 'json') {
      output.info(JSON.stringify(response, null, 2));
      return;
    }

    output.success(
      `Query ${queryId} messages deleted successfully from session ${sessionId}`
    );

    proxy.stop();
  } catch (error) {
    output.error(`Failed to delete query ${queryId} messages:`, error);
    process.exit(1);
  }
}

export async function deleteAll(options: {output?: string}) {
  try {
    const config = loadConfig();
    const proxy = new ArkApiProxy(
      undefined,
      config.services?.reusePortForwards ?? false
    );
    const arkApiClient = await proxy.start();

    const response = await arkApiClient.deleteAllSessions();

    if (options.output === 'json') {
      output.info(JSON.stringify(response, null, 2));
      return;
    }

    output.success('All sessions deleted successfully');

    proxy.stop();
  } catch (error) {
    output.error('Failed to delete all sessions:', error);
    process.exit(1);
  }
}

export function createMemoryCommand(_: ArkConfig): Command {
  const memoryCommand = new Command('memory');

  memoryCommand.description('Manage memory sessions and queries').alias('mem');

  // List sessions command
  memoryCommand
    .command('list')
    .alias('ls')
    .description('List all sessions')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .action(async (options) => {
      await listSessions(options);
    });

  // Delete command with subcommands (alias: reset for backward compatibility)
  const deleteCommand = memoryCommand
    .command('delete')
    .alias('reset')
    .description('Delete memory data')
    .option('--all', 'Delete all sessions and their messages');

  // Delete specific session
  deleteCommand
    .command('session')
    .description('Delete a specific session')
    .argument('<sessionId>', 'Session ID to delete')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .action(async (sessionId: string, options) => {
      await deleteSession(sessionId, options);
    });

  // Delete specific query
  deleteCommand
    .command('query')
    .description('Delete messages for a specific query')
    .argument('<sessionId>', 'Session ID')
    .argument('<queryId>', 'Query ID to delete messages for')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .action(async (sessionId: string, queryId: string, options) => {
      await deleteQuery(sessionId, queryId, options);
    });

  // Handle --all on delete root
  deleteCommand.action(async (options) => {
    if (options.all) {
      await deleteAll(options);
      return;
    }
    // If no subcommand and no --all, show help
    deleteCommand.help();
  });

  // Default action - list sessions
  memoryCommand.action(async (options) => {
    await listSessions(options);
  });

  return memoryCommand;
}
