import { describe, expect, it } from 'vitest';

import type { AgentHeader, AgentOverride } from '@/lib/services';
import type { Tool } from '@/lib/services/tools';
import {
  MCP_RESOURCE_TYPE,
  MCP_SERVER_SELECTOR_LABEL,
  MCP_TOOL_SERVER_LABEL,
  type McpHeaderRow,
  buildMcpOverrides,
  createMcpHeaderRow,
  getMcpScope,
  getMcpServerName,
  getServerTargetIssue,
  headerNameOptions,
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
    labelSelector: {
      matchLabels: { [MCP_SERVER_SELECTOR_LABEL]: serverName },
    },
  };
}

function row(overrides: Partial<McpHeaderRow>): McpHeaderRow {
  return { ...createMcpHeaderRow(), ...overrides };
}

describe('labels', () => {
  it('reads the server of a tool from the tool label', () => {
    const tool: Tool = {
      id: 'a',
      name: 'a',
      type: 'mcp',
      labels: { [MCP_TOOL_SERVER_LABEL]: 'jira' },
    };
    expect(getMcpServerName(tool)).toBe('jira');
  });

  it('targets one server only with the name label', () => {
    expect(getMcpScope(serverOverride('jira', []))).toEqual({
      kind: 'server',
      serverName: 'jira',
    });
    expect(
      getMcpScope({
        resourceType: MCP_RESOURCE_TYPE,
        headers: [],
        labelSelector: { matchLabels: { [MCP_TOOL_SERVER_LABEL]: 'jira' } },
      }),
    ).toEqual({ kind: 'selector', label: 'mcp/server=jira' });
  });
});

describe('splitMcpOverrides and buildMcpOverrides', () => {
  it('round-trips rows, locked headers and other selectors', () => {
    const selectorOverride: AgentOverride = {
      resourceType: MCP_RESOURCE_TYPE,
      headers: [directHeader],
      labelSelector: { matchLabels: { team: 'a' } },
    };
    const state = splitMcpOverrides([
      serverOverride('jira', [secretHeader, configMapHeader]),
      { resourceType: MCP_RESOURCE_TYPE, headers: [directHeader] },
      selectorOverride,
      { resourceType: 'model', headers: [directHeader] },
    ]);

    expect(state.rows.map(r => [r.serverName, r.name])).toEqual([
      ['jira', 'X-Token'],
      [undefined, 'X-Region'],
    ]);
    expect(state.lockedHeaders).toEqual([
      expect.objectContaining({ serverName: 'jira', header: configMapHeader }),
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
  it('reports required, unknown, hidden and server errors', () => {
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
      row({ id: 'no-secret', name: 'X-Token', secretName: 's' }),
      row({
        id: 'old-server',
        serverName: 'legacy',
        name: 'X-Tenant',
        source: 'value',
        value: 'v',
      }),
    ];
    const lockedHeaders = [
      { id: 'l', serverName: 'jira', header: configMapHeader },
    ];
    const namesForServer = () => ['X-Token', 'X-Tenant'];
    const serverIssueFor = (serverName: string) =>
      serverName === 'legacy' ? 'Needs the name label' : undefined;

    expect(
      validateMcpHeaderRows(
        rows,
        lockedHeaders,
        namesForServer,
        serverIssueFor,
      ),
    ).toEqual({
      'no-name': { nameError: 'Header name is required' },
      locked: { nameError: 'Already set outside the dashboard' },
      unknown: { nameError: 'Not a header of jira' },
      'no-secret': { valueError: 'Select a secret' },
      'old-server': { serverError: 'Needs the name label' },
    });
    expect(
      validateMcpHeaderRows(
        rows,
        lockedHeaders,
        namesForServer,
        serverIssueFor,
        candidate => candidate.id !== 'no-name',
      ),
    ).toEqual({ 'no-name': { nameError: 'Header name is required' } });
  });

  it('treats All MCP servers as part of every server', () => {
    const value = { source: 'value' as const, value: 'v' };
    const rows = [
      row({ id: 'all', name: 'Authorization', ...value }),
      row({ id: 'jira', serverName: 'jira', name: 'authorization', ...value }),
      row({ id: 'gh', serverName: 'github', name: 'X-Id', ...value }),
      row({ id: 'gh-dup', serverName: 'github', name: 'x-id', ...value }),
      row({ id: 'other', serverName: 'jira', name: 'X-Id', ...value }),
    ];

    expect(validateMcpHeaderRows(rows)).toEqual({
      jira: { nameError: 'Already set for All MCP servers' },
      'gh-dup': { nameError: 'Header name must be unique per MCP server' },
    });
    expect(
      validateMcpHeaderRows(
        rows,
        [],
        undefined,
        undefined,
        candidate => candidate.id === 'jira',
      ),
    ).toEqual({
      all: { nameError: 'Already set for jira' },
      'gh-dup': { nameError: 'Header name must be unique per MCP server' },
    });
  });
});

describe('getServerTargetIssue', () => {
  const labelled = (name: string, label = name) => ({
    name,
    labels: { [MCP_SERVER_SELECTOR_LABEL]: label },
  });

  it('flags servers an override cannot select by name', () => {
    expect(getServerTargetIssue(labelled('jira'))).toBeNull();
    expect(getServerTargetIssue({ name: 'jira', labels: null })).toBe(
      'unlabelled',
    );
    expect(getServerTargetIssue({ name: 'x'.repeat(64) })).toBe(
      'name-too-long',
    );
    expect(
      getServerTargetIssue(labelled('jira'), [
        labelled('jira'),
        labelled('old', 'jira'),
      ]),
    ).toBe('ambiguous');
  });
});

describe('headerNameOptions', () => {
  it('hides names already set for the same server or for All MCP servers', () => {
    const current = row({ id: 'a', serverName: 'jira' });
    const rows = [
      current,
      row({ id: 'b', name: 'authorization' }),
      row({ id: 'c', serverName: 'github', name: 'X-Region' }),
    ];
    expect(
      headerNameOptions(current, rows, ['Authorization', 'X-Region']),
    ).toEqual(['X-Region']);
  });
});
