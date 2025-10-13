/**
 * Shared query execution logic for both universal and resource-specific query commands
 */

import {execa} from 'execa';
import ora from 'ora';
import output from './output.js';
import type {Query, QueryTarget, K8sCondition} from './types.js';

export interface QueryOptions {
  targetType: string; // 'model', 'agent', 'team'
  targetName: string; // 'default', 'weather-agent', etc.
  message: string;
  verbose?: boolean;
}

/**
 * Execute a query against any ARK target (model, agent, team)
 * This is the shared implementation used by all query commands
 */
export async function executeQuery(options: QueryOptions): Promise<void> {
  const spinner = ora('Creating query...').start();

  // Generate a unique query name
  const timestamp = Date.now();
  const queryName = `cli-query-${timestamp}`;

  // Create the Query resource
  const queryManifest: Partial<Query> = {
    apiVersion: 'ark.mckinsey.com/v1alpha1',
    kind: 'Query',
    metadata: {
      name: queryName,
    },
    spec: {
      input: options.message,
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
    const maxAttempts = 300; // 5 minutes with 1 second intervals

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
          spinner.succeed('Query completed');

          // Extract and display the response from responses array
          if (query.status?.responses && query.status.responses.length > 0) {
            const response = query.status.responses[0];
            console.log('\n' + (response.content || response));
          } else {
            output.warning('No response received');
          }
        } else if (phase === 'error') {
          queryComplete = true;
          spinner.fail('Query failed');

          // Try to get error message from conditions or status
          const errorCondition = query.status?.conditions?.find(
            (c: K8sCondition) => {
              return c.type === 'Complete' && c.status === 'False';
            }
          );
          if (errorCondition?.message) {
            output.error(errorCondition.message);
          } else if (query.status?.error) {
            output.error(query.status.error);
          } else {
            output.error('Query failed with unknown error');
          }
        } else if (phase === 'canceled') {
          queryComplete = true;
          spinner.warn('Query canceled');

          // Try to get cancellation reason if available
          if (query.status?.message) {
            output.warning(query.status.message);
          }
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
      spinner.fail('Query timed out');
      output.error('Query did not complete within 5 minutes');
    }
  } catch (error) {
    spinner.fail('Query failed');
    output.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  } finally {
    // Clean up the query resource
    try {
      await execa('kubectl', ['delete', 'query', queryName], {stdio: 'pipe'});
    } catch {
      // Ignore cleanup errors
    }
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
