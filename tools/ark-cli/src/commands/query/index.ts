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
    .option('-t, --timeout <seconds>', 'Timeout in seconds', '300')
    .option('--no-cleanup', 'Do not clean up the query after completion')
    .action(async (target: string, message: string, options: {timeout: string, cleanup: boolean}) => {
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
        timeoutSeconds: parseInt(options.timeout ?? '300'),
        cleanup: options.cleanup,
      });
    });

  return queryCommand;
}
