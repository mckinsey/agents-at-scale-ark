import {Command} from 'commander';
import {execa} from 'execa';
import * as fs from 'fs/promises';
import yaml from 'yaml';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

const ARK_RESOURCE_TYPES = [
  'secrets',
  'tools',
  'models',
  'agents',
  'teams',
  'evaluators',
  'mcpservers',
  'a2aservers',
];

type ResourceType = (typeof ARK_RESOURCE_TYPES)[number];

interface ExportOptions {
  output?: string;
  namespace?: string;
  types?: string;
  labels?: string;
}

async function getResources(
  resourceType: ResourceType,
  namespace?: string,
  labels?: string
): Promise<string> {
  try {
    const args = ['get', resourceType, '-o', 'yaml'];

    if (namespace) {
      args.push('-n', namespace);
    } else {
      args.push('--all-namespaces');
    }

    if (labels) {
      args.push('-l', labels);
    }

    const result = await execa('kubectl', args, {
      stdio: 'pipe',
    });

    return result.stdout || "";
  } catch (error) {
    if (
      error instanceof Error &&
      'stderr' in error &&
      typeof error.stderr === 'string' &&
      error.stderr.includes('NotFound')
    ) {
      return "";
    }
    output.warning(
      `failed to fetch ${resourceType}:`,
      error instanceof Error ? error.message : error
    );
    return "";
  }
}

async function exportResources(options: ExportOptions) {
  try {
    const outputPath = options.output || 'ark-export.yaml';
    let resourceTypes = options.types
      ? (options.types.split(',') as ResourceType[])
      : ARK_RESOURCE_TYPES;

    // ensure that we get resources in the correct order; e.g. agents before teams that use the agents
    resourceTypes.sort((a, b) => {
      return ARK_RESOURCE_TYPES.indexOf(a) - ARK_RESOURCE_TYPES.indexOf(b);
    });

    output.info(`exporting ark resources to ${outputPath}...`);

    const allResources: unknown[] = [];
    let allResourceCount = 0;

    for (const resourceType of resourceTypes) {
      if (!ARK_RESOURCE_TYPES.includes(resourceType)) {
        output.warning(`unknown resource type: ${resourceType}, skipping`);
        continue;
      }

      output.info(`fetching ${resourceType}...`);
      const resources = await getResources(
        resourceType,
        options.namespace,
        options.labels
      );

      if (resources.length > 0) {
        const resourceCount = yaml.parse(resources).items.length
        output.success(`found ${resourceCount} ${resourceType}`);
        allResources.push(resources);
        allResourceCount += resourceCount;
      }
    }

    if (allResourceCount === 0) {
      output.warning('no resources found to export');
      return;
    }

    const yamlContent = allResources.join("\n---\n");

    await fs.writeFile(outputPath, yamlContent, 'utf-8');

    output.success(
      `exported ${allResourceCount} resources to ${outputPath}`
    );
  } catch (error) {
    output.error(
      'export failed:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

export function createExportCommand(_: ArkConfig): Command {
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
      await exportResources(options);
    });

  return exportCommand;
}
