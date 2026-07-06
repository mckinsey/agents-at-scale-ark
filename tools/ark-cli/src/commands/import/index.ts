import {Command} from 'commander';
import {execa} from 'execa';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

interface ImportOptions {
  upsert?: boolean;
}

interface UpsertSummary {
  created: number;
  configured: number;
  unchanged: number;
  failures: string[];
}

function summarizeApply(stdout: string, stderr: string): UpsertSummary {
  const summary: UpsertSummary = {
    created: 0,
    configured: 0,
    unchanged: 0,
    failures: [],
  };

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.endsWith(' created')) {
      summary.created++;
    } else if (trimmed.endsWith(' configured')) {
      summary.configured++;
    } else if (trimmed.endsWith(' unchanged')) {
      summary.unchanged++;
    }
  }

  for (const line of stderr.split('\n')) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('Error from server') ||
      trimmed.startsWith('error:')
    ) {
      summary.failures.push(trimmed);
    }
  }

  return summary;
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

  const summary = summarizeApply(result.stdout ?? '', result.stderr ?? '');

  if (result.exitCode !== 0 || summary.failures.length > 0) {
    output.error(
      `import completed with errors: ${summary.created} created, ${summary.configured} configured, ${summary.unchanged} unchanged, ${summary.failures.length} failed`
    );
    for (const failure of summary.failures) {
      output.error(failure);
    }
    process.exit(1);
  }

  output.success(
    `import complete: ${summary.created} created, ${summary.configured} configured, ${summary.unchanged} unchanged`
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
