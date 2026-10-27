import type { AgentHeader, AgentOverride } from '@/lib/services';
import type { Tool } from '@/lib/services/tools';
import { generateUUID } from '@/lib/utils/uuid';

export const MCP_RESOURCE_TYPE = 'mcpserver';

export const MCP_SERVER_LABEL = 'mcp/server';

export const ALL_MCP_SERVERS_LABEL = 'All MCP servers';

export const ALL_MCP_SERVERS_VALUE = '__all_mcp_servers__';

export type McpHeaderSource = 'secret' | 'value';

export interface McpHeaderRow {
  id: string;
  serverName?: string;
  name: string;
  source: McpHeaderSource;
  value: string;
  secretName: string;
  secretKey: string;
}

export interface LockedMcpHeader {
  id: string;
  serverName?: string;
  header: AgentHeader;
}

export interface McpHeaderOverridesState {
  rows: McpHeaderRow[];
  lockedHeaders: LockedMcpHeader[];
  preservedOverrides: AgentOverride[];
}

export interface McpHeaderRowError {
  nameError?: string;
  valueError?: string;
}

export type McpScope =
  | { kind: 'all' }
  | { kind: 'server'; serverName: string }
  | { kind: 'selector'; label: string };

export const EMPTY_MCP_HEADER_OVERRIDES: McpHeaderOverridesState = {
  rows: [],
  lockedHeaders: [],
  preservedOverrides: [],
};

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

export function createMcpHeaderRow(serverName?: string): McpHeaderRow {
  return {
    id: generateUUID(),
    serverName,
    name: '',
    source: 'secret',
    value: '',
    secretName: '',
    secretKey: '',
  };
}

export function isBlankMcpHeaderRow(row: McpHeaderRow): boolean {
  const hasValue =
    !!row.value.trim() || !!row.secretName.trim() || !!row.secretKey.trim();
  return !hasValue && !row.name.trim();
}

export function isMcpOverride(override: AgentOverride): boolean {
  return override.resourceType === MCP_RESOURCE_TYPE;
}

export function getMcpScope(override: AgentOverride): McpScope {
  const matchLabels = override.labelSelector?.matchLabels ?? {};
  const labelKeys = Object.keys(matchLabels);
  const expressions = override.labelSelector?.matchExpressions ?? [];

  if (labelKeys.length === 0 && expressions.length === 0) {
    return { kind: 'all' };
  }
  if (
    expressions.length === 0 &&
    labelKeys.length === 1 &&
    labelKeys[0] === MCP_SERVER_LABEL &&
    matchLabels[MCP_SERVER_LABEL]
  ) {
    return { kind: 'server', serverName: matchLabels[MCP_SERVER_LABEL] };
  }

  const labelParts = labelKeys.map(key => `${key}=${matchLabels[key]}`);
  const expressionParts = expressions.map(
    expression =>
      `${expression.key} ${expression.operator}${
        expression.values?.length ? ` (${expression.values.join(', ')})` : ''
      }`,
  );
  return {
    kind: 'selector',
    label: [...labelParts, ...expressionParts].join(', '),
  };
}

function headerToRow(
  header: AgentHeader,
  serverName?: string,
): McpHeaderRow | null {
  const valueFrom = header.value.valueFrom;
  if (valueFrom?.secretKeyRef) {
    return {
      ...createMcpHeaderRow(serverName),
      name: header.name,
      secretName: valueFrom.secretKeyRef.name,
      secretKey: valueFrom.secretKeyRef.key,
    };
  }
  if (!valueFrom) {
    return {
      ...createMcpHeaderRow(serverName),
      name: header.name,
      source: 'value',
      value: header.value.value ?? '',
    };
  }
  return null;
}

