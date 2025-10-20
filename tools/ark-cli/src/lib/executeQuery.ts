/**
 * Shared query execution logic for both universal and resource-specific query commands
 */

import {execa} from 'execa';
import ora from 'ora';
import output from './output.js';
import type {Query, QueryTarget, K8sCondition} from './types.js';
import {ExitCodes} from './errors.js';
import {parseDuration} from './duration.js';

export interface QueryOptions {
  targetType: string; // 'model', 'agent', 'team'
  targetName: string; // 'default', 'weather-agent', etc.
  message: string;
  timeoutSeconds?: number;
  verbose?: boolean;
  cleanup?: boolean;
}

const DEFAULT_QUERY_OPTIONS = {
  timeoutSeconds: 300,
  cleanup: true,
}

/**
 * Execute a query against any ARK target (model, agent, team)
 * This is the shared implementation used by all query commands
 */
export async function executeQuery(overrides: QueryOptions): Promise<void> {
  const options = { ...DEFAULT_QUERY_OPTIONS, ...overrides };

  const spinner = ora('Creating query...').start();

  // Generate a unique query name with timestamp and random suffix
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const queryName = `cli-query-${timestamp}-${randomSuffix}`;

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

  // Apply the query
  try {
    spinner.text = 'Submitting query...';
    await execa('kubectl', ['apply', '-f', '-'], {
      input: JSON.stringify(queryManifest),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (_) {
    spinner.fail('Query failed to apply');
    output.error('Query failed to apply');
    if (options.cleanup) {
      await cleanupQuery(queryName);
    }
    process.exit(ExitCodes.CliError);
  }

  spinner.text = 'Submitted query. Waiting for it to complete...';

  let exitCode = ExitCodes.Success;
  try {
    // Wait for query completion
    const query = await waitForQueryCompletion(queryName, options.timeoutSeconds);
    if (!query) {
      spinner.fail('Query timed out');
      output.error(`Query did not complete within ${options.timeoutSeconds} seconds`);
      exitCode = ExitCodes.Timeout;
    } else {
      const phase = query.status?.phase;

      if (phase === 'done') {
        spinner.succeed('Query completed');
        if (query.status?.responses && query.status.responses.length > 0) {
          const response = query.status.responses[0];
          console.log('\n' + (response.content || response));
        } else {
          output.warning('No response received');
        }
      } else if (phase === 'error') {
        exitCode = ExitCodes.OperationError;
        spinner.fail('Query failed');
  
        // Try to get error message from conditions or status
        const completedCondition = query.status?.conditions?.find(c => c.type === 'Completed');
        output.error(completedCondition?.message || 'Query failed with unknown error');
      } else if (phase === 'canceled') {
        exitCode = ExitCodes.OperationError;
        spinner.warn('Query canceled');
        output.warning('Query was canceled');
      } else {
        exitCode = ExitCodes.OperationError;
        spinner.warn('Query completed but with unknown status');
        output.warning('Query completed but with unknown status');
      }
    }
  } finally {
    if (options.cleanup) {
      await cleanupQuery(queryName);
    }
    process.exit(exitCode);
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

async function waitForQueryCompletion(queryName: string, timeoutSeconds: number): Promise<Query | null> {
  // Wait for the query to be completed within the timeout
  try {
      await execa('kubectl', ['wait', '--for=condition=Completed=True', 'query', queryName, `--timeout=${timeoutSeconds}s`], {stdio: 'pipe'});
  } catch (_) {
      // Error is expected if the query is not completed within the timeout
      return null;
  }
  const { stdout } = await execa('kubectl', ['get', 'query', queryName, '-o', 'json'], {stdio: 'pipe'});
  return JSON.parse(stdout) as Query;
}

async function cleanupQuery(queryName: string): Promise<void> {
  output.info(`Cleaning up query ${queryName}...`);
  try {
    // Force delete the query
    await execa('kubectl', ['delete', 'query', queryName, '--force'], {stdio: 'pipe'});
    output.info(`Cleaned up query ${queryName}`);
  } catch {
    output.error(`Failed to cleanup query ${queryName}`);
  }
}