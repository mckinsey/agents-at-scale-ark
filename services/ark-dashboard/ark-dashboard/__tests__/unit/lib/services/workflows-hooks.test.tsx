import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workflowsService } from '@/lib/services/workflows';
import { useWorkflow } from '@/lib/services/workflows-hooks';
import type { ArgoWorkflow } from '@/lib/types/argo-workflow';

vi.mock('@/lib/services/workflows', () => ({
  workflowsService: {
    get: vi.fn(),
  },
}));

function makeWorkflow(overrides: Partial<ArgoWorkflow> = {}): ArgoWorkflow {
  return {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'Workflow',
    metadata: {
      name: 'wf-1',
      namespace: 'default',
      creationTimestamp: '2024-01-01T00:00:00Z',
      uid: 'uid-1',
    },
    spec: {},
    ...overrides,
  } as ArgoWorkflow;
}

describe('useWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null and stops loading when no name is provided', () => {
    const { result } = renderHook(() => useWorkflow('default', ''));

    expect(result.current.workflow).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(workflowsService.get).not.toHaveBeenCalled();
  });

  it('fetches a terminal workflow and stops polling', async () => {
    const workflow = makeWorkflow({
      status: { phase: 'Succeeded', nodes: {} },
    });
    vi.mocked(workflowsService.get).mockResolvedValue(workflow);

    const { result, unmount } = renderHook(() =>
      useWorkflow('default', 'wf-1', 20),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workflow).toEqual(workflow);
    expect(result.current.error).toBeNull();
    expect(workflowsService.get).toHaveBeenCalledWith('default', 'wf-1');

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(workflowsService.get).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('does not throw for a workflow without status and keeps polling', async () => {
    const workflow = makeWorkflow({ status: undefined });
    vi.mocked(workflowsService.get).mockResolvedValue(workflow);

    const { result, unmount } = renderHook(() =>
      useWorkflow('default', 'wf-1', 20),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workflow).toEqual(workflow);

    await waitFor(() =>
      expect(
        vi.mocked(workflowsService.get).mock.calls.length,
      ).toBeGreaterThan(1),
    );

    unmount();
  });

  it('stops polling once a running workflow reaches a terminal state', async () => {
    const running = makeWorkflow({ status: { phase: 'Running', nodes: {} } });
    const succeeded = makeWorkflow({
      status: { phase: 'Succeeded', nodes: {} },
    });
    vi.mocked(workflowsService.get)
      .mockResolvedValueOnce(running)
      .mockResolvedValue(succeeded);

    const { result, unmount } = renderHook(() =>
      useWorkflow('default', 'wf-1', 20),
    );

    await waitFor(() =>
      expect(result.current.workflow?.status?.phase).toBe('Succeeded'),
    );

    const callsAtTerminal = vi.mocked(workflowsService.get).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(workflowsService.get).toHaveBeenCalledTimes(callsAtTerminal);

    unmount();
  });

  it('sets an error when the fetch fails', async () => {
    const error = new Error('failed to fetch workflow');
    vi.mocked(workflowsService.get).mockRejectedValue(error);

    const { result, unmount } = renderHook(() => useWorkflow('default', 'wf-1'));

    await waitFor(() => expect(result.current.error).toBe(error));

    expect(result.current.loading).toBe(false);
    expect(result.current.workflow).toBeNull();

    unmount();
  });
});
