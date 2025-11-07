import output from '../../lib/output.js';
import {ExitCodes} from '../../lib/errors.js';
import {deleteResource} from '../../lib/kubectl.js';

interface DeleteQueryOptions {
  all?: boolean;
}

export async function deleteQuery(
  name: string | undefined,
  options: DeleteQueryOptions
): Promise<void> {
  try {
    if (options.all) {
      await deleteResource('queries', undefined, {all: true});
    } else if (name) {
      await deleteResource('queries', name);
    } else {
      output.error('Either provide a query name or use --all flag');
      process.exit(ExitCodes.CliError);
    }
  } catch (error) {
    output.error(
      'deleting query:',
      error instanceof Error ? error.message : error
    );
    process.exit(ExitCodes.CliError);
  }
}
