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
    .option(
      '-o, --output <format>',
      'Output format: yaml, json, name or events (shows structured event data)'
    )
    .option(
      '--session-id <sessionId>',
      'Session ID to associate with the query for conversation continuity'
    )
    .action(
      async (
        target: string,
        message: string,
        options: {
          output?: string;
          sessionId?: string;
        }
      ) => {
        const parsed = parseTarget(target);
        if (!parsed) {
          console.error(
            chalk.red(
              'Invalid target format. Use: model/name or agent/name etc'
            )
          );
          process.exit(ExitCodes.CliError);
        }

        await executeQuery({
          targetType: parsed.type,
          targetName: parsed.name,
          message,
          outputFormat: options.output,
          sessionId: options.sessionId,
        });
      }
    );

  return queryCommand;
}
