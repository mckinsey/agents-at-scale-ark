import {Command} from 'commander';
import {marked} from 'marked';
import TerminalRenderer from 'marked-terminal';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';
import type {Query} from '../../lib/types.js';
import {ExitCodes} from '../../lib/errors.js';
import {getResource, listResources} from '../../lib/kubectl.js';

function renderMarkdown(content: string): string {
  if (process.stdout.isTTY) {
    marked.setOptions({
      // @ts-expect-error - TerminalRenderer types are incomplete
      renderer: new TerminalRenderer({
        showSectionPrefix: false,
        reflowText: true,
        // @ts-expect-error - preserveNewlines exists but not in types
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
      if (query.status?.responses && query.status.responses.length > 0) {
        const response = query.status.responses[0];
        if (options.output === 'markdown') {
          console.log(renderMarkdown(response.content || ''));
        } else {
          console.log(JSON.stringify(response, null, 2));
        }
      } else {
        output.warning('No response available');
      }
    } else if (options.output === 'markdown') {
      if (query.status?.responses && query.status.responses.length > 0) {
        console.log(renderMarkdown(query.status.responses[0].content || ''));
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

async function listQueries(options: {output?: string}) {
  try {
    const queries = await listResources<Query>('queries');

    if (options.output === 'json') {
      // Output the raw items for JSON format
      console.log(JSON.stringify(queries, null, 2));
    } else if (options.output && options.output !== 'text') {
      // Invalid output format
      output.warning(
        `unsupported output format: ${options.output}. Supported formats: json, text`
      );
      process.exit(ExitCodes.CliError);
    } else {
      if (queries.length === 0) {
        output.warning('no queries available');
        return;
      }

      // Simple list output - just query names
      queries.forEach((query: Query) => {
        console.log(query.metadata.name);
      });
    }
  } catch (error) {
    output.error(
      'fetching queries:',
      error instanceof Error ? error.message : error
    );
    process.exit(ExitCodes.CliError);
  }
}

export function createQueriesCommand(_: ArkConfig): Command {
  const queriesCommand = new Command('queries');

  queriesCommand.description('Manage query resources');

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

  const listCommand = new Command('list');
  listCommand
    .alias('ls')
    .description('List all queries')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .action(async (options) => {
      await listQueries(options);
    });

  queriesCommand.addCommand(listCommand);

  return queriesCommand;
}
