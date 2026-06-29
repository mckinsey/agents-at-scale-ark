import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentQueryParameters } from '@/lib/hooks/use-agent-query-parameters';

const mockGetByName = vi.fn();

vi.mock('@/lib/services', () => ({
  agentsService: {
    getByName: (...args: unknown[]) => mockGetByName(...args),
  },
}));

const agentWithQueryParam = {
  parameters: [
    { name: 'bakedWord', value: 'ZIBBLEFROST' },
    { name: 'queryWord', valueFrom: { queryParameterRef: { name: 'muting' } } },
  ],
};

describe('useAgentQueryParameters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByName.mockResolvedValue({ parameters: [] });
  });

  it('extracts only query-sourced parameters by their queryParameterRef name', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result } = renderHook(() =>
      useAgentQueryParameters('param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(result.current.requiredParameters).toEqual(['muting']);
    });
    // bakedWord has a direct value and is excluded
    expect(result.current.requiredParameters).not.toContain('bakedWord');
  });

  it('strips a team/agent prefix before fetching the agent', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    renderHook(() =>
      useAgentQueryParameters('my-team/param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(mockGetByName).toHaveBeenCalledWith('param-test-agent');
    });
  });

  it('reports every required parameter as missing until a value is supplied', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result } = renderHook(() =>
      useAgentQueryParameters('param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(result.current.missingParameters).toEqual(['muting']);
    });

    act(() => {
      result.current.setValue('muting', 'BANANAPHONE');
    });

    expect(result.current.missingParameters).toEqual([]);
    expect(result.current.values).toEqual({ muting: 'BANANAPHONE' });
  });

  it('treats whitespace-only values as missing', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result } = renderHook(() =>
      useAgentQueryParameters('param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(result.current.requiredParameters).toEqual(['muting']);
    });

    act(() => {
      result.current.setValue('muting', '   ');
    });

    expect(result.current.missingParameters).toEqual(['muting']);
  });

  it('toApiParameters returns name/value pairs, or undefined when none are required', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result } = renderHook(() =>
      useAgentQueryParameters('param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(result.current.requiredParameters).toEqual(['muting']);
    });

    act(() => {
      result.current.setValue('muting', 'BANANAPHONE');
    });

    expect(result.current.toApiParameters()).toEqual([
      { name: 'muting', value: 'BANANAPHONE' },
    ]);
  });

  it('returns no parameters for a non-agent participant and does not fetch', async () => {
    const { result } = renderHook(() =>
      useAgentQueryParameters('some-team', 'team'),
    );

    await waitFor(() => {
      expect(result.current.requiredParameters).toEqual([]);
    });
    expect(result.current.toApiParameters()).toBeUndefined();
    expect(mockGetByName).not.toHaveBeenCalled();
  });

  it('clears state when the agent fetch fails', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result, rerender } = renderHook(
      ({ name }) => useAgentQueryParameters(name, 'agent'),
      { initialProps: { name: 'param-test-agent' } },
    );

    await waitFor(() => {
      expect(result.current.requiredParameters).toEqual(['muting']);
    });

    mockGetByName.mockRejectedValueOnce(new Error('not found'));
    rerender({ name: 'missing-agent' });

    await waitFor(() => {
      expect(result.current.requiredParameters).toEqual([]);
    });
    expect(result.current.values).toEqual({});
  });
});
