import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '@/lib/api/client';
import { type WorkflowPage, workflowsService } from '@/lib/services/workflows';
import {
  useWorkflow,
  useWorkflowLifecycleActions,
  useWorkflows,
} from '@/lib/services/workflows-hooks';
import type { ArgoWorkflow } from '@/lib/types/argo-workflow';

vi.mock('@/lib/services/workflows', () => ({
  workflowsService: {
    get: vi.fn(),
    list: vi.fn(),
    runLifecycleAction: vi.fn(),
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

  it('fetches a finished workflow again when the refresh key changes', async () => {
    vi.mocked(workflowsService.get).mockResolvedValue(terminalWorkflow);
    const { result, rerender } = renderHook(
      ({ refreshKey }) => useWorkflow('default', 'wf-1', 5000, refreshKey),
      { initialProps: { refreshKey: 0 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(workflowsService.get).toHaveBeenCalledTimes(1);

    const retried = { ...terminalWorkflow, status: { phase: 'Running' } };
    vi.mocked(workflowsService.get).mockResolvedValue(retried);
    rerender({ refreshKey: 1 });

    await waitFor(() =>
      expect(result.current.workflow?.status?.phase).toBe('Running'),
    );
    expect(workflowsService.get).toHaveBeenCalledTimes(2);
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

    rerender({ filters: { status: 'running' } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workflows).toEqual([terminalWorkflow]);

    expect(firstCallSignals[0]?.aborted).toBe(true);
    act(() => {
      resolveFirst(makePage([]));
    });

    expect(result.current.workflows).toEqual([terminalWorkflow]);
    expect(result.current.error).toBeNull();
  });

  it('a 410 on a cached page token resets to page 0 instead of leaving a dead end', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'token-1'))
      .mockRejectedValueOnce(new APIError('Gone', 410))
      .mockResolvedValueOnce(makePage([terminalWorkflow]));
    const onPageError = vi.fn();

    const { result } = renderHook(() =>
      useWorkflows('default', undefined, undefined, onPageError),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.goToNextPage();
    });

    await waitFor(() => expect(onPageError).toHaveBeenCalled());
    await waitFor(() =>
      expect(workflowsService.list).toHaveBeenCalledTimes(3),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.page).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.workflows).toEqual([terminalWorkflow]);
    expect(onPageError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('back to the first page'),
      }),
    );
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      { limit: 25, continueToken: undefined, signal: expect.any(AbortSignal) },
    );
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

  it('returns an empty list without fetching when there is no namespace', async () => {
    const { result } = renderHook(() => useWorkflows(''));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workflows).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(workflowsService.list).not.toHaveBeenCalled();
  });

  it('exposes the error when the initial load fails', async () => {
    vi.mocked(workflowsService.list).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useWorkflows('default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toEqual(new Error('boom'));
  });

  it('ignores a request rejected because it was aborted', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    vi.mocked(workflowsService.list).mockRejectedValue(abortError);

    const { result } = renderHook(() => useWorkflows('default'));

    await waitFor(() => expect(workflowsService.list).toHaveBeenCalled());

    expect(result.current.error).toBeNull();
  });

  it('refetch reloads the current page with its cached token', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'token-1'))
      .mockResolvedValue(makePage([]));

    const { result } = renderHook(() => useWorkflows('default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.goToNextPage();
    });
    await waitFor(() => expect(result.current.page).toBe(1));

    await act(async () => {
      await result.current.refetch();
    });

    expect(workflowsService.list).toHaveBeenCalledTimes(3);
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      { limit: 25, continueToken: 'token-1', signal: expect.any(AbortSignal) },
    );
    expect(result.current.page).toBe(1);
  });
});

function runningWorkflow(
  name: string,
  overrides: Partial<ArgoWorkflow> = {},
): ArgoWorkflow {
  return {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'Workflow',
    metadata: { name, namespace: 'default', uid: `${name}-uid` },
    spec: {},
    status: { phase: 'Running' },
    ...overrides,
  };
}

