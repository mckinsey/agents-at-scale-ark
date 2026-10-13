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

  it('does not re-fetch a terminal workflow when switching back to it', async () => {
    const wf1 = makeWorkflow({
      metadata: { name: 'wf-1', namespace: 'default' },
      status: { phase: 'Succeeded', nodes: {} },
    });
    const wf2 = makeWorkflow({
      metadata: { name: 'wf-2', namespace: 'default' },
      status: { phase: 'Failed', nodes: {} },
    });
    vi.mocked(workflowsService.get).mockImplementation(async (_ns, name) =>
      name === 'wf-1' ? wf1 : wf2,
    );

    const { result, rerender, unmount } = renderHook(
      ({ name }) => useWorkflow('default', name, 20),
      { initialProps: { name: 'wf-1' } },
    );

    await waitFor(() => expect(result.current.workflow).toEqual(wf1));
    expect(workflowsService.get).toHaveBeenCalledTimes(1);

    rerender({ name: 'wf-2' });
    await waitFor(() => expect(result.current.workflow).toEqual(wf2));
    expect(workflowsService.get).toHaveBeenCalledTimes(2);

    rerender({ name: 'wf-1' });
    await waitFor(() => expect(result.current.workflow).toEqual(wf1));
    expect(result.current.loading).toBe(false);
    // Still 2 - wf-1 is terminal and already cached, so no re-download.
    expect(workflowsService.get).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('still refetches a non-terminal workflow when switching back to it', async () => {
    const running = makeWorkflow({
      metadata: { name: 'wf-1', namespace: 'default' },
      status: { phase: 'Running', nodes: {} },
    });
    const other = makeWorkflow({
      metadata: { name: 'wf-2', namespace: 'default' },
      status: { phase: 'Succeeded', nodes: {} },
    });
    vi.mocked(workflowsService.get).mockImplementation(async (_ns, name) =>
      name === 'wf-1' ? running : other,
    );

    const { result, rerender, unmount } = renderHook(
      ({ name }) => useWorkflow('default', name, 20),
      { initialProps: { name: 'wf-1' } },
    );

    await waitFor(() => expect(result.current.workflow).toEqual(running));

    rerender({ name: 'wf-2' });
    await waitFor(() => expect(result.current.workflow).toEqual(other));

    rerender({ name: 'wf-1' });
    await waitFor(() =>
      expect(
        vi
          .mocked(workflowsService.get)
          .mock.calls.filter(call => call[1] === 'wf-1').length,
      ).toBeGreaterThan(1),
    );

    unmount();
  });

  it('bypasses the cache when refreshKey changes for the same name', async () => {
    const terminal = makeWorkflow({
      status: { phase: 'Succeeded', nodes: {} },
    });
    vi.mocked(workflowsService.get).mockResolvedValue(terminal);

    const { result, rerender, unmount } = renderHook(
      ({ refreshKey }) => useWorkflow('default', 'wf-1', 20, refreshKey),
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(result.current.workflow).toEqual(terminal));
    expect(workflowsService.get).toHaveBeenCalledTimes(1);

    rerender({ refreshKey: 1 });
    await waitFor(() => expect(workflowsService.get).toHaveBeenCalledTimes(2));

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
