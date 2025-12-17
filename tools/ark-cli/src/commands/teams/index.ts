import {Command} from 'commander';
import {execa} from 'execa';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';
import {executeQuery} from '../../lib/executeQuery.js';
import type {Team, K8sListResource} from '../../lib/types.js';

async function listTeams(options: {output?: string}) {
  try {
    // Use kubectl to get teams
    const result = await execa('kubectl', ['get', 'teams', '-o', 'json'], {
      stdio: 'pipe',
    });

    const data = JSON.parse(result.stdout) as K8sListResource<Team>;
    const teams = data.items || [];

    if (options.output === 'json') {
      // Output the raw items for JSON format
      console.log(JSON.stringify(teams, null, 2));
    } else {
      if (teams.length === 0) {
        output.info('No teams found');
        return;
      }

      teams.forEach((team: Team) => {
        console.log(team.metadata.name);
      });
    }
  } catch (error) {
    output.error(
      'fetching teams:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

export function createTeamsCommand(config: ArkConfig): Command {
  const teamsCommand = new Command('teams');

  teamsCommand
    .description('List available teams')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      await listTeams(options);
    });

  const listCommand = new Command('list');
  listCommand
    .alias('ls')
    .description('List available teams')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      await listTeams(options);
    });

  teamsCommand.addCommand(listCommand);

  // Add query command
  const queryCommand = new Command('query');
  queryCommand
    .description('Query a team')
    .argument('<name>', 'Team name')
    .argument('<message>', 'Message to send')
    .option('--timeout <timeout>', 'Query timeout (e.g., 30s, 5m, 1h)')
    .action(
      async (name: string, message: string, options: {timeout?: string}) => {
        await executeQuery({
          targetType: 'team',
          targetName: name,
          message,
          timeout: options.timeout || config.queryTimeout,
        });
      }
    );

  teamsCommand.addCommand(queryCommand);

  return teamsCommand;
}