describe('useWorkflows lifecycle updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should replace a single workflow by name', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([
        runningWorkflow('wf-1'),
        runningWorkflow('wf-2'),
      ]),
    );
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    act(() => {
      result.current.updateWorkflowItem(
        runningWorkflow('wf-2', { spec: { suspend: true } }),
      );
    });

    expect(result.current.workflows[0].spec.suspend).toBeUndefined();
    expect(result.current.workflows[1].spec.suspend).toBe(true);
  });

  it('should not patch an item with a same-named workflow from another namespace', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([runningWorkflow('wf-1')]),
    );
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    act(() => {
      result.current.updateWorkflowItem(
        runningWorkflow('wf-1', {
          metadata: { name: 'wf-1', namespace: 'other', uid: 'other-uid' },
          spec: { suspend: true },
        }),
      );
    });

    expect(result.current.workflows[0].spec.suspend).toBeUndefined();
  });

  it('should show a created workflow on top of the reloaded first page', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([runningWorkflow('wf-1')], 'token-1'))
      .mockResolvedValueOnce(makePage([runningWorkflow('wf-2')]))
      .mockResolvedValueOnce(makePage([runningWorkflow('wf-1')], 'token-1'));
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.hasNext).toBe(true));
    act(() => {
      result.current.goToNextPage();
    });
    await waitFor(() => expect(result.current.page).toBe(1));

    let shown = false;
    act(() => {
      shown = result.current.showCreatedWorkflow(runningWorkflow('wf-new'));
    });

    expect(shown).toBe(true);
    await waitFor(() => expect(result.current.page).toBe(0));
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      { limit: 25, continueToken: undefined, signal: expect.any(AbortSignal) },
    );
    expect(result.current.workflows.map(w => w.metadata.name)).toEqual([
      'wf-new',
      'wf-1',
    ]);
  });

  it('should not duplicate a created workflow the first page already contains', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([runningWorkflow('wf-1')]))
      .mockResolvedValueOnce(
        makePage([runningWorkflow('wf-1'), runningWorkflow('wf-new')]),
      );
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    act(() => {
      result.current.showCreatedWorkflow(runningWorkflow('wf-new'));
    });

    await waitFor(() =>
      expect(result.current.workflows.map(w => w.metadata.name)).toEqual([
        'wf-1',
        'wf-new',
      ]),
    );
  });

  it('should ignore a created workflow from a namespace the list no longer shows', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([runningWorkflow('wf-1')]),
    );
    const { result, rerender } = renderHook(
      ({ namespace }) => useWorkflows(namespace),
      { initialProps: { namespace: 'default' } },
    );
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));
    const showCreatedInOldNamespace = result.current.showCreatedWorkflow;
    rerender({ namespace: 'other' });
    await waitFor(() => expect(workflowsService.list).toHaveBeenCalledTimes(2));

    let shown = true;
    act(() => {
      shown = showCreatedInOldNamespace(runningWorkflow('wf-new'));
    });

    expect(shown).toBe(false);
    expect(workflowsService.list).toHaveBeenCalledTimes(2);
    const names = result.current.workflows.map(w => w.metadata.name);
    expect(names).not.toContain('wf-new');
  });

  it('should poll a workflow while its shutdown is in progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([
        runningWorkflow('wf-1', { spec: { shutdown: 'Stop' } }),
        runningWorkflow('wf-2'),
      ]),
    );
    vi.mocked(workflowsService.get).mockResolvedValue(
      runningWorkflow('wf-1', {
        spec: { shutdown: 'Stop' },
        status: { phase: 'Failed' },
      }),
    );
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(workflowsService.get).toHaveBeenCalledTimes(1);
    expect(workflowsService.get).toHaveBeenCalledWith('default', 'wf-1');
    expect(result.current.workflows[0].status?.phase).toBe('Failed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(workflowsService.get).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('should not insert a workflow that is not on the current page when patching in place', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([runningWorkflow('wf-1')]),
    );
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    act(() => {
      result.current.updateWorkflowItem(runningWorkflow('wf-other'));
    });

    expect(result.current.workflows.map(w => w.metadata.name)).toEqual([
      'wf-1',
    ]);
  });

  it('should log and keep the list when refreshing a shutting-down workflow fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const shuttingDown = runningWorkflow('wf-1', {
      spec: { shutdown: 'Stop' },
    });
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([shuttingDown]),
    );
    const refreshError = new Error('unavailable');
    vi.mocked(workflowsService.get).mockRejectedValue(refreshError);
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to refresh workflow wf-1',
      refreshError,
    );
    expect(result.current.workflows).toEqual([shuttingDown]);
    consoleError.mockRestore();
    vi.useRealTimers();
  });

  it('should poll a watched workflow until it finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([runningWorkflow('wf-1'), runningWorkflow('wf-2')]),
    );
    vi.mocked(workflowsService.get).mockResolvedValue(
      runningWorkflow('wf-1', { status: { phase: 'Succeeded' } }),
    );
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    act(() => {
      result.current.watchWorkflow('wf-1');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(workflowsService.get).toHaveBeenCalledTimes(1);
    expect(workflowsService.get).toHaveBeenCalledWith('default', 'wf-1');
    expect(result.current.workflows[0].status?.phase).toBe('Succeeded');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(workflowsService.get).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('should not poll a watched workflow that is not on the current page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([runningWorkflow('wf-1')]),
    );
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    act(() => {
      result.current.watchWorkflow('wf-elsewhere');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(workflowsService.get).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should not poll when no shutdown is in progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([
        runningWorkflow('wf-1'),
      ]),
    );
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(workflowsService.get).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('useWorkflowLifecycleActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run the action in the namespace and report the updated workflow', async () => {
    const updated = runningWorkflow('wf-1', { spec: { suspend: true } });
    vi.mocked(workflowsService.runLifecycleAction).mockResolvedValue(updated);
    const onWorkflowUpdated = vi.fn();
    const { result } = renderHook(() =>
      useWorkflowLifecycleActions('team-a', onWorkflowUpdated),
    );

    await act(async () => {
      await result.current.runAction('wf-1', 'suspend');
    });

    expect(workflowsService.runLifecycleAction).toHaveBeenCalledWith(
      'team-a',
      'wf-1',
      'suspend',
    );
    expect(onWorkflowUpdated).toHaveBeenCalledWith(updated);
    expect(result.current.isPending('wf-1')).toBe(false);
  });

  it('should resolve with the workflow returned by the action', async () => {
    const created = runningWorkflow('wf-1-abcde');
    vi.mocked(workflowsService.runLifecycleAction).mockResolvedValue(created);
    const { result } = renderHook(() =>
      useWorkflowLifecycleActions('default', vi.fn()),
    );

    let returned: ArgoWorkflow | undefined;
    await act(async () => {
      returned = await result.current.runAction('wf-1', 'resubmit');
    });

    expect(returned).toEqual(created);
  });

  it('should mark the workflow pending until the response arrives', async () => {
    let resolveAction: (workflow: ArgoWorkflow) => void = vi.fn();
    vi.mocked(workflowsService.runLifecycleAction).mockReturnValue(
      new Promise(resolve => {
        resolveAction = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useWorkflowLifecycleActions('default', vi.fn()),
    );

    let pendingAction: Promise<void> = Promise.resolve();
    act(() => {
      pendingAction = result.current.runAction('wf-1', 'stop');
    });

    expect(result.current.isPending('wf-1')).toBe(true);
    expect(result.current.isPending('wf-2')).toBe(false);

    await act(async () => {
      resolveAction(runningWorkflow('wf-1'));
      await pendingAction;
    });

    expect(result.current.isPending('wf-1')).toBe(false);
  });

  it('should ignore a second action on the same workflow while one is in flight', async () => {
    let resolveAction: (workflow: ArgoWorkflow) => void = vi.fn();
    vi.mocked(workflowsService.runLifecycleAction).mockReturnValue(
      new Promise(resolve => {
        resolveAction = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useWorkflowLifecycleActions('default', vi.fn()),
    );

    let firstAction: Promise<void> = Promise.resolve();
    await act(async () => {
      firstAction = result.current.runAction('wf-1', 'stop');
      await result.current.runAction('wf-1', 'terminate');
    });

    expect(workflowsService.runLifecycleAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction(runningWorkflow('wf-1'));
      await firstAction;
    });
  });

  it('should propagate errors and clear the pending state', async () => {
    vi.mocked(workflowsService.runLifecycleAction).mockRejectedValue(
      new Error('conflict'),
    );
    const onWorkflowUpdated = vi.fn();
    const { result } = renderHook(() =>
      useWorkflowLifecycleActions('default', onWorkflowUpdated),
    );

    await act(async () => {
      await expect(result.current.runAction('wf-1', 'stop')).rejects.toThrow(
        'conflict',
      );
    });

    expect(onWorkflowUpdated).not.toHaveBeenCalled();
    expect(result.current.isPending('wf-1')).toBe(false);
  });
});
