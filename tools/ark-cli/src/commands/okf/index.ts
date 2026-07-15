import {Command} from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import yaml from 'yaml';
import type {ArkConfig} from '../../lib/config.js';
import {listResources} from '../../lib/kubectl.js';
import output from '../../lib/output.js';

// Minimal shapes for the fields we project into OKF - we deliberately don't
// depend on generated types so the exporter degrades gracefully as CRDs evolve.
interface ArkResource {
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

interface OkfExportOptions {
  output: string;
  namespace?: string;
}

interface Concept {
  // Bundle-relative path without the .md suffix, e.g. "agents/researcher".
  id: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

const OKF_VERSION = '0.1';

function conceptDocument(concept: Concept): string {
  // Frontmatter is emitted via the yaml library so values with quotes,
  // colons or newlines stay parseable - a spec conformance requirement.
  const frontmatter = yaml.stringify(concept.frontmatter).trimEnd();
  return `---\n${frontmatter}\n---\n\n${concept.body.trimEnd()}\n`;
}

function baseFrontmatter(
  type: string,
  resource: ArkResource,
  tags: string[]
): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    type,
    title: resource.metadata.name,
  };
  const description = resource.spec?.description;
  if (typeof description === 'string' && description) {
    frontmatter.description = description;
  }
  // The OKF `resource` field wants a canonical URI for the underlying asset;
  // a k8s-style URI keeps it unambiguous without pointing at any one dashboard.
  frontmatter.resource = `k8s://ark.mckinsey.com/v1alpha1/namespaces/${
    resource.metadata.namespace || 'default'
  }/${type.toLowerCase().replace(/^ark /, '').replace(/ /g, '')}s/${
    resource.metadata.name
  }`;
  frontmatter.tags = tags.concat(resource.metadata.namespace || 'default');
  if (resource.metadata.creationTimestamp) {
    frontmatter.timestamp = resource.metadata.creationTimestamp;
  }
  return frontmatter;
}

function modelConcept(model: ArkResource): Concept {
  const spec = model.spec || {};
  const modelValue = (spec.model as {value?: string} | undefined)?.value;
  const lines = [
    `Provider type: \`${spec.type || 'unknown'}\`.`,
    modelValue ? `Underlying model: \`${modelValue}\`.` : '',
  ].filter(Boolean);
  return {
    id: `models/${model.metadata.name}`,
    frontmatter: baseFrontmatter('Ark Model', model, ['model']),
    body: lines.join('\n'),
  };
}

function agentConcept(
  agent: ArkResource,
  toolToMcpServer: Map<string, string>
): Concept {
  const spec = agent.spec || {};
  const sections: string[] = [];

  const modelRef = spec.modelRef as {name?: string} | undefined;
  // Every reference becomes a markdown link so the bundle forms the
  // agent -> model -> mcp-server graph OKF consumers can traverse. Links are
  // relative rather than bundle-absolute: the spec allows both but Google's
  // reference visualizer only follows relative links.
  sections.push(
    `Uses model [${modelRef?.name || 'default'}](../models/${
      modelRef?.name || 'default'
    }.md).`
  );

  const tools = (spec.tools as {type?: string; name?: string}[]) || [];
  if (tools.length > 0) {
    const toolLines = tools.map((tool) => {
      const serverName = tool.name ? toolToMcpServer.get(tool.name) : undefined;
      const suffix = serverName
        ? ` (served by [${serverName}](../mcpservers/${serverName}.md))`
        : '';
      return `* \`${tool.name}\` - ${tool.type} tool${suffix}`;
    });
    sections.push(`# Tools\n\n${toolLines.join('\n')}`);
  }

  if (typeof spec.prompt === 'string' && spec.prompt) {
    sections.push(`# Prompt\n\n\`\`\`\n${spec.prompt.trim()}\n\`\`\``);
  }

  return {
    id: `agents/${agent.metadata.name}`,
    frontmatter: baseFrontmatter('Ark Agent', agent, ['agent']),
    body: sections.join('\n\n'),
  };
}

function teamConcept(team: ArkResource): Concept {
  const spec = team.spec || {};
  const members = (spec.members as {name?: string; type?: string}[]) || [];
  const memberLines = members.map((member) => {
    const dir = member.type === 'team' ? '.' : '../agents';
    return `* [${member.name}](${dir}/${member.name}.md) (${member.type})`;
  });
  const sections = [
    `Strategy: \`${spec.strategy || 'unknown'}\`.`,
    `# Members\n\n${memberLines.join('\n')}`,
  ];
  return {
    id: `teams/${team.metadata.name}`,
    frontmatter: baseFrontmatter('Ark Team', team, ['team']),
    body: sections.join('\n\n'),
  };
}

