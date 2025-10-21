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

export interface QueryOptions {
  targetType: string; // 'model', 'agent', 'team'
  targetName: string; // 'default', 'weather-agent', etc.
  message: string;
  timeout?: string; // Query execution timeout (e.g., "30s", "5m", default "5m")
  watchTimeout?: string; // CLI watch timeout (e.g., "6m", default timeout + 1 minute)
  verbose?: boolean;
}

/**
 * Execute a query against any ARK target (model, agent, team)
 * This is the shared implementation used by all query commands
 */
export async function executeQuery(options: QueryOptions): Promise<void> {
  const spinner = ora('Creating query...').start();

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
    spinner.text = 'Submitting query...';
    await execa('kubectl', ['apply', '-f', '-'], {
      input: JSON.stringify(queryManifest),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Watch for query completion
    spinner.text = 'Query status: initializing';

    let queryComplete = false;
    let attempts = 0;
    const maxAttempts = Math.floor(watchTimeoutMs / 1000);

    while (!queryComplete && attempts < maxAttempts) {
      attempts++;

      try {
        const {stdout} = await execa(
          'kubectl',
          ['get', 'query', queryName, '-o', 'json'],
          {stdio: 'pipe'}
        );

        const query = JSON.parse(stdout) as Query;
        const phase = query.status?.phase;

        // Update spinner with current phase
        if (phase) {
          spinner.text = `Query status: ${phase}`;
        }

        // Check if query is complete based on phase
        if (phase === 'done') {
          queryComplete = true;
          spinner.stop();

          // Extract and display the response from responses array
          if (query.status?.responses && query.status.responses.length > 0) {
            const response = query.status.responses[0];
            console.log(response.content || response);
          } else {
            output.warning('No response received');
          }
        } else if (phase === 'error') {
          queryComplete = true;
          spinner.stop();

          const response = query.status?.responses?.[0];
          console.error(
            chalk.red(response?.content || 'Query failed with unknown error')
          );
          process.exit(ExitCodes.OperationError);
        } else if (phase === 'canceled') {
          queryComplete = true;
          spinner.warn('Query canceled');

          if (query.status?.message) {
            output.warning(query.status.message);
          }
          process.exit(ExitCodes.OperationError);
        }
      } catch {
        // Query might not exist yet, continue waiting
        spinner.text = 'Query status: waiting for query to be created';
      }

      if (!queryComplete) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
      }
    }

    if (!queryComplete) {
      spinner.stop();
      console.error(
        chalk.red(
          `Query did not complete within ${options.watchTimeout ?? `${Math.floor(watchTimeoutMs / 1000)}s`}`
        )
      );
      process.exit(ExitCodes.Timeout);
    }
  } catch (error) {
    spinner.stop();
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
