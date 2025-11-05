/**
 * Shared query execution logic for both universal and resource-specific query commands
 */

import {execa} from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import output from './output.js';
import type {Query, QueryTarget} from './types.js';
import {ExitCodes} from './errors.js';
import {parseDuration} from './duration.js';
import {getResource} from './kubectl.js';

export interface QueryOptions {
  targetType: string; // 'model', 'agent', 'team'
  targetName: string; // 'default', 'weather-agent', etc.
  message: string;
  timeout?: string; // Query execution timeout (e.g., "30s", "5m", default "5m")
  watchTimeout?: string; // CLI watch timeout (e.g., "6m", default timeout + 1 minute)
  verbose?: boolean;
  outputFormat?: string; // Output format: 'yaml', 'json', or 'name'
}

/**
 * Execute a query against any ARK target (model, agent, team)
 * This is the shared implementation used by all query commands
 */
export async function executeQuery(options: QueryOptions): Promise<void> {
  const spinner = options.outputFormat
    ? null
    : ora('Creating query...').start();

  const queryTimeoutMs = options.timeout
    ? parseDuration(options.timeout)
    : parseDuration('5m');
  const watchTimeoutMs = options.watchTimeout
    ? parseDuration(options.watchTimeout)
    : queryTimeoutMs + 60000;

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
      targets: [
        {
          type: options.targetType,
          name: options.targetName,
        },
      ],
    },
  };

  try {
    // Apply the query
    if (spinner) spinner.text = 'Submitting query...';
    await execa('kubectl', ['apply', '-f', '-'], {
      input: JSON.stringify(queryManifest),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Watch for query completion using kubectl wait
    if (spinner) spinner.text = 'Waiting for query completion...';

    try {
      await execa(
        'kubectl',
        [
          'wait',
          '--for=condition=Completed',
          `query/${queryName}`,
          `--timeout=${Math.floor(watchTimeoutMs / 1000)}s`,
        ],
        {timeout: watchTimeoutMs}
      );
    } catch (error) {
      if (spinner) spinner.stop();
      // Check if it's a timeout or other error
      if (
        error instanceof Error &&
        error.message.includes('timed out waiting')
      ) {
        console.error(
          chalk.red(
            `Query did not complete within ${options.watchTimeout ?? `${Math.floor(watchTimeoutMs / 1000)}s`}`
          )
        );
        process.exit(ExitCodes.Timeout);
      }
      // For other errors, fetch the query to check status
    }

    if (spinner) spinner.stop();

    // If output format is specified, output the resource and return
    if (options.outputFormat) {
      try {
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
              `Invalid output format: ${options.outputFormat}. Use: yaml, json, or name`
            )
          );
          process.exit(ExitCodes.CliError);
        }
        return;
      } catch (error) {
        console.error(
          chalk.red(
            error instanceof Error
              ? error.message
              : 'Failed to fetch query resource'
          )
        );
        process.exit(ExitCodes.CliError);
      }
    }

    // Fetch final query state
    try {
      const query = await getResource<Query>('queries', queryName);
      const phase = query.status?.phase;

      // Check if query completed successfully or with error
      if (phase === 'done') {
        // Extract and display the response from responses array
        if (query.status?.responses && query.status.responses.length > 0) {
          const response = query.status.responses[0];
          console.log(response.content || response);
        } else {
          output.warning('No response received');
        }
      } else if (phase === 'error') {
        const response = query.status?.responses?.[0];
        console.error(
          chalk.red(response?.content || 'Query failed with unknown error')
        );
        process.exit(ExitCodes.OperationError);
      } else if (phase === 'canceled') {
        if (spinner) {
          spinner.warn('Query canceled');
        } else {
          output.warning('Query canceled');
        }
        if (query.status?.message) {
          output.warning(query.status.message);
        }
        process.exit(ExitCodes.OperationError);
      }
    } catch (error) {
      console.error(
        chalk.red(
          error instanceof Error
            ? error.message
            : 'Failed to fetch query result'
        )
      );
      process.exit(ExitCodes.CliError);
    }
  } catch (error) {
    if (spinner) spinner.stop();
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