function mcpServerConcept(server: ArkResource, toolNames: string[]): Concept {
  const spec = server.spec || {};
  const status = server.status || {};
  // Address only - headers may reference secrets so they are never exported.
  const address =
    (status.resolvedAddress as string | undefined) ||
    (spec.address as {value?: string} | undefined)?.value ||
    'unresolved';
  const sections = [
    `Transport: \`${spec.transport || 'http'}\`. Address: \`${address}\`.`,
  ];
  if (toolNames.length > 0) {
    const toolLines = toolNames.map((name) => `* \`${name}\``);
    sections.push(`# Tools\n\n${toolLines.join('\n')}`);
  }
  return {
    id: `mcpservers/${server.metadata.name}`,
    frontmatter: baseFrontmatter('Ark MCP Server', server, ['mcp']),
    body: sections.join('\n\n'),
  };
}

function indexDocument(concepts: Concept[]): string {
  const sections = new Map<string, string[]>();
  for (const concept of concepts) {
    const group = path.dirname(concept.id);
    const entries = sections.get(group) || [];
    const description =
      (concept.frontmatter.description as string | undefined) ||
      (concept.frontmatter.type as string);
    entries.push(
      `* [${concept.frontmatter.title}](${concept.id}.md) - ${description}`
    );
    sections.set(group, entries);
  }
  const titles: Record<string, string> = {
    agents: 'Agents',
    models: 'Models',
    teams: 'Teams',
    mcpservers: 'MCP Servers',
  };
  // Root index.md is the one place frontmatter is allowed to declare the
  // bundle's OKF version (spec section 11).
  const parts = [`---\nokf_version: "${OKF_VERSION}"\n---`];
  for (const [group, entries] of sections) {
    parts.push(`# ${titles[group] || group}\n\n${entries.join('\n')}`);
  }
  return `${parts.join('\n\n')}\n`;
}

function logDocument(conceptCount: number): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    '# Directory Update Log',
    '',
    `## ${today}`,
    `* **Initialization**: Exported ${conceptCount} concepts from the Ark cluster via \`ark okf export\`.`,
    '',
  ].join('\n');
}

async function exportOkfBundle(options: OkfExportOptions) {
  try {
    output.info(`exporting ark resources as an OKF bundle to ${options.output}...`);

    const listOptions = {namespace: options.namespace};
    const [agents, models, teams, mcpServers, tools] = await Promise.all([
      listResources<ArkResource>('agents', listOptions),
      listResources<ArkResource>('models', listOptions),
      listResources<ArkResource>('teams', listOptions),
      listResources<ArkResource>('mcpservers', listOptions),
      listResources<ArkResource>('tools', listOptions),
    ]);

    // Agents reference MCP tools by Tool CR name; resolve each back to its
    // server so agent documents can link agents -> mcpservers directly.
    const toolToMcpServer = new Map<string, string>();
    const mcpServerTools = new Map<string, string[]>();
    for (const tool of tools) {
      const mcpRef = tool.spec?.mcp as
        | {mcpServerRef?: {name?: string}; toolName?: string}
        | undefined;
      const serverName = mcpRef?.mcpServerRef?.name;
      if (!serverName) continue;
      toolToMcpServer.set(tool.metadata.name, serverName);
      const names = mcpServerTools.get(serverName) || [];
      names.push(tool.metadata.name);
      mcpServerTools.set(serverName, names);
    }

    const concepts: Concept[] = [
      ...models.map(modelConcept),
      ...agents.map((agent) => agentConcept(agent, toolToMcpServer)),
      ...teams.map(teamConcept),
      ...mcpServers.map((server) =>
        mcpServerConcept(server, mcpServerTools.get(server.metadata.name) || [])
      ),
    ];

    if (concepts.length === 0) {
      output.warning('no resources found to export');
      return;
    }

    for (const concept of concepts) {
      const filePath = path.join(options.output, `${concept.id}.md`);
      await fs.mkdir(path.dirname(filePath), {recursive: true});
      await fs.writeFile(filePath, conceptDocument(concept), 'utf-8');
    }
    await fs.writeFile(
      path.join(options.output, 'index.md'),
      indexDocument(concepts),
      'utf-8'
    );
    await fs.writeFile(
      path.join(options.output, 'log.md'),
      logDocument(concepts.length),
      'utf-8'
    );

    output.success(
      `exported ${concepts.length} concepts to OKF bundle at ${options.output}`
    );
  } catch (error) {
    output.error(
      'okf export failed:',
      error instanceof Error ? error.message : error
    );
  }
}

export function createOkfCommand(_config: ArkConfig): Command {
  const okfCommand = new Command('okf');
  okfCommand.description(
    'work with Open Knowledge Format (OKF) bundles - https://github.com/GoogleCloudPlatform/knowledge-catalog'
  );

  okfCommand
    .command('export')
    .description('export ARK resources as an OKF knowledge bundle')
    .option('-o, --output <dir>', 'output bundle directory', './ark-okf-bundle')
    .option('-n, --namespace <namespace>', 'namespace to export from')
    .action(async (options: OkfExportOptions) => {
      await exportOkfBundle(options);
    });

  return okfCommand;
}
