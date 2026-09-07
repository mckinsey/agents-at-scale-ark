'use client';

import type { components } from '@/lib/api/generated/types';
import type { Tool } from '@/lib/services/tools';
import { generateUUID } from '@/lib/utils/uuid';

type AgentOverride = components['schemas']['AgentOverride'];
type AgentHeader = components['schemas']['AgentHeader'];

export const MCP_RESOURCE_TYPE = 'mcpserver';

export const MCP_SERVER_LABEL = 'mcp/server';

export const ALL_MCP_SERVERS_LABEL = 'All MCP servers';

export const ALL_MCP_SERVERS_VALUE = '__all_mcp_servers__';

export type McpHeaderSource =
  | 'secretKeyRef'
  | 'value'
  | 'queryParameterRef'
  | 'configMapKeyRef';

export interface McpHeaderRow {
  id: string;
  name: string;
  source: McpHeaderSource;
  value: string;
  secretName: string;
  secretKey: string;
  configMapName: string;
  configMapKey: string;
  queryParameterName: string;
  serverName?: string;
}

export interface McpLabelRow {
  id: string;
  key: string;
  value: string;
}

export interface McpOverrideGroup {
  id: string;
  matchLabels: McpLabelRow[];
  headers: McpHeaderRow[];
  serverName?: string;
}

export function createHeaderRow(
  source: McpHeaderSource = 'secretKeyRef',
  serverName?: string,
): McpHeaderRow {
  return {
    id: generateUUID(),
    name: '',
    source,
    value: '',
    secretName: '',
    secretKey: '',
    configMapName: '',
    configMapKey: '',
    queryParameterName: '',
    serverName,
  };
}

export function createOverrideGroup(): McpOverrideGroup {
  return {
    id: generateUUID(),
    matchLabels: [],
    headers: [createHeaderRow()],
  };
}

export function createServerGroup(serverName: string): McpOverrideGroup {
  return {
    id: generateUUID(),
    matchLabels: [],
    headers: [createHeaderRow('secretKeyRef', serverName)],
    serverName,
  };
}

export function isUnconfiguredHeaderRow(row: McpHeaderRow): boolean {
  return (
    !row.name.trim() &&
    !row.value.trim() &&
    !row.secretName.trim() &&
    !row.secretKey.trim() &&
    !row.configMapName.trim() &&
    !row.configMapKey.trim() &&
    !row.queryParameterName.trim()
  );
}

function isLabelRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getMcpServerName(tool: Tool): string | null {
  if (tool.type !== 'mcp' || !isLabelRecord(tool.labels)) return null;
  const serverName = tool.labels[MCP_SERVER_LABEL];
  return typeof serverName === 'string' && serverName.length > 0
    ? serverName
    : null;
}

