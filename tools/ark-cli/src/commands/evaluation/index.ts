import {Command} from 'commander';
import chalk from 'chalk';
import type {ArkConfig} from '../../lib/config.js';
import {
  executeDirectEvaluation,
  executeQueryEvaluation,
} from '../../lib/executeEvaluation.js';
import {readStdin} from '../../lib/stdin.js';

export function createEvaluationCommand(_: ArkConfig): Command {
  const evaluationCommand = new Command('evaluation');

  evaluationCommand
    .description('Execute evaluations against evaluators')
    .argument('<evaluator-name>', 'Name of the evaluator to use')
    .argument(
      '[query-name]',
      'Name of the query to evaluate (for query-based evaluation)'
    )
    .option('--input <input>', 'Input text for direct evaluation')
    .option('--output <output>', 'Output text for direct evaluation')
    .option(
      '--response-target <target>',
      'Response target for query evaluation (e.g., agent:my-agent)'
    )
    .option('--timeout <timeout>', 'Evaluation timeout (e.g., "30s", "5m")')
    .option('--watch-timeout <timeout>', 'CLI watch timeout')
    .action(
      async (
        evaluatorName: string,
        queryName: string | undefined,
        options: {
          input?: string;
          output?: string;
          responseTarget?: string;
          timeout?: string;
          watchTimeout?: string;
        }
      ) => {
        if (options.input && options.output) {
          await executeDirectEvaluation({
            evaluatorName,
            input: options.input,
            output: options.output,
            timeout: options.timeout,
            watchTimeout: options.watchTimeout,
          });
        } else if (queryName) {
          await executeQueryEvaluation({
            evaluatorName,
            queryName,
            responseTarget: options.responseTarget,
            timeout: options.timeout,
            watchTimeout: options.watchTimeout,
          });
        } else {
          const stdinQueryName = await readStdin();

          if (stdinQueryName) {
            await executeQueryEvaluation({
              evaluatorName,
              queryName: stdinQueryName,
              responseTarget: options.responseTarget,
              timeout: options.timeout,
              watchTimeout: options.watchTimeout,
            });
          } else {
            console.error(chalk.red('Error: Must provide either:'));
            console.error('  - --input and --output for direct evaluation');
            console.error('  - <query-name> for query-based evaluation');
            console.error('  - Pipe query name from stdin');
            console.error('\nExamples:');
            console.error(
              '  ark evaluation my-evaluator --input "test" --output "result"'
            );
            console.error('  ark evaluation my-evaluator my-query');
            console.error('  echo "my-query" | ark evaluation my-evaluator');
            process.exit(1);
          }
        }
      }
    );

  return evaluationCommand;
}
