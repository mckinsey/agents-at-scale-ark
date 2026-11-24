import {Command} from 'commander';
import {execa} from 'execa';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

interface ImportOptions {
  upsert?: boolean;
}

interface ApplyCounts {
  created: number;
  configured: number;
  unchanged: number;
}

function countApplied(stdout: string): ApplyCounts {
  const counts: ApplyCounts = {created: 0, configured: 0, unchanged: 0};

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.endsWith(' created')) {
      counts.created++;
    } else if (trimmed.endsWith(' configured')) {
      counts.configured++;
    } else if (trimmed.endsWith(' unchanged')) {
      counts.unchanged++;
    }
  }

  return counts;
}

async function importResources(filepath: string, options: ImportOptions) {
  if (!options.upsert) {
    try {
      output.info(`importing ark resources from ${filepath}...`);

      const args = ['create', '-f', filepath];

      await execa('kubectl', args, {
        stdio: 'pipe',
      });

      output.success(`imported resources from ${filepath}`);
    } catch (error) {
      output.error(
        'import failed:',
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
    return;
  }

  output.info(`importing ark resources from ${filepath} (upsert)...`);

  const result = await execa('kubectl', ['apply', '-f', filepath], {
    stdio: 'pipe',
    reject: false,
  });

  const counts = countApplied(result.stdout ?? '');

  if (result.exitCode !== 0) {
    output.error(
      `import failed (${counts.created} created, ${counts.configured} configured, ${counts.unchanged} unchanged before errors):`
    );
    const details = (result.stderr || result.stdout || '').trim();
    if (details) {
      output.error(details);
    }
    process.exit(1);
  }

  output.success(
    `import complete: ${counts.created} created, ${counts.configured} configured, ${counts.unchanged} unchanged`
  );
}

export function createImportCommand(_: ArkConfig): Command {
  const importCommand = new Command('import');

  importCommand
    .description('import ARK resources from a file')
    .argument('<filepath>', 'input file path')
    .option(
      '--upsert',
      'create or update resources (kubectl apply); allows re-import onto a cluster that already has some of these resources'
    )
    .action(async (filepath: string, options: ImportOptions) => {
      await importResources(filepath, options);
    });

  return importCommand;
}