export function mcpServerNamesFromTools(tools: Tool[]): string[] {
  const names = new Set<string>();
  for (const tool of tools) {
    const serverName = getMcpServerName(tool);
    if (serverName) names.add(serverName);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function reconcileServerGroups(
  groups: McpOverrideGroup[],
  serverNames: string[],
): McpOverrideGroup[] {
  const wanted = new Set(serverNames);

  const kept = groups.filter(group => {
    if (!group.serverName || wanted.has(group.serverName)) return true;
    return !group.headers.every(isUnconfiguredHeaderRow);
  });

  const present = new Set(
    kept
      .map(group => group.serverName)
      .filter((name): name is string => name !== undefined),
  );

  const added = serverNames
    .filter(name => !present.has(name))
    .map(createServerGroup);

  if (added.length === 0 && kept.length === groups.length) return groups;
  return [...kept, ...added];
}

export function describeScope(group: McpOverrideGroup): string {
  const labels = group.matchLabels.filter(label => label.key.trim());
  if (labels.length === 0) return ALL_MCP_SERVERS_LABEL;
  return labels.map(label => `${label.key}=${label.value}`).join(', ');
}

export function addHeaderRow(groups: McpOverrideGroup[]): McpOverrideGroup[] {
  const unscoped = groups.filter(
    group => !group.serverName && group.matchLabels.length === 0,
  );
  const target = unscoped[unscoped.length - 1];

  if (!target) return [...groups, createOverrideGroup()];

  return groups.map(group =>
    group.id === target.id
      ? { ...group, headers: [...group.headers, createHeaderRow()] }
      : group,
  );
}

function headerToRow(header: AgentHeader): McpHeaderRow {
  const row = createHeaderRow('value');
  row.name = header.name;

  const valueFrom = header.value?.valueFrom;
  if (valueFrom?.secretKeyRef) {
    row.source = 'secretKeyRef';
    row.secretName = valueFrom.secretKeyRef.name;
    row.secretKey = valueFrom.secretKeyRef.key;
    return row;
  }
  if (valueFrom?.configMapKeyRef) {
    row.source = 'configMapKeyRef';
    row.configMapName = valueFrom.configMapKeyRef.name;
    row.configMapKey = valueFrom.configMapKeyRef.key;
    return row;
  }
  if (valueFrom?.queryParameterRef) {
    row.source = 'queryParameterRef';
    row.queryParameterName = valueFrom.queryParameterRef.name;
    return row;
  }

  row.source = 'value';
  row.value = header.value?.value ?? '';
  return row;
}

function rowToHeader(row: McpHeaderRow): AgentHeader | null {
  const name = row.name.trim();
  if (!name) return null;

  switch (row.source) {
    case 'secretKeyRef': {
      if (!row.secretName.trim() || !row.secretKey.trim()) return null;
      return {
        name,
        value: {
          valueFrom: {
            secretKeyRef: {
              name: row.secretName.trim(),
              key: row.secretKey.trim(),
            },
          },
        },
      };
    }
    case 'configMapKeyRef': {
      if (!row.configMapName.trim() || !row.configMapKey.trim()) return null;
      return {
        name,
        value: {
          valueFrom: {
            configMapKeyRef: {
              name: row.configMapName.trim(),
              key: row.configMapKey.trim(),
            },
          },
        },
      };
    }
    case 'queryParameterRef': {
      if (!row.queryParameterName.trim()) return null;
      return {
        name,
        value: {
          valueFrom: {
            queryParameterRef: { name: row.queryParameterName.trim() },
          },
        },
      };
    }
    default: {
      if (!row.value) return null;
      return { name, value: { value: row.value } };
    }
  }
}

export function overridesToGroups(
  overrides: AgentOverride[] | null | undefined,
): McpOverrideGroup[] {
  if (!overrides) return [];

  return overrides
    .filter(override => override.resourceType === MCP_RESOURCE_TYPE)
    .map(override => ({
      id: generateUUID(),
      matchLabels: Object.entries(
        override.labelSelector?.matchLabels ?? {},
      ).map(([key, value]) => ({ id: generateUUID(), key, value })),
      headers: (override.headers ?? []).map(headerToRow),
    }));
}

export function groupsToOverrides(
  groups: McpOverrideGroup[],
): AgentOverride[] {
  return groups.reduce<AgentOverride[]>((acc, group) => {
    const headers = group.headers
      .map(rowToHeader)
      .filter((header): header is AgentHeader => header !== null);

    if (headers.length === 0) return acc;

    const labels = group.matchLabels.filter(label => label.key.trim());
    const override: AgentOverride = {
      resourceType: MCP_RESOURCE_TYPE,
      headers,
    };

    if (labels.length > 0) {
      override.labelSelector = {
        matchLabels: Object.fromEntries(
          labels.map(label => [label.key.trim(), label.value.trim()]),
        ),
      };
    }

    acc.push(override);
    return acc;
  }, []);
}

export function countHeaders(groups: McpOverrideGroup[]): number {
  return groups.reduce((total, group) => total + group.headers.length, 0);
}

export function overrideGroupsEqual(
  a: McpOverrideGroup[],
  b: McpOverrideGroup[],
): boolean {
  return (
    JSON.stringify(groupsToOverrides(a)) === JSON.stringify(groupsToOverrides(b))
  );
}

export function headerIdentity(group: McpOverrideGroup, name: string): string {
  return `${describeScope(group)}::${name.trim().toLowerCase()}`;
}
