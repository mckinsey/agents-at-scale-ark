import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as service from './a2a-task-approvals';
import { useSubmitApproval } from './a2a-task-approvals-hooks';

vi.mock('./a2a-task-approvals', async () => {
  const actual = await vi.importActual<typeof service>('./a2a-task-approvals');
  return {
    ...actual,
    submitApproval: vi.fn(),
  };
});

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
}

describe('useSubmitApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls submitApproval with the wired task name, namespace, and decision', async () => {
    vi.mocked(service.submitApproval).mockResolvedValueOnce({
      name: 'a2a-task-abc',
      namespace: 'ns',
      taskId: 'abc',
      decision: 'approved',
    });

    const { result } = renderHook(
      () => useSubmitApproval('a2a-task-abc', 'ns'),
      { wrapper: createWrapper() },
    );

    await result.current.mutateAsync('approved');

    await waitFor(() => {
      expect(service.submitApproval).toHaveBeenCalledWith(
        'a2a-task-abc',
        'ns',
        'approved',
      );
    });
  });

  it('passes rejection through', async () => {
    vi.mocked(service.submitApproval).mockResolvedValueOnce({
      name: 'a2a-task-xyz',
      namespace: 'default',
      taskId: 'xyz',
      decision: 'rejected',
    });

    const { result } = renderHook(
      () => useSubmitApproval('a2a-task-xyz', 'default'),
      { wrapper: createWrapper() },
    );

    await result.current.mutateAsync('rejected');

    await waitFor(() => {
      expect(service.submitApproval).toHaveBeenCalledWith(
        'a2a-task-xyz',
        'default',
        'rejected',
      );
    });
  });
});
