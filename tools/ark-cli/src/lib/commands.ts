import {execa, type Options} from 'execa';
import chalk from 'chalk';

/**
 * Check if a command exists and is executable by running it with specified args
 */
export async function checkCommandExists(
  command: string,
  args: string[] = ['--version']
): Promise<boolean> {
  try {
    await execa(command, args);
    return true;
  } catch {
    return false;
  }
}
export {checkCommandExists as isCommandAvailable};

/**
 * Execute a command with optional verbose output
 * @param command The command to execute
 * @param args Array of arguments
 * @param execaOptions Standard execa options
 * @param additionalOptions Additional options for execute (e.g., verbose)
 */
export async function execute(
  command: string,
  args: string[] = [],
  execaOptions: Options = {},
  additionalOptions: {verbose?: boolean} = {}
) {
  const {verbose = false} = additionalOptions;

  if (verbose) {
    console.log(chalk.gray(`$ ${command} ${args.join(' ')}`));
  }

  return await execa(command, args, execaOptions);
}
