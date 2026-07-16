/**
 * Shared query execution logic for both universal and resource-specific query commands
 */

import {execa} from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import type {Query, QueryTarget} from './types.js';
import {ExitCodes} from './errors.js';
import {ArkApiProxy} from './arkApiProxy.js';
import {ChatClient, ToolCall, ArkMetadata} from './chatClient.js';
import {watchEventsLive} from './kubectl.js';
import {loadConfig} from './config.js';

export interface QueryOptions {
  targetType: string;
  targetName: string;
  message: string;
  timeout?: string;
  watchTimeout?: string;
  verbose?: boolean;
  outputFormat?: string;
  sessionId?: string;
  conversationId?: string;
}

interface StreamState {
  currentAgent?: string;
  toolCalls: Map<number, ToolCall>;
  content: string;
}

export async function executeQuery(options: QueryOptions): Promise<void> {
  if (options.outputFormat) {
    return executeQueryWithFormat(options);
  }

  let arkApiProxy: ArkApiProxy | undefined;
  const spinner = ora('Connecting to Ark API...').start();

  try {
    const config = loadConfig();
    arkApiProxy = new ArkApiProxy(
      undefined,
      config.services?.reusePortForwards ?? false
    );
    const arkApiClient = await arkApiProxy.start();
    const chatClient = new ChatClient(arkApiClient);

    spinner.text = 'Executing query...';

    const targetId = `${options.targetType}/${options.targetName}`;
    const messages = [{role: 'user' as const, content: options.message}];

    const state: StreamState = {
      toolCalls: new Map(),
      content: '',
    };

    let lastAgentName: string | undefined;
    let headerShown = false;
    let firstOutput = true;

    const sessionId = options.sessionId || process.env.ARK_SESSION_ID;
    const conversationId =
      options.conversationId || process.env.ARK_CONVERSATION_ID;

    await chatClient.sendMessage(
      targetId,
      messages,
      {
        streamingEnabled: true,
        sessionId,
        conversationId,
        queryTimeout: options.timeout,
      },
      (chunk: string, toolCalls?: ToolCall[], arkMetadata?: ArkMetadata) => {
        if (firstOutput) {
          spinner.stop();
          firstOutput = false;
        }

        const agentName = arkMetadata?.agent || arkMetadata?.team;

        if (agentName && agentName !== lastAgentName) {
          if (lastAgentName) {
            if (state.content) {
              process.stdout.write('\n');
            }
            process.stdout.write('\n');
          }

          const prefix = arkMetadata?.team ? '◆' : '●';
          const color = arkMetadata?.team ? 'green' : 'cyan';
          process.stdout.write(chalk[color](`${prefix} ${agentName}\n`));
          lastAgentName = agentName;
          state.content = '';
          state.toolCalls.clear();
          headerShown = true;
        }

        if (toolCalls && toolCalls.length > 0) {
          for (const toolCall of toolCalls) {
            if (!state.toolCalls.has(toolCall.id as any)) {
              state.toolCalls.set(toolCall.id as any, toolCall);
              if (state.content) {
                process.stdout.write('\n');
              }
              process.stdout.write(
                chalk.magenta(`🔧 ${toolCall.function.name}\n`)
              );
            }
          }
        }

        if (chunk) {
          if (state.toolCalls.size > 0 && !state.content) {
            process.stdout.write('\n');
          }
          process.stdout.write(chunk);
          state.content += chunk;
        }
      }
    );

    if (spinner.isSpinning) {
      spinner.stop();
    }

    if ((state.content || state.toolCalls.size > 0) && headerShown) {
      process.stdout.write('\n');
    }

    if (arkApiProxy) {
      arkApiProxy.stop();
    }
  } catch (error) {
    if (spinner.isSpinning) {
      spinner.stop();
    }
    if (arkApiProxy) {
      arkApiProxy.stop();
    }

    console.error(
      chalk.red(error instanceof Error ? error.message : 'Unknown error')
    );
    process.exit(ExitCodes.CliError);
  }
}

async function executeQueryWithFormat(options: QueryOptions): Promise<void> {
  const timestamp = Date.now();
  const queryName = `cli-query-${timestamp}`;

  const queryManifest: Partial<Query> = {
    apiVersion: 'ark.mckinsey.com/v1alpha1',
    kind: 'Query',
    metadata: {
      name: queryName,
    },
    spec: {
      input: options.message,
      ...(options.timeout && {timeout: options.timeout}),
      ...((options.sessionId || process.env.ARK_SESSION_ID) && {
        sessionId: options.sessionId || process.env.ARK_SESSION_ID,
      }),
      ...((options.conversationId || process.env.ARK_CONVERSATION_ID) && {
        conversationId:
          options.conversationId || process.env.ARK_CONVERSATION_ID,
      }),
      target: {
        type: options.targetType,
        name: options.targetName,
      },
    },
  };

  try {
    await execa('kubectl', ['apply', '-f', '-'], {
      input: JSON.stringify(queryManifest),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Give Kubernetes a moment to process the resource before watching
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (options.outputFormat === 'events') {
      await watchEventsLive(queryName);
      return;
    }

    const timeoutSeconds = 300;
    await execa(
      'kubectl',
      [
        'wait',
        '--for=condition=Completed',
        `query/${queryName}`,
        `--timeout=${timeoutSeconds}s`,
      ],
      {timeout: timeoutSeconds * 1000}
    );

    if (options.outputFormat === 'name') {
      console.log(queryName);
    } else if (
      options.outputFormat === 'json' ||
      options.outputFormat === 'yaml'
    ) {
      const {stdout} = await execa(
        'kubectl',
        ['get', 'query', queryName, '-o', options.outputFormat],
        {stdio: 'pipe'}
      );
      console.log(stdout);
    } else {
      console.error(
        chalk.red(
          `Invalid output format: ${options.outputFormat}. Use: yaml, json, name, or events`
        )
      );
      process.exit(ExitCodes.CliError);
    }
  } catch (error) {
    console.error(
      chalk.red(error instanceof Error ? error.message : 'Unknown error')
    );
    process.exit(ExitCodes.CliError);
  }
}

/**
 * Parse a target string like "model/default" or "agent/weather"
 * Returns QueryTarget or null if invalid
 */
export function parseTarget(target: string): QueryTarget | null {
  const parts = target.split('/');
  if (parts.length !== 2) {
    return null;
  }
  return {
    type: parts[0],
    name: parts[1],
  };
}
