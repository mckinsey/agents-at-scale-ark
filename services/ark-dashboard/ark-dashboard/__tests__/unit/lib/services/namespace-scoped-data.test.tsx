import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { modelsService } from '@/lib/services/models';
import {
  GET_ALL_MODELS_QUERY_KEY,
  useCreateModel,
  useGetAllModels,
} from '@/lib/services/models-hooks';

// The provider derives the namespace during render and yields '' until
// /v1/context resolves, which is what `enabled: Boolean(namespace)` gates on.
let activeNamespace = '';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: activeNamespace,
    isNamespaceResolved: Boolean(activeNamespace),
    isPending: !activeNamespace,
    readOnlyMode: false,
  }),
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/services/models', () => ({
  modelsService: {
    getAll: vi.fn(),
    create: vi.fn(),
  },
}));

type Model = Awaited<ReturnType<typeof modelsService.getAll>>[number];

const model = (name: string) => ({ id: name, name }) as Model;

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe('namespace-scoped data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeNamespace = 'team-a';
  });

  it('shows the second namespace’s resources and never the first’s after a switch', async () => {
    vi.mocked(modelsService.getAll).mockImplementation(async namespace =>
      namespace === 'team-a' ? [model('a-only')] : [model('b-only')],
    );

    const { result, rerender } = renderHook(() => useGetAllModels(), {
      wrapper: createWrapper(newQueryClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([model('a-only')]);

    activeNamespace = 'team-b';
    rerender();

    // The key changed with the namespace, so team-a's entry is never served
    // for team-b — not even for one render before the refetch lands.
    await waitFor(() => expect(result.current.data).toEqual([model('b-only')]));
    expect(result.current.data).not.toContainEqual(model('a-only'));
    expect(modelsService.getAll).toHaveBeenCalledWith('team-b');
  });

  it('shows an empty result for a namespace with no resources of that type', async () => {
    vi.mocked(modelsService.getAll).mockImplementation(async namespace =>
      namespace === 'team-a' ? [model('a-only')] : [],
    );

    const { result, rerender } = renderHook(() => useGetAllModels(), {
      wrapper: createWrapper(newQueryClient()),
    });

    await waitFor(() => expect(result.current.data).toHaveLength(1));

    activeNamespace = 'empty-ns';
    rerender();

    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it('returns to the first namespace’s own resources on the way back', async () => {
    vi.mocked(modelsService.getAll).mockImplementation(async namespace =>
      namespace === 'team-a' ? [model('a-only')] : [model('b-only')],
    );

    const { result, rerender } = renderHook(() => useGetAllModels(), {
      wrapper: createWrapper(newQueryClient()),
    });
    await waitFor(() => expect(result.current.data).toEqual([model('a-only')]));

    activeNamespace = 'team-b';
    rerender();
    await waitFor(() => expect(result.current.data).toEqual([model('b-only')]));

    activeNamespace = 'team-a';
    rerender();
    await waitFor(() => expect(result.current.data).toEqual([model('a-only')]));
  });

  it('issues no request until the active namespace is resolved', async () => {
    activeNamespace = '';
    vi.mocked(modelsService.getAll).mockResolvedValue([model('a-only')]);

    const { result, rerender } = renderHook(() => useGetAllModels(), {
      wrapper: createWrapper(newQueryClient()),
    });

    // Unresolved is the absence of a value, so the gate holds without a flag.
    expect(modelsService.getAll).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');

    activeNamespace = 'team-a';
    rerender();

    await waitFor(() => expect(modelsService.getAll).toHaveBeenCalledWith('team-a'));
    expect(modelsService.getAll).toHaveBeenCalledTimes(1);
  });

  it('does not attribute an in-flight response to the namespace that replaced it', async () => {
    let releaseTeamA: (value: Model[]) => void = () => {};
    const teamAInFlight = new Promise<Model[]>(resolve => {
      releaseTeamA = resolve;
    });

    vi.mocked(modelsService.getAll).mockImplementation(namespace =>
      namespace === 'team-a' ? teamAInFlight : Promise.resolve([model('b-only')]),
    );

    const { result, rerender } = renderHook(() => useGetAllModels(), {
      wrapper: createWrapper(newQueryClient()),
    });

    // Switch while team-a's request is still outstanding, then let it land.
    activeNamespace = 'team-b';
    rerender();
    releaseTeamA([model('a-only')]);

    await waitFor(() => expect(result.current.data).toEqual([model('b-only')]));
    expect(result.current.data).not.toContainEqual(model('a-only'));
  });

  it('refreshes the acting namespace’s list after a create', async () => {
    vi.mocked(modelsService.getAll)
      .mockResolvedValueOnce([model('a-only')])
      .mockResolvedValueOnce([model('a-only'), model('created')]);
    vi.mocked(modelsService.create).mockResolvedValue(model('created'));

    const queryClient = newQueryClient();
    const wrapper = createWrapper(queryClient);

    const list = renderHook(() => useGetAllModels(), { wrapper });
    await waitFor(() => expect(list.result.current.data).toHaveLength(1));

    const create = renderHook(() => useCreateModel(), { wrapper });
    create.result.current.mutate({ name: 'created' } as never);

    await waitFor(() => expect(modelsService.create).toHaveBeenCalledWith('team-a', { name: 'created' }));

    // The mutation invalidates by the bare constant; prefix matching has to
    // reach the namespace-suffixed entry or the list would never refresh.
    await waitFor(() => expect(list.result.current.data).toHaveLength(2));
    expect(
      queryClient.getQueryData([GET_ALL_MODELS_QUERY_KEY, 'team-a']),
    ).toHaveLength(2);
  });
});
