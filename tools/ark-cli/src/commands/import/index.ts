import {Command} from 'commander';
import {execa} from 'execa';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';


async function importResources(filepath: string) {
  try {
    output.info(`importing ark resources from ${filepath}...`);

    const args = ['create', '-f', filepath];

    const result = await execa('kubectl', args, {
      stdio: 'pipe',
    });

    output.success(
      `imported resources from ${filepath}`
    );
  } catch (error) {
    output.error(
      'import failed:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

export function createImportCommand(_: ArkConfig): Command {
  const importCommand = new Command('import');

  importCommand
    .description('import ARK resources from a file')
    .argument('<filepath>', 'input file path')
    .action(async (filepath: string) => {
      await importResources(filepath);
    });

  return importCommand;
}
