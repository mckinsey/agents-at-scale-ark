import {Command} from 'commander';
import {marked} from 'marked';
// @ts-ignore - no types available
import TerminalRenderer from 'marked-terminal';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';
import type {Query} from '../../lib/types.js';
import {ExitCodes} from '../../lib/errors.js';
import {getResource, replaceResource} from '../../lib/kubectl.js';
import {listQueries} from './list.js';
import {deleteQuery} from './delete.js';

function renderMarkdown(content: string): string {
  if (process.stdout.isTTY) {
    marked.setOptions({
      // @ts-ignore - TerminalRenderer types are incomplete
      renderer: new TerminalRenderer({
        showSectionPrefix: false,
        reflowText: true,
        // @ts-ignore - preserveNewlines exists but not in types
        preserveNewlines: true,
      }),
    });
    return marked(content) as string;
  }
  return content;
}

async function getQuery(
  name: string,
  options: {output?: string; response?: boolean}
) {
  try {
    const query = await getResource<Query>('queries', name);

    if (options.response) {
      if (query.status?.response) {
        const response = query.status.response;
        if (options.output === 'markdown') {
          console.log(renderMarkdown(response.content || ''));
        } else {
          console.log(JSON.stringify(response, null, 2));
        }
      } else {
        output.warning('No response available');
      }
    } else if (options.output === 'markdown') {
      if (query.status?.response) {
        console.log(renderMarkdown(query.status.response.content || ''));
      } else {
        output.warning('No response available');
      }
    } else {
      console.log(JSON.stringify(query, null, 2));
    }
  } catch (error) {
    output.error(
      'fetching query:',
      error instanceof Error ? error.message : error
    );
    process.exit(ExitCodes.CliError);
  }
}

export function createQueriesCommand(_: ArkConfig): Command {
  const queriesCommand = new Command('queries');
  queriesCommand
    .description('List all queries')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .option(
      '--sort-by <field>',
      'sort by kubernetes field (e.g., .metadata.name)'
    )
    .action(async (options) => {
      await listQueries(options);
    });

  const getCommand = new Command('get');
  getCommand
    .description('Get a specific query (@latest for most recent)')
    .argument('<name>', 'Query name or @latest')
    .option('-o, --output <format>', 'output format (json, markdown)', 'json')
    .option('-r, --response', 'show only the response content', false)
    .action(async (name: string, options) => {
      await getQuery(name, options);
    });

  queriesCommand.addCommand(getCommand);

  const deleteCommand = new Command('delete');
  deleteCommand
    .description('Delete a query')
    .argument('[name]', 'Query name')
    .option('--all', 'delete all queries', false)
    .action(async (name: string | undefined, options) => {
      await deleteQuery(name, options);
    });

  queriesCommand.addCommand(deleteCommand);

  const resubmitCommand = new Command('resubmit');
  resubmitCommand
    .description(
      'Resubmit a query by clearing its status (@latest for most recent)'
    )
    .argument('<name>', 'Query name or @latest')
    .action(async (name: string) => {
      try {
        const query = await getResource<Query>('queries', name);

        const queryWithoutStatus: Query = {
          ...query,
          status: undefined,
        };

        await replaceResource(queryWithoutStatus);

        output.success(`Query '${query.metadata.name}' resubmitted`);
      } catch (error) {
        output.error(
          'resubmitting query:',
          error instanceof Error ? error.message : error
        );
        process.exit(ExitCodes.CliError);
      }
    });

  queriesCommand.addCommand(resubmitCommand);

  return queriesCommand;
}