function rowToHeader(row: McpHeaderRow, name = row.name.trim()): AgentHeader {
  if (row.source === 'value') {
    return { name, value: { value: row.value } };
  }
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

export function splitMcpOverrides(
  overrides: AgentOverride[] | null | undefined,
): McpHeaderOverridesState {
  const state: McpHeaderOverridesState = {
    rows: [],
    lockedHeaders: [],
    preservedOverrides: [],
  };

  for (const override of overrides ?? []) {
    if (!isMcpOverride(override)) continue;

    const scope = getMcpScope(override);
    if (scope.kind === 'selector') {
      state.preservedOverrides.push(override);
      continue;
    }

    const serverName = scope.kind === 'server' ? scope.serverName : undefined;
    for (const header of override.headers) {
      const row = headerToRow(header, serverName);
      if (row) {
        state.rows.push(row);
      } else {
        state.lockedHeaders.push({ id: generateUUID(), serverName, header });
      }
    }
  }

  return state;
}

function scopeKey(serverName?: string): string {
  return serverName ?? '';
}

function groupedOverrides(
  entries: { serverName?: string; header: AgentHeader }[],
): AgentOverride[] {
  const groups = new Map<string, AgentHeader[]>();
  for (const entry of entries) {
    const key = scopeKey(entry.serverName);
    groups.set(key, [...(groups.get(key) ?? []), entry.header]);
  }

  return Array.from(groups.keys())
    .sort((a, b) => a.localeCompare(b))
    .map(key => {
      const override: AgentOverride = {
        resourceType: MCP_RESOURCE_TYPE,
        headers: groups.get(key) ?? [],
      };
      if (key) {
        override.labelSelector = { matchLabels: { [MCP_SERVER_LABEL]: key } };
      }
      return override;
    });
}

export function buildMcpOverrides(
  state: McpHeaderOverridesState,
): AgentOverride[] {
  const entries = [
    ...state.rows
      .filter(row => !isBlankMcpHeaderRow(row))
      .map(row => ({ serverName: row.serverName, header: rowToHeader(row) })),
    ...state.lockedHeaders,
  ];
  return [...groupedOverrides(entries), ...state.preservedOverrides];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export type HeaderNamesForServer = (serverName?: string) => string[];

function hasHeaderName(names: string[], name: string): boolean {
  const key = normalizeName(name);
  return names.some(candidate => normalizeName(candidate) === key);
}

export function validateMcpHeaderRows(
  rows: McpHeaderRow[],
  lockedHeaders: LockedMcpHeader[] = [],
  namesForServer?: HeaderNamesForServer,
): Record<string, McpHeaderRowError> {
  const errors: Record<string, McpHeaderRowError> = {};
  const seen = new Map<string, Set<string>>();
  const namesIn = (serverName?: string) => {
    const key = scopeKey(serverName);
    const names = seen.get(key) ?? new Set<string>();
    seen.set(key, names);
    return names;
  };
  const hiddenNames = new Set(
    lockedHeaders.map(
      locked =>
        `${scopeKey(locked.serverName)}::${normalizeName(locked.header.name)}`,
    ),
  );

  for (const row of rows) {
    if (isBlankMcpHeaderRow(row)) continue;

    const error: McpHeaderRowError = {};
    const name = normalizeName(row.name);
    if (!name) {
      error.nameError = 'Header name is required';
    } else if (hiddenNames.has(`${scopeKey(row.serverName)}::${name}`)) {
      error.nameError = 'Already set outside the dashboard';
    } else if (
      namesForServer &&
      !hasHeaderName(namesForServer(row.serverName), name)
    ) {
      const scope = row.serverName ?? 'the selected MCP servers';
      error.nameError = `Not a header of ${scope}`;
    } else {
      const names = namesIn(row.serverName);
      if (names.has(name)) {
        error.nameError = 'Header name must be unique per MCP server';
      }
      names.add(name);
    }

    if (row.source === 'value' && !row.value.trim()) {
      error.valueError = 'Header value is required';
    }
    if (
      row.source === 'secret' &&
      (!row.secretName.trim() || !row.secretKey.trim())
    ) {
      error.valueError = 'Select a secret';
    }

    if (error.nameError || error.valueError) {
      errors[row.id] = error;
    }
  }

  return errors;
}

export function removeServerRows(
  rows: McpHeaderRow[],
  removedServers: string[],
): McpHeaderRow[] {
  const removed = new Set(removedServers);
  const kept = rows.filter(
    row => !row.serverName || !removed.has(row.serverName),
  );
  return kept.length === rows.length ? rows : kept;
}

export function serverHeaderNames(
  serverName: string | undefined,
  serverNames: string[],
  headerNamesByServer: Record<string, string[]>,
): string[] {
  const servers = serverName ? [serverName] : serverNames;
  return servers.flatMap(server => headerNamesByServer[server] ?? []);
}

export function serverChangeUpdates(
  row: McpHeaderRow,
  serverName: string | undefined,
  names: string[],
): Partial<McpHeaderRow> {
  return hasHeaderName(names, row.name)
    ? { serverName }
    : { serverName, name: '' };
}

export function headerNameOptions(
  row: McpHeaderRow,
  rows: McpHeaderRow[],
  names: string[],
): string[] {
  const taken = new Set(
    rows
      .filter(
        other =>
          other.id !== row.id &&
          scopeKey(other.serverName) === scopeKey(row.serverName),
      )
      .map(other => normalizeName(other.name)),
  );
  const options = new Map<string, string>();
  for (const name of names) {
    const key = normalizeName(name);
    if (key && !taken.has(key) && !options.has(key)) options.set(key, name);
  }
  const current = row.name.trim();
  if (current && !options.has(normalizeName(current))) {
    options.set(normalizeName(current), current);
  }
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b));
}

export interface AgentMcpHeader {
  id: string;
  name: string;
  scope: McpScope;
}

export function agentMcpHeaders(
  overrides: AgentOverride[] | null | undefined,
): AgentMcpHeader[] {
  return (overrides ?? [])
    .filter(isMcpOverride)
    .flatMap((override, overrideIndex) => {
      const scope = getMcpScope(override);
      return override.headers.map((header, headerIndex) => ({
        id: `agent-${overrideIndex}-${headerIndex}`,
        name: header.name,
        scope,
      }));
    });
}

function rowReaches(row: McpHeaderRow, scope: McpScope): boolean {
  if (!row.serverName) return true;
  return (
    scope.kind === 'all' ||
    (scope.kind === 'server' && scope.serverName === row.serverName)
  );
}

export function buildQueryMcpOverrides(
  rows: McpHeaderRow[],
  agentHeaders: AgentMcpHeader[],
): AgentOverride[] {
  const entries = rows
    .filter(row => !isBlankMcpHeaderRow(row))
    .map(row => {
      const agentHeader = agentHeaders.find(
        header =>
          normalizeName(header.name) === normalizeName(row.name) &&
          rowReaches(row, header.scope),
      );
      return {
        serverName: row.serverName,
        header: rowToHeader(row, agentHeader?.name ?? row.name.trim()),
      };
    });
  return groupedOverrides(entries);
}
