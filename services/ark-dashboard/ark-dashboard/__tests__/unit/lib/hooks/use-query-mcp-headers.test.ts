import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useQueryMcpHeaders } from '@/lib/hooks/use-query-mcp-headers';
import type { Agent } from '@/lib/services';
import {
  MCP_RESOURCE_TYPE,
  MCP_SERVER_SELECTOR_LABEL,
  MCP_TOOL_SERVER_LABEL,
} from '@/lib/utils/mcp-header-overrides';

const mockGetAllTools = vi.fn();

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services', () => ({
  toolsService: {
    getAll: (...args: unknown[]) => mockGetAllTools(...args),
  },
}));

vi.mock('@/lib/services/mcp-servers-hooks', () => ({
  useGetAllMcpServers: () => ({
    data: [
      {
        name: 'github',
        labels: { 'ark.mckinsey.com/name': 'github' },
        header_names: ['Authorization', 'X-Org-Id'],
      },
      { name: 'legacy', labels: {}, header_names: ['X-Token'] },
    ],
  }),
}));

const agent = {
  id: 'demo',
  name: 'demo',
  namespace: 'test-namespace',
  tools: [
    { type: 'mcp', name: 'github-tool' },
    { type: 'mcp', name: 'legacy-tool' },
  ],
  overrides: [
    {
      resourceType: MCP_RESOURCE_TYPE,
      labelSelector: {
        matchLabels: { [MCP_SERVER_SELECTOR_LABEL]: 'github' },
      },
      headers: [{ name: 'authorization', value: { value: 'agent' } }],
    },
  ],
} as Agent;

describe('useQueryMcpHeaders', () => {
  beforeEach(() => {
    mockGetAllTools.mockReset();
    mockGetAllTools.mockResolvedValue([
      {
        id: 'github-tool',
        name: 'github-tool',
        type: 'mcp',
        labels: { [MCP_TOOL_SERVER_LABEL]: 'github' },
      },
      {
        id: 'legacy-tool',
        name: 'legacy-tool',
        type: 'mcp',
        labels: { [MCP_TOOL_SERVER_LABEL]: 'legacy' },
      },
      { id: 'other', name: 'other', type: 'mcp', labels: {} },
    ]);
  });

  it('builds query overrides from the chat rows', async () => {
    const { result } = renderHook(() => useQueryMcpHeaders(agent));

    await waitFor(() =>
      expect(result.current.serverNames).toEqual(['github', 'legacy']),
    );
    expect(mockGetAllTools).toHaveBeenCalledWith('test-namespace');
    expect(result.current.visible).toBe(true);
    expect(result.current.canAddRow).toBe(true);

    act(() => result.current.addRow());
    const id = result.current.rows[0].id;
    act(() =>
      result.current.updateRow(id, {
        serverName: 'github',
        name: 'Authorization',
        source: 'value',
        value: 'chat',
      }),
    );

    expect(result.current.hasErrors).toBe(false);
    expect(result.current.effectiveCount).toBe(1);
    expect(result.current.nameOptionsFor(result.current.rows[0])).toContain(
      'X-Org-Id',
    );
    expect(result.current.toApiOverrides()).toEqual([
      {
        resourceType: MCP_RESOURCE_TYPE,
        labelSelector: {
          matchLabels: { [MCP_SERVER_SELECTOR_LABEL]: 'github' },
        },
        headers: [{ name: 'authorization', value: { value: 'chat' } }],
      },
    ]);

    act(() =>
      result.current.updateRow(id, { serverName: 'legacy', name: 'X-Token' }),
    );
    expect(result.current.errors[id]).toEqual({
      serverError: 'Needs the name label. Update the server once.',
    });
    expect(result.current.hasErrors).toBe(true);

    act(() => result.current.removeRow(id));
    expect(result.current.toApiOverrides()).toBeUndefined();
  });

  it('stays hidden without an agent', () => {
    const { result } = renderHook(() => useQueryMcpHeaders(null));

    expect(result.current.visible).toBe(false);
    expect(mockGetAllTools).not.toHaveBeenCalled();
  });
});
