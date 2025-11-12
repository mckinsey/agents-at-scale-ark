import output from '../../lib/output.js';
import {ExitCodes} from '../../lib/errors.js';
import {deleteResource} from '../../lib/kubectl.js';
import {InvalidArgumentError} from 'commander';

interface DeleteQueryOptions {
  all?: boolean;
}

export const MISSING_NAME_OR_ALL_ERROR =
  'either provide a query name or use --all flag';
export const BOTH_NAME_AND_ALL_ERROR =
  'cannot use query name and --all flag together';
function assertDeleteOptionsValid(
  name: string | undefined,
  options: DeleteQueryOptions
): void {
  if (!name && !options.all) {
    throw new InvalidArgumentError(MISSING_NAME_OR_ALL_ERROR);
  }

  if (name && options.all) {
    throw new InvalidArgumentError(BOTH_NAME_AND_ALL_ERROR);
  }
}

export async function deleteQuery(
  name: string | undefined,
  options: DeleteQueryOptions
): Promise<void> {
  try {
    assertDeleteOptionsValid(name, options);

    await deleteResource('queries', name, options);
  } catch (error) {
    output.error(
      'deleting query:',
      error instanceof Error ? error.message : error
    );
    process.exit(ExitCodes.CliError);
  }
}
