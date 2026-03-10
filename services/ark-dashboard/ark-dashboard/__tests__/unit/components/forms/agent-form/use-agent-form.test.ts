import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetByName = vi.fn().mockResolvedValue({
  name: 'test-agent',
  id: 'test-agent',
  description: 'A test agent',
  tools: [],
  parameters: [],
});
const mockGetAllModels = vi.fn().mockResolvedValue([]);
const mockGetAllTools = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/services', () => ({
  agentsService: {
    getByName: (...args: unknown[]) => mockGetByName(...args),
  },
  modelsService: {
    getAll: (...args: unknown[]) => mockGetAllModels(...args),
  },
  toolsService: {
    getAll: (...args: unknown[]) => mockGetAllTools(...args),
  },
}));

vi.mock('@/lib/services/agents-hooks', () => ({
  GET_ALL_AGENTS_QUERY_KEY: 'agents',
}));

const mockNamespace = 'test-ns';
vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: mockNamespace,
    isNamespaceResolved: true,
    availableNamespaces: [{ name: mockNamespace }],
    isPending: false,
    setNamespace: vi.fn(),
    createNamespace: vi.fn(),
    readOnlyMode: false,
  })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock('jotai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jotai')>();
  return {
    ...actual,
    useAtomValue: vi.fn(() => false),
  };
});

import { AgentFormMode } from '@/components/forms/agent-form/types';
import { useAgentForm } from '@/components/forms/agent-form/use-agent-form';

describe('useAgentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass namespace to agentsService.getByName in EDIT mode', async () => {
    renderHook(() =>
      useAgentForm({
        mode: AgentFormMode.EDIT,
        agentName: 'test-agent',
      }),
    );

    await waitFor(() => {
      expect(mockGetByName).toHaveBeenCalledWith('test-agent', mockNamespace);
    });
  });

  it('should pass namespace to agentsService.getByName in VIEW mode', async () => {
    renderHook(() =>
      useAgentForm({
        mode: AgentFormMode.VIEW,
        agentName: 'test-agent',
      }),
    );

    await waitFor(() => {
      expect(mockGetByName).toHaveBeenCalledWith('test-agent', mockNamespace);
    });
  });

  it('should pass namespace to modelsService.getAll and toolsService.getAll', async () => {
    renderHook(() =>
      useAgentForm({
        mode: AgentFormMode.EDIT,
        agentName: 'test-agent',
      }),
    );

    await waitFor(() => {
      expect(mockGetAllModels).toHaveBeenCalledWith(mockNamespace);
      expect(mockGetAllTools).toHaveBeenCalledWith(mockNamespace);
    });
  });
});
