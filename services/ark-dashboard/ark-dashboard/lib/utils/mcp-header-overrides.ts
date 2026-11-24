import { ARK_LABELS } from '@/lib/constants/labels';
import type { AgentHeader, AgentOverride } from '@/lib/services';
import type { Tool } from '@/lib/services/tools';
import { generateUUID } from '@/lib/utils/uuid';

export const MCP_RESOURCE_TYPE = 'mcpserver';

export const MCP_TOOL_SERVER_LABEL = 'mcp/server';

export const MCP_SERVER_SELECTOR_LABEL = ARK_LABELS.NAME;

const MAX_LABEL_VALUE_LENGTH = 63;

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
  serverError?: string;
  nameError?: string;
  valueError?: string;
}

export interface McpServerTarget {
  name: string;
  labels?: Record<string, string> | null;
}

export type McpServerTargetIssue = 'unlabelled' | 'name-too-long' | 'ambiguous';

export const MCP_SERVER_TARGET_ISSUE_MESSAGES: Record<
  McpServerTargetIssue,
  string
> = {
  unlabelled: 'Needs the name label. Update the server once.',
  'name-too-long': 'Name longer than 63 characters',
  ambiguous: 'Another server uses this name label',
};

export type ServerIssueForServer = (serverName: string) => string | undefined;

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
  const serverName = tool.labels[MCP_TOOL_SERVER_LABEL];
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

export function getServerTargetIssue(
  server: McpServerTarget,
  servers: readonly McpServerTarget[] = [],
): McpServerTargetIssue | null {
  if (server.name.length > MAX_LABEL_VALUE_LENGTH) {
    return 'name-too-long';
  }
  if (server.labels?.[MCP_SERVER_SELECTOR_LABEL] !== server.name) {
    return 'unlabelled';
  }
  const claimedByAnother = servers.some(
    other =>
      other.name !== server.name &&
      other.labels?.[MCP_SERVER_SELECTOR_LABEL] === server.name,
  );
  return claimedByAnother ? 'ambiguous' : null;
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
    labelKeys[0] === MCP_SERVER_SELECTOR_LABEL &&
    matchLabels[MCP_SERVER_SELECTOR_LABEL]
  ) {
    return {
      kind: 'server',
      serverName: matchLabels[MCP_SERVER_SELECTOR_LABEL],
    };
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
        override.labelSelector = {
          matchLabels: { [MCP_SERVER_SELECTOR_LABEL]: key },
        };
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

interface ScopedHeaderName {
  serverName?: string;
  name: string;
}

function sharesServer(a?: string, b?: string): boolean {
  return !a || !b || a === b;
}

function duplicateNameError(conflictServer?: string): string {
  return `Already set for ${conflictServer ?? ALL_MCP_SERVERS_LABEL}`;
}

export type IsUnchangedRow = (row: McpHeaderRow) => boolean;

export function validateMcpHeaderRows(
  rows: McpHeaderRow[],
  lockedHeaders: LockedMcpHeader[] = [],
  namesForServer?: HeaderNamesForServer,
  serverIssueFor?: ServerIssueForServer,
  isUnchanged: IsUnchangedRow = () => false,
): Record<string, McpHeaderRowError> {
  const errors: Record<string, McpHeaderRowError> = {};
  const seen: ScopedHeaderName[] = rows
    .filter(row => !isBlankMcpHeaderRow(row) && isUnchanged(row))
    .map(row => ({ serverName: row.serverName, name: normalizeName(row.name) }))
    .filter(entry => entry.name);

  for (const row of rows) {
    if (isBlankMcpHeaderRow(row) || isUnchanged(row)) continue;

    const error: McpHeaderRowError = {};
    const serverError = row.serverName
      ? serverIssueFor?.(row.serverName)
      : undefined;
    if (serverError) error.serverError = serverError;

    const name = normalizeName(row.name);
    const hidden = lockedHeaders.some(
      locked =>
        sharesServer(locked.serverName, row.serverName) &&
        normalizeName(locked.header.name) === name,
    );
    const earlier = seen.find(
      other =>
        sharesServer(other.serverName, row.serverName) && other.name === name,
    );
    if (!name) {
      error.nameError = 'Header name is required';
    } else if (hidden) {
      error.nameError = 'Already set outside the dashboard';
    } else if (
      namesForServer &&
      !hasHeaderName(namesForServer(row.serverName), name)
    ) {
      const scope = row.serverName ?? 'the selected MCP servers';
      error.nameError = `Not a header of ${scope}`;
    } else if (earlier) {
      error.nameError =
        earlier.serverName === row.serverName
          ? 'Header name must be unique per MCP server'
          : duplicateNameError(earlier.serverName);
    }
    if (name) seen.push({ serverName: row.serverName, name });

    if (row.source === 'value' && !row.value.trim()) {
      error.valueError = 'Header value is required';
    }
    if (
      row.source === 'secret' &&
      (!row.secretName.trim() || !row.secretKey.trim())
    ) {
      error.valueError = 'Select a secret';
    }

    if (error.serverError || error.nameError || error.valueError) {
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
          other.id !== row.id && sharesServer(other.serverName, row.serverName),
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
