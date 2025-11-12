import chalk from 'chalk';
import type {Query} from '../../lib/types.js';
import output from '../../lib/output.js';
import {ExitCodes} from '../../lib/errors.js';
import {listResources} from '../../lib/kubectl.js';
import {assertSupportedOutputFormat} from './validation.js';

// Output format constants
const OUTPUT_FORMAT_JSON = 'json';

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
  const header = `${'NAME'.padEnd(paddedHeaderLength)}${'STATUS'}`;
  console.log(header);
}

function printTableRow(query: Query, maxNameLength: number): void {
  const status = query.status?.phase || PHASE_UNKNOWN;
  const statusColor = getStatusColor(status);
  const paddedNameLength = maxNameLength + COLUMN_PADDING;

  console.log(
    `${query.metadata.name.padEnd(paddedNameLength)}${statusColor(status)}`
  );
}

function printResult(queries: Query[], options: ListQueriesOptions): void {
  if (options.output === OUTPUT_FORMAT_JSON) {
    console.log(JSON.stringify(queries, null, 2));
    return;
  }

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

export async function listQueries(options: ListQueriesOptions): Promise<void> {
  try {
    assertSupportedOutputFormat(options.output);

    const queries = await listResources<Query>('queries', {
      sortBy: options.sortBy,
    });

    printResult(queries, options);
  } catch (error) {
    output.error(
      'fetching queries:',
      error instanceof Error ? error.message : error
    );
    process.exit(ExitCodes.CliError);
  }
}
