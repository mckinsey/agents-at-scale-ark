import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executionEnginesService } from '@/lib/services/engines';
import {
  useDeleteExecutionEngine,
  useExecutionEngineDeleteAccess,
} from '@/lib/services/engines-hooks';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services/engines', () => ({
  executionEnginesService: {
    getAll: vi.fn(),
    delete: vi.fn(),
    canDelete: vi.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useDeleteExecutionEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a refused delete as an error, never as a success', async () => {
    vi.mocked(executionEnginesService.delete).mockRejectedValue(
      new Error('impersonation is not enabled'),
    );
    const { result } = renderHook(() => useDeleteExecutionEngine(), {
      wrapper,
    });

    act(() => result.current.mutate('my-engine'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(
      'Failed to delete Execution Engine: my-engine',
      { description: 'impersonation is not enabled' },
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(executionEnginesService.delete).toHaveBeenCalledWith(
      'test-namespace',
      'my-engine',
    );
  });

  it('reports a completed delete as a success', async () => {
    vi.mocked(executionEnginesService.delete).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteExecutionEngine(), {
      wrapper,
    });

    act(() => result.current.mutate('my-engine'));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('useExecutionEngineDeleteAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reviews delete access in the current namespace', async () => {
    vi.mocked(executionEnginesService.canDelete).mockResolvedValue(true);

    const { result } = renderHook(() => useExecutionEngineDeleteAccess(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBe(true));
    expect(executionEnginesService.canDelete).toHaveBeenCalledWith(
      'test-namespace',
    );
  });
});
