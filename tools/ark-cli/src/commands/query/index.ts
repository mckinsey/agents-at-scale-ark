import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';
import {executeQuery, parseTarget} from '../../lib/executeQuery.js';

export function createQueryCommand(_: ArkConfig): Command {
  const queryCommand = new Command('query');

  queryCommand
    .description('Execute a single query against a model or agent')
    .argument('<target>', 'Query target (e.g., model/default, agent/my-agent)')
    .argument('<message>', 'Message to send')
    .action(async (target: string, message: string) => {
      // Parse and validate target format
      const parsed = parseTarget(target);
      if (!parsed) {
        output.error(
          'Invalid target format. Use: model/name or agent/name etc'
        );
        process.exit(1);
      }

      await executeQuery({
        targetType: parsed.type,
        targetName: parsed.name,
        message,
      });
    });

  return queryCommand;
}
