import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';
import {
  executeDirectEvaluation,
  executeQueryEvaluation,
} from '../../lib/executeEvaluation.js';

export function createEvaluationCommand(_: ArkConfig): Command {
  const evaluationCommand = new Command('evaluation');

  evaluationCommand.description('Execute evaluations against evaluators');

  const directCommand = new Command('direct')
    .description('Execute a direct evaluation with input and output')
    .argument('<evaluator-name>', 'Name of the evaluator to use')
    .requiredOption('--input <input>', 'Input text for evaluation')
    .requiredOption('--output <output>', 'Output text for evaluation')
    .option('--timeout <timeout>', 'Evaluation timeout (e.g., "30s", "5m")')
    .option('--watch-timeout <timeout>', 'CLI watch timeout')
    .action(
      async (
        evaluatorName: string,
        options: {
          input: string;
          output: string;
          timeout?: string;
          watchTimeout?: string;
        }
      ) => {
        await executeDirectEvaluation({
          evaluatorName,
          input: options.input,
          output: options.output,
          timeout: options.timeout,
          watchTimeout: options.watchTimeout,
        });
      }
    );

  const queryCommand = new Command('query')
    .description('Execute a query-based evaluation')
    .argument('<evaluator-name>', 'Name of the evaluator to use')
    .requiredOption('--query <query-name>', 'Name of the query to evaluate')
    .option(
      '--response-target <target>',
      'Response target (e.g., agent:my-agent)'
    )
    .option('--timeout <timeout>', 'Evaluation timeout (e.g., "30s", "5m")')
    .option('--watch-timeout <timeout>', 'CLI watch timeout')
    .action(
      async (
        evaluatorName: string,
        options: {
          query: string;
          responseTarget?: string;
          timeout?: string;
          watchTimeout?: string;
        }
      ) => {
        await executeQueryEvaluation({
          evaluatorName,
          queryName: options.query,
          responseTarget: options.responseTarget,
          timeout: options.timeout,
          watchTimeout: options.watchTimeout,
        });
      }
    );

  evaluationCommand.addCommand(directCommand);
  evaluationCommand.addCommand(queryCommand);

  return evaluationCommand;
}
