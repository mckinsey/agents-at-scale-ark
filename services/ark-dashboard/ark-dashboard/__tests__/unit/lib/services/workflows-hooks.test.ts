import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workflowsService } from '@/lib/services/workflows';
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

describe('useWorkflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should replace a single workflow by name', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue([
      runningWorkflow('wf-1'),
      runningWorkflow('wf-2'),
    ]);
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    act(() => {
      result.current.upsertWorkflow(
        runningWorkflow('wf-2', { spec: { suspend: true } }),
      );
    });

    expect(result.current.workflows[0].spec.suspend).toBeUndefined();
    expect(result.current.workflows[1].spec.suspend).toBe(true);
  });

  it('should prepend a workflow that is not in the list yet', async () => {
    vi.mocked(workflowsService.list).mockResolvedValue([
      runningWorkflow('wf-1'),
    ]);
    const { result } = renderHook(() => useWorkflows('default'));
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    act(() => {
      result.current.upsertWorkflow(runningWorkflow('wf-new'));
    });

    expect(result.current.workflows.map(w => w.metadata.name)).toEqual([
      'wf-new',
      'wf-1',
    ]);
  });

  it('should poll a workflow while its shutdown is in progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(workflowsService.list).mockResolvedValue([
      runningWorkflow('wf-1', { spec: { shutdown: 'Stop' } }),
      runningWorkflow('wf-2'),
    ]);
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

  it('should not poll when no shutdown is in progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(workflowsService.list).mockResolvedValue([
      runningWorkflow('wf-1'),
    ]);
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
