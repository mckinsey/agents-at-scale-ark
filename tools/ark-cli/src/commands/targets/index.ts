import {Command} from 'commander';
import {execa} from 'execa';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

interface Target {
  type: string;
  name: string;
  id: string;
  available?: boolean;
}

async function fetchResourceTargets(resourceType: string): Promise<Target[]> {
  const result = await execa(
    'kubectl',
    ['get', `${resourceType}s`, '-o', 'json'],
    {
      stdio: 'pipe',
    }
  );

  const data = JSON.parse(result.stdout);
  const items = data.items || [];

  return items.map((item: any) => ({
    type: resourceType,
    name: item.metadata.name,
    id: `${resourceType}/${item.metadata.name}`,
    available: item.status?.available || item.status?.phase === 'ready' || true,
  }));
}

async function listTargets(options: {output?: string; type?: string}) {
  try {
    // Fetch all resource types in parallel
    const resourceTypes = options.type
      ? [options.type]
      : ['model', 'agent', 'team', 'tool'];

    const targetPromises = resourceTypes.map((type) =>
      fetchResourceTargets(type)
    );
    const targetArrays = await Promise.all(targetPromises);

    // Flatten all targets into single array
    const allTargets = targetArrays.flat();

    // Sort targets by type and name
    allTargets.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      return a.name.localeCompare(b.name);
    });

    if (options.output === 'json') {
      console.log(JSON.stringify(allTargets, null, 2));
    } else {
      if (allTargets.length === 0) {
        output.warning('no targets available');
        return;
      }

      // Simple list output with type/name format
      for (const target of allTargets) {
        console.log(target.id);
      }
    }
  } catch (error) {
    output.error(
      'fetching targets:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

export function createTargetsCommand(_: ArkConfig): Command {
  const targets = new Command('targets');
  targets
    .description('list available query targets (agents, teams, models, tools)')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .option('-t, --type <type>', 'filter by type (agent, team, model, tool)')
    .action(async (options) => {
      await listTargets(options);
    });

  targets
    .command('list')
    .alias('ls')
    .description('list all available query targets')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .option('-t, --type <type>', 'filter by type (agent, team, model, tool)')
    .action(async (options) => {
      await listTargets(options);
    });

  return targets;
}
