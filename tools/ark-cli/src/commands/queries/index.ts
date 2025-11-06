import {Command} from 'commander';
import {marked} from 'marked';
import TerminalRenderer from 'marked-terminal';
import chalk from 'chalk';
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

async function listQueries(options: {output?: string; sortBy?: string}) {
  try {
    const queries = await listResources<Query>('queries', {
      sortBy: options.sortBy,
    });

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

      // Calculate max name length for alignment
      const maxNameLength = Math.max(
        4, // 'NAME' header length
        ...queries.map((q) => q.metadata.name.length)
      );

      // Print table header
      const header = `${chalk.bold('NAME'.padEnd(maxNameLength + 2))}${chalk.bold('STATUS')}`;
      console.log(header);
      console.log(chalk.gray('-'.repeat(maxNameLength + 2 + 20)));

      // Print table rows
      queries.forEach((query: Query) => {
        const status = query.status?.phase || 'unknown';
        const statusColor = 
          status === 'done' ? chalk.green :
          status === 'running' ? chalk.blue :
          status === 'error' ? chalk.red :
          chalk.yellow;
        
        console.log(
          `${query.metadata.name.padEnd(maxNameLength + 2)}${statusColor(status)}`
        );
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
    .option('--sort-by <field>', 'sort by kubernetes field (e.g., .metadata.name)')
    .action(async (options) => {
      await listQueries(options);
    });

  queriesCommand.addCommand(listCommand);

  return queriesCommand;
}
