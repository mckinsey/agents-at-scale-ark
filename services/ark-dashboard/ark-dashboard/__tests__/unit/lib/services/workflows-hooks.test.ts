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
      { limit: 25, continueToken: 'token-1' },
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
      { limit: 25, continueToken: undefined },
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
      { limit: 25, continueToken: undefined },
    );
  });
});
