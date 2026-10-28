import { describe, expect, it } from 'vitest';

import type { AgentHeader, AgentOverride } from '@/lib/services';
import type { Tool } from '@/lib/services/tools';
import {
  MCP_RESOURCE_TYPE,
  MCP_SERVER_LABEL,
  type McpHeaderRow,
  buildMcpOverrides,
  createMcpHeaderRow,
  getMcpScope,
  getMcpServerName,
  headerNameOptions,
  mcpServerNamesFromTools,
  removeServerRows,
  serverChangeUpdates,
  serverHeaderNames,
  splitMcpOverrides,
  validateMcpHeaderRows,
} from '@/lib/utils/mcp-header-overrides';

const secretHeader: AgentHeader = {
  name: 'X-Token',
  value: { valueFrom: { secretKeyRef: { name: 'creds', key: 'token' } } },
};
const directHeader: AgentHeader = { name: 'X-Region', value: { value: 'eu' } };
const configMapHeader: AgentHeader = {
  name: 'X-Tenant',
  value: { valueFrom: { configMapKeyRef: { name: 'cfg', key: 'tenant' } } },
};

function serverOverride(
  serverName: string,
  headers: AgentHeader[],
): AgentOverride {
  return {
    resourceType: MCP_RESOURCE_TYPE,
    headers,
    labelSelector: { matchLabels: { [MCP_SERVER_LABEL]: serverName } },
  };
}

function row(overrides: Partial<McpHeaderRow>): McpHeaderRow {
  return { ...createMcpHeaderRow(), ...overrides };
}

describe('MCP server names', () => {
  const mcpTool = (id: string, labels: unknown): Tool => ({
    id,
    name: id,
    type: 'mcp',
    labels,
  });

  it('reads the server label only from MCP tools', () => {
    expect(getMcpServerName(mcpTool('a', { [MCP_SERVER_LABEL]: 'jira' }))).toBe(
      'jira',
    );
    expect(getMcpServerName(mcpTool('b', null))).toBeNull();
    expect(
      getMcpServerName(mcpTool('c', { [MCP_SERVER_LABEL]: '' })),
    ).toBeNull();
    expect(
      getMcpServerName({
        id: 'd',
        name: 'd',
        labels: { [MCP_SERVER_LABEL]: 'x' },
      }),
    ).toBeNull();
  });

  it('dedupes and sorts server names', () => {
    expect(
      mcpServerNamesFromTools([
        mcpTool('a', { [MCP_SERVER_LABEL]: 'jira' }),
        mcpTool('b', { [MCP_SERVER_LABEL]: 'github' }),
        mcpTool('c', { [MCP_SERVER_LABEL]: 'jira' }),
        mcpTool('d', undefined),
      ]),
    ).toEqual(['github', 'jira']);
  });
});

describe('getMcpScope', () => {
  it('detects all, server and selector scopes', () => {
    expect(
      getMcpScope({ resourceType: MCP_RESOURCE_TYPE, headers: [] }),
    ).toEqual({ kind: 'all' });
    expect(getMcpScope(serverOverride('jira', []))).toEqual({
      kind: 'server',
      serverName: 'jira',
    });
    expect(
      getMcpScope({
        resourceType: MCP_RESOURCE_TYPE,
        headers: [],
        labelSelector: {
          matchLabels: { team: 'a' },
          matchExpressions: [
            { key: 'env', operator: 'In', values: ['dev', 'qa'] },
            { key: 'beta', operator: 'Exists' },
          ],
        },
      }),
    ).toEqual({
      kind: 'selector',
      label: 'team=a, env In (dev, qa), beta Exists',
    });
  });
});

describe('splitMcpOverrides and buildMcpOverrides', () => {
  const selectorOverride: AgentOverride = {
    resourceType: MCP_RESOURCE_TYPE,
    headers: [directHeader],
    labelSelector: { matchLabels: { team: 'a' } },
  };
  const modelOverride: AgentOverride = {
    resourceType: 'model',
    headers: [directHeader],
  };

  it('splits editable rows, locked headers and preserved selectors', () => {
    const state = splitMcpOverrides([
      { resourceType: MCP_RESOURCE_TYPE, headers: [directHeader] },
      serverOverride('jira', [secretHeader, configMapHeader]),
      selectorOverride,
      modelOverride,
    ]);

    expect(state.rows).toEqual([
      expect.objectContaining({
        name: 'X-Region',
        source: 'value',
        value: 'eu',
      }),
      expect.objectContaining({
        serverName: 'jira',
        name: 'X-Token',
        source: 'secret',
        secretName: 'creds',
        secretKey: 'token',
      }),
    ]);
    expect(state.lockedHeaders).toEqual([
      expect.objectContaining({ serverName: 'jira', header: configMapHeader }),
    ]);
    expect(state.preservedOverrides).toEqual([selectorOverride]);
    expect(splitMcpOverrides(null).rows).toEqual([]);
  });

  it('rebuilds the overrides grouped by server and drops blank rows', () => {
    const state = splitMcpOverrides([
      serverOverride('jira', [secretHeader, configMapHeader]),
      { resourceType: MCP_RESOURCE_TYPE, headers: [directHeader] },
      selectorOverride,
    ]);
    state.rows.push(createMcpHeaderRow('jira'));

    expect(buildMcpOverrides(state)).toEqual([
      { resourceType: MCP_RESOURCE_TYPE, headers: [directHeader] },
      serverOverride('jira', [secretHeader, configMapHeader]),
      selectorOverride,
    ]);
  });
});

