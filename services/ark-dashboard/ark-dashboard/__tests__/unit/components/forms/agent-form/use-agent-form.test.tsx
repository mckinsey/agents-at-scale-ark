import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentFormMode } from '@/components/forms/agent-form/types';
import { useAgentForm } from '@/components/forms/agent-form/use-agent-form';
import type { Agent, Tool } from '@/lib/services';
import {
  agentsService,
  executionEnginesService,
  modelsService,
  toolsService,
} from '@/lib/services';

vi.mock('@/lib/services', () => ({
  agentsService: {
    getByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  modelsService: {
    list: vi.fn(),
  },
  toolsService: {
    getAll: vi.fn(),
  },
  executionEnginesService: {
    getAll: vi.fn(),
  },
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockNamespace = 'default';
vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: mockNamespace,
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  })),
}));

const mockAgentsService = vi.mocked(agentsService);
const mockModelsService = vi.mocked(modelsService);
const mockToolsService = vi.mocked(toolsService);
const mockExecutionEnginesService = vi.mocked(executionEnginesService);

const builtinTool: Tool = { id: 'noop', name: 'noop', type: 'builtin' };
const untypedTool: Tool = { id: 'legacy-tool', name: 'legacy-tool' };

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderUseAgentForm = (options: Parameters<typeof useAgentForm>[0]) => {
  const client = createQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useAgentForm(options), { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockModelsService.list.mockResolvedValue([]);
  mockToolsService.getAll.mockResolvedValue([builtinTool, untypedTool]);
  mockExecutionEnginesService.getAll.mockResolvedValue([]);
});

describe('useAgentForm', () => {
  it('should use the tool type when a tool is selected', async () => {
    const { result } = renderUseAgentForm({ mode: AgentFormMode.CREATE });

    await waitFor(() => {
      expect(result.current.state.toolsLoading).toBe(false);
    });

    act(() => {
      result.current.actions.handleToolToggle(builtinTool, true);
    });

    expect(result.current.state.selectedTools).toEqual([
      { type: 'builtin', name: 'noop' },
    ]);
  });

  it('should fall back to custom when the tool has no type', async () => {
    const { result } = renderUseAgentForm({ mode: AgentFormMode.CREATE });

    await waitFor(() => {
      expect(result.current.state.toolsLoading).toBe(false);
    });

    act(() => {
      result.current.actions.handleToolToggle(untypedTool, true);
    });

    expect(result.current.state.selectedTools).toEqual([
      { type: 'custom', name: 'legacy-tool' },
    ]);
  });

  it('should replace a custom type with the tool type when a tool is re-selected in EDIT mode', async () => {
    const agent: Agent = {
      id: 'simple-agent',
      name: 'simple-agent',
      namespace: mockNamespace,
      isA2A: false,
      tools: [{ type: 'custom', name: 'noop' }],
    };
    mockAgentsService.getByName.mockResolvedValue(agent);

    const { result } = renderUseAgentForm({
      mode: AgentFormMode.EDIT,
      agentName: 'simple-agent',
    });

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(mockAgentsService.getByName).toHaveBeenCalledWith(
      mockNamespace,
      'simple-agent',
    );
    expect(result.current.state.selectedTools).toEqual([
      { type: 'custom', name: 'noop' },
    ]);

    act(() => {
      result.current.actions.handleToolToggle(builtinTool, false);
    });
    act(() => {
      result.current.actions.handleToolToggle(builtinTool, true);
    });

    expect(result.current.state.selectedTools).toEqual([
      { type: 'builtin', name: 'noop' },
    ]);
  });
});
