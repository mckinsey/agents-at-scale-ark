import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function makePage(items: ArgoWorkflow[], continueToken?: string): WorkflowPage {
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

  it('requests any page by offset once the list reports a remaining item count', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce({
        ...makePage([terminalWorkflow, terminalWorkflow], '2'),
        remainingItemCount: 5,
      })
      .mockResolvedValueOnce({
        ...makePage([terminalWorkflow], undefined),
        remainingItemCount: 0,
      });

    const { result, rerender } = renderHook(
      ({ page }) => useWorkflows('default', undefined, { page, pageSize: 2 }),
      { initialProps: { page: 0 } },
    );

    await waitFor(() => expect(result.current.totalCount).toBe(7));

    rerender({ page: 3 });

    await waitFor(() => expect(result.current.totalCount).toBe(7));
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      { limit: 2, continueToken: '6', signal: expect.any(AbortSignal) },
    );
  });

  it('reports no total count when the page has no remaining item count', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([terminalWorkflow], 'token-1'),
    );

    const { result } = renderHook(() => useWorkflows('default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totalCount).toBeNull();
  });

  it('walks cursor pages with the token returned by the previous page', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'token-1'))
      .mockResolvedValueOnce(makePage([]))
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'token-1'));

    const { result, rerender } = renderHook(
      ({ page }) => useWorkflows('default', undefined, { page }),
      { initialProps: { page: 0 } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ page: 1 });
    await waitFor(() => expect(workflowsService.list).toHaveBeenCalledTimes(2));
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      { limit: 25, continueToken: 'token-1', signal: expect.any(AbortSignal) },
    );

    rerender({ page: 0 });
    await waitFor(() => expect(workflowsService.list).toHaveBeenCalledTimes(3));
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      { limit: 25, continueToken: undefined, signal: expect.any(AbortSignal) },
    );
  });

  it('resets to the first page when a cursor page has no known token', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([terminalWorkflow], 'token-1'),
    );
    const onPageReset = vi.fn();

    const { result, rerender } = renderHook(
      ({ page }) => useWorkflows('default', undefined, { page, onPageReset }),
      { initialProps: { page: 0 } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ page: 3 });

    await waitFor(() => expect(onPageReset).toHaveBeenCalled());
    expect(workflowsService.list).toHaveBeenCalledTimes(1);
  });

  it('resets to the first page when a deep-linked page cannot be loaded', async () => {
    vi.mocked(workflowsService.list).mockRejectedValue(
      new APIError('continue key is not valid', 400),
    );
    const onPageError = vi.fn();
    const onPageReset = vi.fn();

    renderHook(() =>
      useWorkflows('default', undefined, {
        page: 2,
        pageSize: 10,
        onPageError,
        onPageReset,
      }),
    );

    await waitFor(() => expect(onPageReset).toHaveBeenCalled());
    expect(workflowsService.list).toHaveBeenCalledWith('default', undefined, {
      limit: 10,
      continueToken: '20',
      signal: expect.any(AbortSignal),
    });
    expect(onPageError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('back to the first page'),
      }),
    );
  });

  it('a failed page load reports onPageError and keeps the current page on screen', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce({
        ...makePage([terminalWorkflow], '25'),
        remainingItemCount: 10,
      })
      .mockRejectedValueOnce(new Error('boom'));
    const onPageError = vi.fn();

    const { result, rerender } = renderHook(
      ({ page }) => useWorkflows('default', undefined, { page, onPageError }),
      { initialProps: { page: 0 } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ page: 1 });

    await waitFor(() =>
      expect(onPageError).toHaveBeenCalledWith(new Error('boom')),
    );
    expect(result.current.error).toBeNull();
    expect(result.current.workflows).toEqual([terminalWorkflow]);
  });

  it('walks Kubernetes cursor pages even when the list reports a remaining item count', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce({
        ...makePage([terminalWorkflow], 'k8s-cursor-page-2'),
        remainingItemCount: 109,
      })
      .mockResolvedValueOnce(makePage([]));

    const { result, rerender } = renderHook(
      ({ page }) => useWorkflows('default', undefined, { page }),
      { initialProps: { page: 0 } },
    );

    await waitFor(() => expect(result.current.totalCount).toBe(110));

    rerender({ page: 1 });

    await waitFor(() => expect(workflowsService.list).toHaveBeenCalledTimes(2));
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      {
        limit: 25,
        continueToken: 'k8s-cursor-page-2',
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('detects the paging mode again after a namespace switch', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'cursor-token'))
      .mockResolvedValueOnce({
        ...makePage([terminalWorkflow], '6'),
        remainingItemCount: 4,
      });
    const onPageReset = vi.fn();

    const { rerender } = renderHook(
      ({ namespace, page }) =>
        useWorkflows(namespace, undefined, {
          page,
          pageSize: 2,
          onPageReset,
        }),
      { initialProps: { namespace: 'team-a', page: 0 } },
    );

    await waitFor(() => expect(workflowsService.list).toHaveBeenCalledTimes(1));

    rerender({ namespace: 'team-b', page: 2 });

    await waitFor(() => expect(workflowsService.list).toHaveBeenCalledTimes(2));
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'team-b',
      undefined,
      {
        limit: 2,
        continueToken: '4',
        signal: expect.any(AbortSignal),
      },
    );
    expect(onPageReset).not.toHaveBeenCalled();
  });

  it('reports a server error on a deep-linked page instead of resetting to the first page', async () => {
    const serverError = new APIError('Internal Server Error', 500);
    vi.mocked(workflowsService.list).mockRejectedValue(serverError);
    const onPageError = vi.fn();
    const onPageReset = vi.fn();

    renderHook(() =>
      useWorkflows('default', undefined, {
        page: 2,
        pageSize: 10,
        onPageError,
        onPageReset,
      }),
    );

    await waitFor(() => expect(onPageError).toHaveBeenCalledWith(serverError));
    expect(onPageReset).not.toHaveBeenCalled();
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
      {
        initialProps: { filters: undefined as { status?: string } | undefined },
      },
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

  it('a 410 on a cached page token resets to the first page instead of leaving a dead end', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'token-1'))
      .mockRejectedValueOnce(new APIError('Gone', 410));
    const onPageError = vi.fn();
    const onPageReset = vi.fn();

    const { result, rerender } = renderHook(
      ({ page }) =>
        useWorkflows('default', undefined, { page, onPageError, onPageReset }),
      { initialProps: { page: 0 } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ page: 1 });

    await waitFor(() => expect(onPageReset).toHaveBeenCalled());
    expect(result.current.error).toBeNull();
    expect(onPageError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('back to the first page'),
      }),
    );
  });

  it('drops the cursor stack when filters change', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([terminalWorkflow], 'token-1'))
      .mockResolvedValueOnce(makePage([]));
    const onPageReset = vi.fn();

    const { result, rerender } = renderHook(
      ({ filters, page }) =>
        useWorkflows('default', filters, { page, onPageReset }),
      {
        initialProps: {
          filters: undefined as { status?: string } | undefined,
          page: 0,
        },
      },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ filters: { status: 'running' }, page: 0 });
    await waitFor(() => expect(workflowsService.list).toHaveBeenCalledTimes(2));
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      { status: 'running' },
      { limit: 25, continueToken: undefined, signal: expect.any(AbortSignal) },
    );

    rerender({ filters: { status: 'running' }, page: 1 });
    await waitFor(() => expect(onPageReset).toHaveBeenCalled());
    expect(workflowsService.list).toHaveBeenCalledTimes(2);
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

    const { result, rerender } = renderHook(
      ({ page }) => useWorkflows('default', undefined, { page }),
      { initialProps: { page: 0 } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ page: 1 });
    await waitFor(() => expect(workflowsService.list).toHaveBeenCalledTimes(2));

    await act(async () => {
      await result.current.refetch();
    });

    expect(workflowsService.list).toHaveBeenCalledTimes(3);
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      { limit: 25, continueToken: 'token-1', signal: expect.any(AbortSignal) },
    );
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should replace a single workflow by name', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([runningWorkflow('wf-1'), runningWorkflow('wf-2')]),
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
    const onPageReset = vi.fn();
    const { result, rerender } = renderHook(
      ({ page }) => useWorkflows('default', undefined, { page, onPageReset }),
      { initialProps: { page: 0 } },
    );
    await waitFor(() => expect(result.current.hasNext).toBe(true));
    rerender({ page: 1 });
    await waitFor(() =>
      expect(result.current.workflows.map(w => w.metadata.name)).toEqual([
        'wf-2',
      ]),
    );

    let shown = false;
    act(() => {
      shown = result.current.showCreatedWorkflow(runningWorkflow('wf-new'));
    });

    expect(shown).toBe(true);
    expect(onPageReset).toHaveBeenCalled();
    rerender({ page: 0 });
    await waitFor(() =>
      expect(result.current.workflows.map(w => w.metadata.name)).toEqual([
        'wf-new',
        'wf-1',
      ]),
    );
    expect(workflowsService.list).toHaveBeenLastCalledWith(
      'default',
      undefined,
      { limit: 25, continueToken: undefined, signal: expect.any(AbortSignal) },
    );
  });

  it('should move a created workflow the first page already contains to the top', async () => {
    vi.mocked(workflowsService.list)
      .mockResolvedValueOnce(makePage([runningWorkflow('wf-1')]))
      .mockResolvedValueOnce(
        makePage([
          runningWorkflow('wf-1'),
          runningWorkflow('wf-new'),
          runningWorkflow('wf-3'),
        ]),
      );
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    act(() => {
      result.current.showCreatedWorkflow(runningWorkflow('wf-new'));
    });

    await waitFor(() => expect(result.current.workflows).toHaveLength(3));
    expect(result.current.workflows.map(w => w.metadata.name)).toEqual([
      'wf-new',
      'wf-1',
      'wf-3',
    ]);
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
  });

  it('should not poll when no shutdown is in progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(workflowsService.list).mockResolvedValue(
      makePage([runningWorkflow('wf-1')]),
    );
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(workflowsService.get).not.toHaveBeenCalled();
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
