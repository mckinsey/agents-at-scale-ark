import {Command} from 'commander';
import chalk from 'chalk';
import type {ArkConfig} from '../../lib/config.js';
import {executeQuery, parseTarget} from '../../lib/executeQuery.js';
import {ExitCodes} from '../../lib/errors.js';

export function createQueryCommand(_: ArkConfig): Command {
  const queryCommand = new Command('query');

  queryCommand
    .description('Execute a single query against a model or agent')
    .argument('<target>', 'Query target (e.g., model/default, agent/my-agent)')
    .argument('<message>', 'Message to send')
    .action(async (target: string, message: string) => {
      const parsed = parseTarget(target);
      if (!parsed) {
        console.error(
          chalk.red('Invalid target format. Use: model/name or agent/name etc')
        );
        process.exit(ExitCodes.CliError);
      }

      await executeQuery({
        targetType: parsed.type,
        targetName: parsed.name,
        message,
      });
    });

  return queryCommand;
}
