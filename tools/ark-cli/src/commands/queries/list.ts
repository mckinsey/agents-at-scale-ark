import chalk from 'chalk';
import type {Query} from '../../lib/types.js';
import output from '../../lib/output.js';
import {ExitCodes} from '../../lib/errors.js';
import {listResources} from '../../lib/kubectl.js';

// Output format constants
const OUTPUT_FORMAT_JSON = 'json';
const OUTPUT_FORMAT_TEXT = 'text';
const SUPPORTED_FORMATS = [OUTPUT_FORMAT_JSON, OUTPUT_FORMAT_TEXT];

// Query phase constants
const PHASE_DONE = 'done';
const PHASE_RUNNING = 'running';
const PHASE_ERROR = 'error';
const PHASE_UNKNOWN = 'unknown';

// Column padding
const COLUMN_PADDING = 2;
const MIN_NAME_LENGTH = 4;

interface ListQueriesOptions {
  output?: string;
  sortBy?: string;
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case PHASE_DONE:
      return chalk.green;
    case PHASE_RUNNING:
      return chalk.blue;
    case PHASE_ERROR:
      return chalk.red;
    default:
      return chalk.yellow;
  }
}

function printTableHeader(maxNameLength: number): void {
  const paddedHeaderLength = maxNameLength + COLUMN_PADDING;
  const header = `${chalk.bold('NAME'.padEnd(paddedHeaderLength))}${chalk.bold('STATUS')}`;
  console.log(header);

  const separatorLength = paddedHeaderLength + 20;
  console.log(chalk.gray('-'.repeat(separatorLength)));
}

function printTableRow(query: Query, maxNameLength: number): void {
  const status = query.status?.phase || PHASE_UNKNOWN;
  const statusColor = getStatusColor(status);
  const paddedNameLength = maxNameLength + COLUMN_PADDING;

  console.log(
    `${query.metadata.name.padEnd(paddedNameLength)}${statusColor(status)}`
  );
}

export async function listQueries(options: ListQueriesOptions): Promise<void> {
  try {
    const queries = await listResources<Query>('queries', {
      sortBy: options.sortBy,
    });

    if (options.output === OUTPUT_FORMAT_JSON) {
      console.log(JSON.stringify(queries, null, 2));
    } else if (
      options.output &&
      !SUPPORTED_FORMATS.includes(options.output)
    ) {
      const supportedFormats = SUPPORTED_FORMATS.join(', ');
      output.warning(
        `unsupported output format: ${options.output}. Supported formats: ${supportedFormats}`
      );
      process.exit(ExitCodes.CliError);
    } else {
      if (queries.length === 0) {
        output.warning('no queries available');
        return;
      }

      const maxNameLength = Math.max(
        MIN_NAME_LENGTH,
        ...queries.map((q) => q.metadata.name.length)
      );

      printTableHeader(maxNameLength);

      queries.forEach((query: Query) => {
        printTableRow(query, maxNameLength);
      });
    }
  } catch (error) {
    output.error(
      'fetching queries:',
      error instanceof Error ? error.message : error
    );
    process.exit(ExitCodes.CliError);
  }
}
