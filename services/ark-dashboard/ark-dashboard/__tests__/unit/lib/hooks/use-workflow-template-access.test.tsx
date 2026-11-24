import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkflowTemplateAccess } from '@/lib/hooks/use-workflow-template-access';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    canCreate: vi.fn(),
    canUpdate: vi.fn(),
    canDelete: vi.fn(),
    canRun: vi.fn(),
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

const service = vi.mocked(workflowTemplatesService);

function answer(allowed: {
  create: boolean | Error;
  update: boolean | Error;
  delete: boolean | Error;
  run: boolean | Error;
}) {
  const respond = (value: boolean | Error) =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  service.canCreate.mockImplementation(() => respond(allowed.create));
  service.canUpdate.mockImplementation(() => respond(allowed.update));
  service.canDelete.mockImplementation(() => respond(allowed.delete));
  service.canRun.mockImplementation(() => respond(allowed.run));
}

describe('useWorkflowTemplateAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks every action in the current namespace', async () => {
    answer({ create: true, update: true, delete: true, run: true });

    const { result } = renderHook(() => useWorkflowTemplateAccess());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canRun: true,
      loading: false,
    });
    for (const check of [
      service.canCreate,
      service.canUpdate,
      service.canDelete,
      service.canRun,
    ]) {
      expect(check).toHaveBeenCalledWith('test-namespace');
    }
  });

  it('keeps each action separate', async () => {
    answer({ create: false, update: true, delete: false, run: true });

    const { result } = renderHook(() => useWorkflowTemplateAccess());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      canCreate: false,
      canUpdate: true,
      canDelete: false,
      canRun: true,
      loading: false,
    });
  });

  it('treats a failed check as not allowed', async () => {
    answer({
      create: true,
      update: true,
      delete: new Error('network down'),
      run: new Error('network down'),
    });

    const { result } = renderHook(() => useWorkflowTemplateAccess());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({
      canCreate: true,
      canUpdate: true,
      canDelete: false,
      canRun: false,
    });
  });
});
