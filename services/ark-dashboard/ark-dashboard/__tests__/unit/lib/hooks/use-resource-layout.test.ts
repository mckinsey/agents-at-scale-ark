import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  parseLayout,
  useAgentsLayout,
  useResourceLayout,
  useTeamsLayout,
  useWorkflowsLayout,
} from '@/lib/hooks/use-resource-layout';

const WORKFLOW_KEY = (ns: string) => `ark-dashboard:workflow-layout:${ns}`;
const AGENTS_KEY = (ns: string) => `ark-dashboard:agents-layout:${ns}`;
const TEAMS_KEY = (ns: string) => `ark-dashboard:teams-layout:${ns}`;

describe('parseLayout', () => {
  it('returns an empty layout for non-objects', () => {
    expect(parseLayout(null)).toEqual({ sections: [], ungroupedOrder: [] });
    expect(parseLayout('bad')).toEqual({ sections: [], ungroupedOrder: [] });
  });

  it('drops malformed sections and keeps valid ones', () => {
    const result = parseLayout({
      sections: [
        { id: 's1', name: 'S1', itemKeys: ['a'] },
        { id: 42 }, // bad
        null,
        { id: 's2', name: 'S2', itemKeys: ['b', 3, 'c'] },
      ],
      ungroupedOrder: ['u1', 4, 'u2'],
    });
    expect(result).toEqual({
      sections: [
        { id: 's1', name: 'S1', description: undefined, itemKeys: ['a'] },
        {
          id: 's2',
          name: 'S2',
          description: undefined,
          itemKeys: ['b', 'c'],
        },
      ],
      ungroupedOrder: ['u1', 'u2'],
    });
  });
});

describe('useResourceLayout', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('isolates state between resources using different storage prefixes', () => {
    localStorage.setItem(
      'ark-dashboard:resource-a:default',
      JSON.stringify({ sections: [], ungroupedOrder: ['a'] }),
    );
    localStorage.setItem(
      'ark-dashboard:resource-b:default',
      JSON.stringify({ sections: [], ungroupedOrder: ['b'] }),
    );
    const { result: a } = renderHook(() =>
      useResourceLayout({
        storagePrefix: 'ark-dashboard:resource-a:',
        namespace: 'default',
      }),
    );
    const { result: b } = renderHook(() =>
      useResourceLayout({
        storagePrefix: 'ark-dashboard:resource-b:',
        namespace: 'default',
      }),
    );
    expect(a.current.layout.ungroupedOrder).toEqual(['a']);
    expect(b.current.layout.ungroupedOrder).toEqual(['b']);
  });

  it('writes back to the prefixed key on setLayout', () => {
    const { result } = renderHook(() =>
      useResourceLayout({
        storagePrefix: 'ark-dashboard:thing:',
        namespace: 'default',
      }),
    );
    act(() => {
      result.current.setLayout({
        sections: [{ id: 's1', name: 'S1', itemKeys: [] }],
        ungroupedOrder: ['a'],
      });
    });
    expect(
      JSON.parse(localStorage.getItem('ark-dashboard:thing:default')!),
    ).toEqual({
      sections: [{ id: 's1', name: 'S1', itemKeys: [] }],
      ungroupedOrder: ['a'],
    });
  });

  it('supports functional updates', () => {
    localStorage.setItem(
      'ark-dashboard:thing:default',
      JSON.stringify({ sections: [], ungroupedOrder: ['a'] }),
    );
    const { result } = renderHook(() =>
      useResourceLayout({
        storagePrefix: 'ark-dashboard:thing:',
        namespace: 'default',
      }),
    );
    act(() => {
      result.current.setLayout(prev => ({
        ...prev,
        ungroupedOrder: [...prev.ungroupedOrder, 'b'],
      }));
    });
    expect(result.current.layout.ungroupedOrder).toEqual(['a', 'b']);
  });

  it('re-reads when the namespace changes', () => {
    localStorage.setItem(
      'ark-dashboard:thing:ns-a',
      JSON.stringify({ sections: [], ungroupedOrder: ['a'] }),
    );
    localStorage.setItem(
      'ark-dashboard:thing:ns-b',
      JSON.stringify({ sections: [], ungroupedOrder: ['b'] }),
    );
    const { result, rerender } = renderHook(
      ({ ns }) =>
        useResourceLayout({
          storagePrefix: 'ark-dashboard:thing:',
          namespace: ns,
        }),
      { initialProps: { ns: 'ns-a' } },
    );
    expect(result.current.layout.ungroupedOrder).toEqual(['a']);
    rerender({ ns: 'ns-b' });
    expect(result.current.layout.ungroupedOrder).toEqual(['b']);
  });

});

describe('wrapper hooks', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('useWorkflowsLayout uses the workflow-templates prefix', () => {
    localStorage.setItem(
      WORKFLOW_KEY('default'),
      JSON.stringify({ sections: [], ungroupedOrder: ['w1'] }),
    );
    const { result } = renderHook(() => useWorkflowsLayout('default'));
    expect(result.current.layout.ungroupedOrder).toEqual(['w1']);
  });

  it('useAgentsLayout uses the agents prefix', () => {
    localStorage.setItem(
      AGENTS_KEY('default'),
      JSON.stringify({ sections: [], ungroupedOrder: ['alice'] }),
    );
    const { result } = renderHook(() => useAgentsLayout('default'));
    expect(result.current.layout.ungroupedOrder).toEqual(['alice']);
  });

  it('useTeamsLayout uses the teams prefix', () => {
    localStorage.setItem(
      TEAMS_KEY('default'),
      JSON.stringify({ sections: [], ungroupedOrder: ['red-team'] }),
    );
    const { result } = renderHook(() => useTeamsLayout('default'));
    expect(result.current.layout.ungroupedOrder).toEqual(['red-team']);
  });
});
