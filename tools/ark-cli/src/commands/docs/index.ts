import chalk from 'chalk';
import {Command} from 'commander';
import open from 'open';
import type {ArkConfig} from '../../lib/config.js';

const DOCS_URL = 'https://mckinsey.github.io/agents-at-scale-ark/';

export async function openDocs() {
  console.log(`Opening ARK documentation: ${chalk.blue(DOCS_URL)}`);

  // Brief pause before opening browser
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Open browser
  await open(DOCS_URL);
}

export function createDocsCommand(_: ArkConfig): Command {
  const docsCommand = new Command('docs');
  docsCommand
    .description('Open the ARK documentation in your browser')
    .action(openDocs);

  return docsCommand;
}
