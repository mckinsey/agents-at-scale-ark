import {execa} from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import output from './output.js';
import {ExitCodes} from './errors.js';
import {parseDuration} from './duration.js';
import type {Evaluation, EvaluationManifest} from './types.js';

export interface DirectEvaluationOptions {
  evaluatorName: string;
  input: string;
  output: string;
  timeout?: string;
  watchTimeout?: string;
}

export interface QueryEvaluationOptions {
  evaluatorName: string;
  queryName: string;
  responseTarget?: string;
  timeout?: string;
  watchTimeout?: string;
}

async function waitForEvaluationAndDisplayResults(
  evaluationName: string,
  watchTimeoutMs: number,
  watchTimeoutDisplay: string
): Promise<void> {
  const spinner = ora('Waiting for evaluation completion...').start();

  try {
    await execa(
      'kubectl',
      [
        'wait',
        '--for=condition=Completed',
        `evaluation/${evaluationName}`,
        `--timeout=${Math.floor(watchTimeoutMs / 1000)}s`,
      ],
      {timeout: watchTimeoutMs}
    );
  } catch (error) {
    spinner.stop();
    if (error instanceof Error && error.message.includes('timed out waiting')) {
      console.error(
        chalk.red(`Evaluation did not complete within ${watchTimeoutDisplay}`)
      );
      process.exit(ExitCodes.Timeout);
    }
    throw error;
  }

  spinner.stop();

  const {stdout} = await execa(
    'kubectl',
    ['get', 'evaluation', evaluationName, '-o', 'json'],
    {stdio: 'pipe'}
  );

  const evaluation = JSON.parse(stdout) as Evaluation;
  const status = evaluation.status;

  if (status?.phase === 'done') {
    console.log(chalk.green('\nEvaluation completed successfully:'));
    if (status.score !== undefined) {
      console.log(`Score: ${status.score}`);
    }
    if (status.passed !== undefined) {
      console.log(
        `Result: ${status.passed ? chalk.green('PASSED') : chalk.red('FAILED')}`
      );
    }
    if (status.message) {
      console.log(`Message: ${status.message}`);
    }
  } else if (status?.phase === 'error') {
    console.error(
      chalk.red(status.message || 'Evaluation failed with unknown error')
    );
    process.exit(ExitCodes.OperationError);
  } else {
    output.warning(`Unexpected evaluation phase: ${status?.phase}`);
  }
}

export async function executeDirectEvaluation(
  options: DirectEvaluationOptions
): Promise<void> {
  const spinner = ora('Creating evaluation...').start();

  const queryTimeoutMs = options.timeout
    ? parseDuration(options.timeout)
    : parseDuration('5m');
  const watchTimeoutMs = options.watchTimeout
    ? parseDuration(options.watchTimeout)
    : queryTimeoutMs + 60000;

  const timestamp = Date.now();
  const evaluationName = `cli-eval-${timestamp}`;

  const evaluationManifest: EvaluationManifest = {
    apiVersion: 'ark.mckinsey.com/v1alpha1',
    kind: 'Evaluation',
    metadata: {
      name: evaluationName,
    },
    spec: {
      type: 'direct',
      evaluator: {
        name: options.evaluatorName,
      },
      config: {
        input: options.input,
        output: options.output,
      },
      ...(options.timeout && {timeout: options.timeout}),
      ttl: '1h',
    },
  };

  try {
    spinner.text = 'Submitting evaluation...';
    await execa('kubectl', ['apply', '-f', '-'], {
      input: JSON.stringify(evaluationManifest),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    spinner.stop();

    const watchTimeoutDisplay =
      options.watchTimeout ?? `${Math.floor(watchTimeoutMs / 1000)}s`;

    await waitForEvaluationAndDisplayResults(
      evaluationName,
      watchTimeoutMs,
      watchTimeoutDisplay
    );
  } catch (error) {
    spinner.stop();
    console.error(
      chalk.red(error instanceof Error ? error.message : 'Unknown error')
    );
    process.exit(ExitCodes.CliError);
  }
}

export async function executeQueryEvaluation(
  options: QueryEvaluationOptions
): Promise<void> {
  const spinner = ora('Creating evaluation...').start();

  const queryTimeoutMs = options.timeout
    ? parseDuration(options.timeout)
    : parseDuration('5m');
  const watchTimeoutMs = options.watchTimeout
    ? parseDuration(options.watchTimeout)
    : queryTimeoutMs + 60000;

  const timestamp = Date.now();
  const evaluationName = `cli-eval-${timestamp}`;

  let responseTarget: {type: string; name: string} | undefined;
  if (options.responseTarget) {
    const parts = options.responseTarget.split(':');
    if (parts.length === 2) {
      responseTarget = {
        type: parts[0],
        name: parts[1],
      };
    } else {
      spinner.stop();
      console.error(
        chalk.red(
          'Invalid response-target format. Use: type:name (e.g., agent:my-agent)'
        )
      );
      process.exit(ExitCodes.CliError);
    }
  }

  const evaluationManifest: EvaluationManifest = {
    apiVersion: 'ark.mckinsey.com/v1alpha1',
    kind: 'Evaluation',
    metadata: {
      name: evaluationName,
    },
    spec: {
      type: 'query',
      evaluator: {
        name: options.evaluatorName,
      },
      config: {
        queryRef: {
          name: options.queryName,
        },
        ...(responseTarget && {responseTarget}),
      },
      ...(options.timeout && {timeout: options.timeout}),
      ttl: '1h',
    },
  };

  try {
    spinner.text = 'Submitting evaluation...';
    await execa('kubectl', ['apply', '-f', '-'], {
      input: JSON.stringify(evaluationManifest),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    spinner.stop();

    const watchTimeoutDisplay =
      options.watchTimeout ?? `${Math.floor(watchTimeoutMs / 1000)}s`;

    await waitForEvaluationAndDisplayResults(
      evaluationName,
      watchTimeoutMs,
      watchTimeoutDisplay
    );
  } catch (error) {
    spinner.stop();
    console.error(
      chalk.red(error instanceof Error ? error.message : 'Unknown error')
    );
    process.exit(ExitCodes.CliError);
  }
}
