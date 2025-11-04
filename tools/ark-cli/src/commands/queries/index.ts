import {Command} from 'commander';
import {marked} from 'marked';
import TerminalRenderer from 'marked-terminal';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';
import type {Query} from '../../lib/types.js';
import {ExitCodes} from '../../lib/errors.js';
import {getResource} from '../../lib/kubectl.js';

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

  return queriesCommand;
}
