import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type WorkflowPage, workflowsService } from '@/lib/services/workflows';
import { useWorkflow, useWorkflows } from '@/lib/services/workflows-hooks';
import type { ArgoWorkflow } from '@/lib/types/argo-workflow';

vi.mock('@/lib/services/workflows', () => ({
  workflowsService: {
    get: vi.fn(),
    list: vi.fn(),
  },
}));

function makePage(
  items: ArgoWorkflow[],
  continueToken?: string,
): WorkflowPage {
  return { items, continueToken, hasMore: Boolean(continueToken) };
}

const terminalWorkflow: ArgoWorkflow = {
  apiVersion: 'argoproj.io/v1alpha1',
  kind: 'Workflow',
  metadata: {
    name: 'wf-1',
    namespace: 'default',
    creationTimestamp: '2024-01-15T10:00:00Z',
    uid: 'wf-1-uid',
  },
  spec: {},
  status: {
    phase: 'Succeeded',
  },
};

describe('useWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the workflow using the default namespace and refresh interval', async () => {
    vi.mocked(workflowsService.get).mockResolvedValue(terminalWorkflow);

    const { result } = renderHook(() => useWorkflow('default', 'wf-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(workflowsService.get).toHaveBeenCalledWith('default', 'wf-1');
    expect(result.current.workflow).toEqual(terminalWorkflow);
    expect(result.current.error).toBeNull();
  });

  it('resets state and skips fetching when no name is provided', () => {
    const { result } = renderHook(() => useWorkflow(''));

    expect(result.current.workflow).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(workflowsService.get).not.toHaveBeenCalled();
  });
});

describe('useWorkflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches page 0 with no continue token on initial load', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(makePage([]));

    const { result } = renderHook(() => useWorkflows('default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(workflowsService.list).toHaveBeenCalledWith('default', undefined, {
      limit: 25,
      continueToken: undefined,
      signal: expect.any(AbortSignal),
    });
    expect(result.current.page).toBe(0);
    expect(result.current.hasPrevious).toBe(false);
  });

  it('exposes hasNext based on the page continue token', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([terminalWorkflow], 'token-1'),
    );

    const { result } = renderHook(() => useWorkflows('default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasNext).toBe(true);
    expect(result.current.workflows).toEqual([terminalWorkflow]);
  });

  it('goToNextPage fetches with the token returned by the previous page', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'token-1'))
      .mockResolvedValueOnce(makePage([]));

    const { result } = renderHook(() => useWorkflows('default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.goToNextPage();
    });

    await waitFor(() => expect(result.current.page).toBe(1));

    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      { limit: 25, continueToken: 'token-1', signal: expect.any(AbortSignal) },
    );
    expect(result.current.hasPrevious).toBe(true);
  });

  it('goToNextPage is a no-op when there is no next page', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(makePage([]));

    const { result } = renderHook(() => useWorkflows('default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.goToNextPage();
    });

    expect(workflowsService.list).toHaveBeenCalledTimes(1);
  });

  it('a failed goToNextPage reports onPageError and keeps the current page on screen', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'token-1'))
      .mockRejectedValueOnce(new Error('boom'));
    const onPageError = vi.fn();

    const { result } = renderHook(() =>
      useWorkflows('default', undefined, undefined, onPageError),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.goToNextPage();
    });

    await waitFor(() => expect(onPageError).toHaveBeenCalledWith(
      new Error('boom'),
    ));

    expect(result.current.error).toBeNull();
    expect(result.current.page).toBe(0);
    expect(result.current.workflows).toEqual([terminalWorkflow]);
  });

  it('goToPreviousPage replays the cached token instead of asking the server again', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'token-1'))
      .mockResolvedValueOnce(makePage([]));

    const { result } = renderHook(() => useWorkflows('default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.goToNextPage();
    });
    await waitFor(() => expect(result.current.page).toBe(1));

    act(() => {
      result.current.goToPreviousPage();
    });
    await waitFor(() => expect(result.current.page).toBe(0));

    expect(workflowsService.list).toHaveBeenCalledTimes(3);
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      { limit: 25, continueToken: undefined, signal: expect.any(AbortSignal) },
    );
  });

  it('updateWorkflowItem replaces one item in place without re-fetching', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([terminalWorkflow]),
    );

    const { result } = renderHook(() => useWorkflows('default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated: ArgoWorkflow = {
      ...terminalWorkflow,
      status: { phase: 'Failed' },
    };

    act(() => {
      result.current.updateWorkflowItem(updated);
    });

    expect(result.current.workflows).toEqual([updated]);
    expect(workflowsService.list).toHaveBeenCalledTimes(1);
  });

  it('a superseded in-flight request does not overwrite state from a later one', async () => {
    let resolveFirst: (page: WorkflowPage) => void = () => {};
    const firstCallSignals: Array<AbortSignal | undefined> = [];

    vi.mocked(workflowsService.list).mockImplementation(
      (_namespace, _filters, opts) => {
        firstCallSignals.push(opts?.signal);
        if (firstCallSignals.length === 1) {
          return new Promise<WorkflowPage>(resolve => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve(makePage([terminalWorkflow]));
      },
    );

    const { result, rerender } = renderHook(
      ({ filters }) => useWorkflows('default', filters),
      { initialProps: { filters: undefined as { status?: string } | undefined } },
    );

    // First request is still pending when the filter changes.
    rerender({ filters: { status: 'running' } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workflows).toEqual([terminalWorkflow]);

    // The superseded request's signal was aborted, and resolving it late
    // must not clobber the state the second (current) request already set.
    expect(firstCallSignals[0]?.aborted).toBe(true);
    act(() => {
      resolveFirst(makePage([]));
    });

    expect(result.current.workflows).toEqual([terminalWorkflow]);
    expect(result.current.error).toBeNull();
  });

  it('resets to page 0 when filters change', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'token-1'))
      .mockResolvedValueOnce(makePage([]))
      .mockResolvedValueOnce(makePage([]));

    const { result, rerender } = renderHook(
      ({ filters }) => useWorkflows('default', filters),
      { initialProps: { filters: undefined as { status?: string } | undefined } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.goToNextPage();
    });
    await waitFor(() => expect(result.current.page).toBe(1));

    rerender({ filters: { status: 'running' } });

    await waitFor(() => expect(result.current.page).toBe(0));
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      { status: 'running' },
      { limit: 25, continueToken: undefined, signal: expect.any(AbortSignal) },
    );
  });
});
