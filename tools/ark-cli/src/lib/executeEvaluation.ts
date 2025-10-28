import {execa} from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import output from './output.js';
import {ExitCodes} from './errors.js';
import {parseDuration} from './duration.js';

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

interface EvaluationManifest {
  apiVersion: string;
  kind: 'Evaluation';
  metadata: {
    name: string;
  };
  spec: {
    type: 'direct' | 'query';
    evaluator: {
      name: string;
    };
    config: {
      input?: string;
      output?: string;
      queryRef?: {
        name: string;
      };
      responseTarget?: {
        type: string;
        name: string;
      };
    };
    timeout?: string;
    ttl?: string;
  };
}

interface EvaluationStatus {
  phase?: 'pending' | 'running' | 'completed' | 'failed';
  result?: {
    score?: number;
    passed?: boolean;
    details?: string;
  };
  message?: string;
  error?: string;
}

interface Evaluation {
  metadata: {
    name: string;
  };
  status?: EvaluationStatus;
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

    spinner.text = 'Waiting for evaluation completion...';

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
      if (
        error instanceof Error &&
        error.message.includes('timed out waiting')
      ) {
        console.error(
          chalk.red(
            `Evaluation did not complete within ${options.watchTimeout ?? `${Math.floor(watchTimeoutMs / 1000)}s`}`
          )
        );
        process.exit(ExitCodes.Timeout);
      }
    }

    spinner.stop();

    try {
      const {stdout} = await execa(
        'kubectl',
        ['get', 'evaluation', evaluationName, '-o', 'json'],
        {stdio: 'pipe'}
      );

      const evaluation = JSON.parse(stdout) as Evaluation;
      const phase = evaluation.status?.phase;
      const result = evaluation.status?.result;

      if (phase === 'completed') {
        if (result) {
          console.log(chalk.green('\nEvaluation completed successfully:'));
          if (result.score !== undefined) {
            console.log(`Score: ${result.score}`);
          }
          if (result.passed !== undefined) {
            console.log(
              `Result: ${result.passed ? chalk.green('PASSED') : chalk.red('FAILED')}`
            );
          }
          if (result.details) {
            console.log(`Details: ${result.details}`);
          }
        } else {
          output.warning('Evaluation completed but no result received');
        }
      } else if (phase === 'failed') {
        console.error(
          chalk.red(
            evaluation.status?.error ||
              'Evaluation failed with unknown error'
          )
        );
        process.exit(ExitCodes.OperationError);
      }
    } catch (error) {
      console.error(
        chalk.red(
          error instanceof Error
            ? error.message
            : 'Failed to fetch evaluation result'
        )
      );
      process.exit(ExitCodes.CliError);
    }
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

    spinner.text = 'Waiting for evaluation completion...';

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
      if (
        error instanceof Error &&
        error.message.includes('timed out waiting')
      ) {
        console.error(
          chalk.red(
            `Evaluation did not complete within ${options.watchTimeout ?? `${Math.floor(watchTimeoutMs / 1000)}s`}`
          )
        );
        process.exit(ExitCodes.Timeout);
      }
    }

    spinner.stop();

    try {
      const {stdout} = await execa(
        'kubectl',
        ['get', 'evaluation', evaluationName, '-o', 'json'],
        {stdio: 'pipe'}
      );

      const evaluation = JSON.parse(stdout) as Evaluation;
      const phase = evaluation.status?.phase;
      const result = evaluation.status?.result;

      if (phase === 'completed') {
        if (result) {
          console.log(chalk.green('\nEvaluation completed successfully:'));
          if (result.score !== undefined) {
            console.log(`Score: ${result.score}`);
          }
          if (result.passed !== undefined) {
            console.log(
              `Result: ${result.passed ? chalk.green('PASSED') : chalk.red('FAILED')}`
            );
          }
          if (result.details) {
            console.log(`Details: ${result.details}`);
          }
        } else {
          output.warning('Evaluation completed but no result received');
        }
      } else if (phase === 'failed') {
        console.error(
          chalk.red(
            evaluation.status?.error ||
              'Evaluation failed with unknown error'
          )
        );
        process.exit(ExitCodes.OperationError);
      }
    } catch (error) {
      console.error(
        chalk.red(
          error instanceof Error
            ? error.message
            : 'Failed to fetch evaluation result'
        )
      );
      process.exit(ExitCodes.CliError);
    }
  } catch (error) {
    spinner.stop();
    console.error(
      chalk.red(error instanceof Error ? error.message : 'Unknown error')
    );
    process.exit(ExitCodes.CliError);
  }
}
