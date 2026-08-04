import {Command} from 'commander';
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
  'mcpservers',
  'a2aservers',
];

const SERVER_MANAGED_METADATA_FIELDS = [
  'resourceVersion',
  'uid',
  'generation',
  'creationTimestamp',
  'managedFields',
  'selfLink',
  'deletionTimestamp',
  'deletionGracePeriodSeconds',
  'ownerReferences',
  'finalizers',
];

const LAST_APPLIED_ANNOTATION =
  'kubectl.kubernetes.io/last-applied-configuration';

interface ExportResource {
  apiVersion?: string;
  kind?: string;
  type?: string;
  metadata: {
    name: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface ExportOptions {
  output?: string;
  namespace?: string;
  types?: string;
  labels?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeResource(resource: ExportResource): ExportResource {
  const sanitized = {...resource};
  delete sanitized.status;

  const metadata = {...resource.metadata};
  for (const field of SERVER_MANAGED_METADATA_FIELDS) {
    delete metadata[field];
  }

  if (isRecord(metadata.annotations)) {
    const annotations = {...metadata.annotations};
    delete annotations[LAST_APPLIED_ANNOTATION];

    if (Object.keys(annotations).length === 0) {
      delete metadata.annotations;
    } else {
      metadata.annotations = annotations;
    }
  }

  sanitized.metadata = metadata;
  return sanitized;
}

function isExcludedSecret(resource: ExportResource): boolean {
  const isHelmRelease =
    resource.type === 'helm.sh/release.v1' &&
    resource.metadata.name.startsWith('sh.helm.release.v1.');

  return (
    isHelmRelease || resource.type === 'kubernetes.io/service-account-token'
  );
}

async function exportResources(options: ExportOptions, config: ArkConfig) {
  try {
    const allResourceTypes = config.defaultExportTypes || RESOURCE_ORDER;
    const outputPath = options.output || 'ark-export.yaml';
    const resourceTypes = options.types
      ? options.types.split(',')
      : allResourceTypes;

    // ensure that we get resources in the correct order; e.g. agents before teams that use the agents
    resourceTypes.sort((a, b) => {
      return RESOURCE_ORDER.indexOf(a) - RESOURCE_ORDER.indexOf(b);
    });

    output.info(`exporting ark resources to ${outputPath}...`);

    const allResources: ExportResource[] = [];
    let allResourceCount = 0;
    let excludedResourceCount = 0;

    for (const resourceType of resourceTypes) {
      if (!RESOURCE_ORDER.includes(resourceType)) {
        output.warning(`unknown resource type: ${resourceType}, skipping`);
        continue;
      }

      output.info(`fetching ${resourceType}...`);
      const resources = await listResources<ExportResource>(resourceType, {
        namespace: options.namespace,
        labels: options.labels,
      });

      const resourceCount = resources.length;
      if (resources.length > 0) {
        output.success(`found ${resourceCount} ${resourceType}`);
        const exportableResources =
          resourceType === 'secrets'
            ? resources.filter((resource) => !isExcludedSecret(resource))
            : resources;

        excludedResourceCount += resourceCount - exportableResources.length;
        allResources.push(...exportableResources.map(sanitizeResource));
        allResourceCount += exportableResources.length;
      }
    }

    if (excludedResourceCount > 0) {
      const secretLabel = excludedResourceCount === 1 ? 'secret' : 'secrets';
      output.info(
        `excluded ${excludedResourceCount} system-managed ${secretLabel}`
      );
    }

    if (allResourceCount === 0) {
      output.warning('no resources found to export');
      return;
    }

    const yamlContent = allResources
      .map((resource) => yaml.stringify(resource))
      .join('\n---\n');

    await fs.writeFile(outputPath, yamlContent, 'utf-8');

    output.success(`exported ${allResourceCount} resources to ${outputPath}`);
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