describe('validateMcpHeaderRows', () => {
  it('reports one error per invalid row', () => {
    const rows = [
      row({ id: 'blank' }),
      row({ id: 'no-name', source: 'value', value: 'v' }),
      row({
        id: 'locked',
        serverName: 'jira',
        name: 'x-tenant',
        source: 'value',
        value: 'v',
      }),
      row({
        id: 'unknown',
        serverName: 'jira',
        name: 'X-Nope',
        source: 'value',
        value: 'v',
      }),
      row({
        id: 'first',
        serverName: 'jira',
        name: 'X-Token',
        secretName: 's',
        secretKey: 'k',
      }),
      row({
        id: 'dup',
        serverName: 'jira',
        name: 'x-token',
        secretName: 's',
        secretKey: 'k',
      }),
      row({ id: 'no-value', name: 'X-Token', source: 'value' }),
      row({ id: 'no-secret', name: 'X-Other', secretName: 's' }),
    ];
    const errors = validateMcpHeaderRows(
      rows,
      [{ id: 'l', serverName: 'jira', header: configMapHeader }],
      serverName =>
        serverName ? ['X-Token', 'X-Tenant'] : ['X-Token', 'X-Other'],
    );

    expect(errors).toEqual({
      'no-name': { nameError: 'Header name is required' },
      locked: { nameError: 'Already set outside the dashboard' },
      unknown: { nameError: 'Not a header of jira' },
      dup: { nameError: 'Header name must be unique per MCP server' },
      'no-value': { valueError: 'Header value is required' },
      'no-secret': { valueError: 'Select a secret' },
    });
  });

  it('names all servers when a row has no server', () => {
    const errors = validateMcpHeaderRows(
      [row({ id: 'a', name: 'X-Nope', source: 'value', value: 'v' })],
      [],
      () => [],
    );
    expect(errors.a.nameError).toBe('Not a header of the selected MCP servers');
  });
});

describe('row helpers', () => {
  it('removes rows of removed servers and keeps the array otherwise', () => {
    const rows = [
      row({ serverName: 'jira' }),
      row({}),
      row({ serverName: 'github' }),
    ];
    expect(removeServerRows(rows, ['jira'])).toEqual([rows[1], rows[2]]);
    expect(removeServerRows(rows, ['slack'])).toBe(rows);
  });

  it('collects header names for one server or all of them', () => {
    const byServer = { jira: ['X-Token'], github: ['X-Gh'] };
    expect(serverHeaderNames('jira', ['jira', 'github'], byServer)).toEqual([
      'X-Token',
    ]);
    expect(
      serverHeaderNames(undefined, ['jira', 'github', 'slack'], byServer),
    ).toEqual(['X-Token', 'X-Gh']);
  });

  it('clears the name when the new server lacks it', () => {
    const current = row({ name: 'x-token' });
    expect(serverChangeUpdates(current, 'jira', ['X-Token'])).toEqual({
      serverName: 'jira',
    });
    expect(serverChangeUpdates(current, 'github', ['X-Gh'])).toEqual({
      serverName: 'github',
      name: '',
    });
  });

  it('offers names not taken on the same server and keeps the current one', () => {
    const current = row({ id: 'a', serverName: 'jira', name: 'X-Custom' });
    const rows = [
      current,
      row({ id: 'b', serverName: 'jira', name: 'x-token' }),
      row({ id: 'c', serverName: 'github', name: 'X-Region' }),
    ];
    expect(
      headerNameOptions(current, rows, [
        'X-Token',
        'X-Region',
        'x-region',
        ' ',
      ]),
    ).toEqual(['X-Custom', 'X-Region']);
  });
});
