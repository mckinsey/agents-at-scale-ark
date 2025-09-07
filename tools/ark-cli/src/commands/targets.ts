import chalk from 'chalk';
import { Command } from 'commander';
import { ChatClient } from '../lib/chatClient.js';

export function createTargetsCommand(): Command {
  const targets = new Command('targets');
  targets.description('Manage and list available query targets (agents, teams, models, tools)');

  targets
    .command('list')
    .alias('ls')
    .description('List all available query targets')
    .option('-o, --output <format>', 'Output format (json or text)', 'text')
    .option('-t, --type <type>', 'Filter by type (agent, team, model, tool)')
    .action(async (options) => {
      try {
        const client = new ChatClient();
        await client.initialize();
        
        const allTargets = await client.getQueryTargets();
        
        // Filter by type if specified
        let filteredTargets = allTargets;
        if (options.type) {
          filteredTargets = allTargets.filter(t => t.type === options.type);
        }
        
        // Sort targets by type and name
        filteredTargets.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type.localeCompare(b.type);
          }
          return a.name.localeCompare(b.name);
        });
        
        if (options.output === 'json') {
          console.log(JSON.stringify(filteredTargets, null, 2));
        } else {
          if (filteredTargets.length === 0) {
            console.log(chalk.yellow('No targets available'));
            return;
          }
          
          // Simple list output with type/name format
          for (const target of filteredTargets) {
            console.log(target.id);
          }
        }
      } catch (error) {
        console.error(chalk.red('Error fetching targets:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return targets;
}