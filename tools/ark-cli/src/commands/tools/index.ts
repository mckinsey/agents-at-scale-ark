import {Command} from 'commander';
import {execa} from 'execa';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

async function listTools(options: {output?: string}) {
  try {
    // Use kubectl to get tools (MCPServers)
    const result = await execa('kubectl', ['get', 'mcpservers', '-o', 'json'], {
      stdio: 'pipe',
    });

    const data = JSON.parse(result.stdout);
    const tools = data.items || [];

    if (options.output === 'json') {
      // Output the raw items for JSON format
      console.log(JSON.stringify(tools, null, 2));
    } else {
      if (tools.length === 0) {
        output.info('No tools found');
        return;
      }

      tools.forEach((tool: {metadata: {name: string}}) => {
        console.log(tool.metadata.name);
      });
    }
  } catch (error) {
    output.error(
      'fetching tools:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

export function createToolsCommand(_: ArkConfig): Command {
  const toolsCommand = new Command('tools');

  toolsCommand
    .description('List available tools')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      await listTools(options);
    });

  const listCommand = new Command('list');
  listCommand
    .alias('ls')
    .description('List available tools')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      await listTools(options);
    });

  toolsCommand.addCommand(listCommand);

  return toolsCommand;
}
