import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useMcpHeaderOverrides } from '@/components/forms/agent-form/use-mcp-header-overrides';
import type { AgentOverride } from '@/lib/services';
import {
  MCP_RESOURCE_TYPE,
  MCP_SERVER_SELECTOR_LABEL,
} from '@/lib/utils/mcp-header-overrides';

function serverOverride(serverName: string, name: string): AgentOverride {
  return {
    resourceType: MCP_RESOURCE_TYPE,
    labelSelector: {
      matchLabels: { [MCP_SERVER_SELECTOR_LABEL]: serverName },
    },
    headers: [{ name, value: { value: `${name}-value` } }],
  };
}

describe('useMcpHeaderOverrides', () => {
  it('loads overrides and rebuilds the same payload', () => {
    const overrides = [
      serverOverride('github', 'Authorization'),
      serverOverride('jira', 'X-Jira-Token'),
    ];
    const { result } = renderHook(() => useMcpHeaderOverrides());

    let snapshot = '';
    act(() => {
      snapshot = result.current.load(overrides);
    });

    expect(result.current.rows).toHaveLength(2);
    expect(result.current.toPayload()).toEqual(overrides);
    expect(snapshot).toBe(JSON.stringify(overrides));
  });

  it('removes the rows of a server whose tools are deselected', () => {
    const { result } = renderHook(() => useMcpHeaderOverrides());
    act(() => {
      result.current.load([
        serverOverride('github', 'Authorization'),
        serverOverride('jira', 'X-Jira-Token'),
      ]);
    });

    act(() => result.current.reconcile(['github', 'jira']));
    act(() => result.current.reconcile(['github']));

    expect(result.current.rows.map(row => row.serverName)).toEqual(['github']);
  });

  it('blocks saving until the row is valid', () => {
    const { result } = renderHook(() => useMcpHeaderOverrides());
    act(() => result.current.addRow());
    const id = result.current.rows[0].id;

    act(() => result.current.updateRow(id, { name: 'Authorization' }));
    let payload: AgentOverride[] | null = [];
    act(() => {
      payload = result.current.validate();
    });
    expect(payload).toBeNull();
    expect(result.current.errors[id]).toEqual({
      valueError: 'Select a secret',
    });

    act(() =>
      result.current.updateRow(id, { secretName: 'gh', secretKey: 'token' }),
    );
    expect(result.current.errors[id]).toBeUndefined();
    act(() => {
      payload = result.current.validate();
    });
    expect(payload).toEqual([
      {
        resourceType: MCP_RESOURCE_TYPE,
        headers: [
          {
            name: 'Authorization',
            value: {
              valueFrom: { secretKeyRef: { name: 'gh', key: 'token' } },
            },
          },
        ],
      },
    ]);
  });
});
