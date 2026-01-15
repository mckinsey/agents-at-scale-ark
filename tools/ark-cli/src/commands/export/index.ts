import {Command} from 'commander';
import {execa} from 'execa';
import * as fs from 'fs/promises';
import yaml from 'yaml';
import type {ArkConfig} from '../../lib/config.js';
import {listResources} from '../../lib/kubectl.js';
import output from '../../lib/output.js';

// resource types in dependency order so that they can be loaded correctly
// by default these will all be exported if not specified; can be overridden with defaultExportTypes in config
const RESOURCE_ORDER = [
  'secrets',
  'tools',
  'models',
  'agents',
  'teams',
  'evaluators',
  'mcpservers',
  'a2aservers',
];

interface ExportOptions {
  output?: string;
  namespace?: string;
  types?: string;
  labels?: string;
}

async function exportResources(options: ExportOptions, config: ArkConfig) {
  try {
    const allResourceTypes = config.defaultExportTypes || RESOURCE_ORDER
    const outputPath = options.output || 'ark-export.yaml';
    let resourceTypes = options.types
      ? (options.types.split(','))
      : allResourceTypes;

    // ensure that we get resources in the correct order; e.g. agents before teams that use the agents
    resourceTypes.sort((a, b) => {
      return RESOURCE_ORDER.indexOf(a) - RESOURCE_ORDER.indexOf(b);
    });

    output.info(`exporting ark resources to ${outputPath}...`);

    const allResources: unknown[] = [];
    let allResourceCount = 0;

    for (const resourceType of resourceTypes) {
      if (!RESOURCE_ORDER.includes(resourceType)) {
        output.warning(`unknown resource type: ${resourceType}, skipping`);
        continue;
      }

      output.info(`fetching ${resourceType}...`);
      const resources = await listResources(resourceType, {
          namespace: options.namespace,
          labels: options.labels
        });

      const resourceCount = resources.length
      if (resources.length > 0) {
        output.success(`found ${resourceCount} ${resourceType}`);
        allResources.push(...resources);
        allResourceCount += resourceCount;
      }
    }

    if (allResourceCount === 0) {
      output.warning('no resources found to export');
      return;
    }

    const yamlContent = allResources.map((resource) => yaml.stringify(resource)).join("\n---\n");

    await fs.writeFile(outputPath, yamlContent, 'utf-8');

    output.success(
      `exported ${allResourceCount} resources to ${outputPath}`
    );
  } catch (error) {
    output.error(
      'export failed:',
      error instanceof Error ? error.message : error
    );
  }
}

export function createExportCommand(config: ArkConfig): Command {
  const exportCommand = new Command('export');

  exportCommand
    .description('export ARK resources to a file')
    .option('-o, --output <file>', 'output file path', 'ark-export.yaml')
    .option('-n, --namespace <namespace>', 'namespace to export from')
    .option(
      '-t, --types <types>',
      'comma-separated list of resource types to export'
    )
    .option('-l, --labels <labels>', 'label selector to filter resources')
    .action(async (options: ExportOptions) => {
      await exportResources(options, config);
    });

  return exportCommand;
}
