import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services', () => ({
  toolsService: {
    create: vi.fn(),
    getDetail: vi.fn(),
  },
  agentsService: {
    list: vi.fn(),
  },
  teamsService: {
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

import { toast } from '@/components/ui/sonner';
import { agentsService, teamsService, toolsService } from '@/lib/services';

import { useToolForm } from '@/components/forms/tool-form/use-tool-form';
import {
  ToolFormMode,
  type ToolFormValues,
} from '@/components/forms/tool-form/types';

const mockToolsService = vi.mocked(toolsService);
const mockAgentsService = vi.mocked(agentsService);
const mockTeamsService = vi.mocked(teamsService);
const mockToast = vi.mocked(toast);

function values(overrides: Partial<ToolFormValues> = {}): ToolFormValues {
  return {
    name: 'my-tool',
    type: 'mcp',
    description: 'desc',
    inputSchema: '{"a":1}',
    annotations: '',
    httpUrl: '',
    selectedAgent: '',
    selectedTeam: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAgentsService.list.mockResolvedValue([]);
  mockTeamsService.getAll.mockResolvedValue([]);
  mockToolsService.create.mockResolvedValue(undefined);
});

describe('useToolForm', () => {
  it('initializes with empty defaults and not saving', () => {
    const { result } = renderHook(() => useToolForm({ mode: ToolFormMode.CREATE }));
    expect(result.current.state.saving).toBe(false);
    expect(result.current.state.selectedType).toBe('');
    expect(result.current.form.getValues('name')).toBe('');
  });

  it('creates a tool and calls onSuccess on submit', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useToolForm({ mode: ToolFormMode.CREATE, onSuccess }));

    await act(async () => {
      await result.current.actions.onSubmit(values());
    });

    expect(mockToolsService.create).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        name: 'my-tool',
        type: 'mcp',
        description: 'desc',
        inputSchema: { a: 1 },
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('includes the url for http tools', async () => {
    const { result } = renderHook(() => useToolForm({ mode: ToolFormMode.CREATE }));

    await act(async () => {
      await result.current.actions.onSubmit(
        values({ type: 'http', httpUrl: 'https://x.dev' }),
      );
    });

    expect(mockToolsService.create).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ url: 'https://x.dev' }),
    );
  });

  it('includes agent/team for agent and team tools', async () => {
    const { result } = renderHook(() => useToolForm({ mode: ToolFormMode.CREATE }));

    await act(async () => {
      await result.current.actions.onSubmit(
        values({ type: 'agent', selectedAgent: 'agent-1' }),
      );
    });
    expect(mockToolsService.create).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ agent: 'agent-1' }),
    );

    await act(async () => {
      await result.current.actions.onSubmit(
        values({ type: 'team', selectedTeam: 'team-1' }),
      );
    });
    expect(mockToolsService.create).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ team: 'team-1' }),
    );
  });

  it('rejects invalid input schema JSON without calling create', async () => {
    const { result } = renderHook(() => useToolForm({ mode: ToolFormMode.CREATE }));

    await act(async () => {
      await result.current.actions.onSubmit(values({ inputSchema: '{bad' }));
    });

    expect(mockToast.error).toHaveBeenCalledWith(
      'Invalid Input Schema',
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(mockToolsService.create).not.toHaveBeenCalled();
  });

  it('rejects invalid annotations JSON without calling create', async () => {
    const { result } = renderHook(() => useToolForm({ mode: ToolFormMode.CREATE }));

    await act(async () => {
      await result.current.actions.onSubmit(
        values({ annotations: '{bad' }),
      );
    });

    expect(mockToast.error).toHaveBeenCalledWith(
      'Invalid Annotations',
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(mockToolsService.create).not.toHaveBeenCalled();
  });

  it('shows an error toast when create fails', async () => {
    mockToolsService.create.mockRejectedValue(new Error('Network error'));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useToolForm({ mode: ToolFormMode.CREATE, onSuccess }));

    await act(async () => {
      await result.current.actions.onSubmit(values());
    });

    expect(mockToast.error).toHaveBeenCalledWith(
      'Failed to Create Tool',
      expect.objectContaining({ description: 'Network error' }),
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.state.saving).toBe(false);
  });

  it('loads agents when type becomes agent', async () => {
    mockAgentsService.list.mockResolvedValue([{ name: 'agent-1' }] as never);
    const { result } = renderHook(() => useToolForm({ mode: ToolFormMode.CREATE }));

    act(() => {
      result.current.form.setValue('type', 'agent');
    });

    await waitFor(() => {
      expect(mockAgentsService.list).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(result.current.state.agents).toEqual([{ name: 'agent-1' }]);
    });
    expect(result.current.state.agentsLoading).toBe(false);
  });

  it('loads teams when type becomes team', async () => {
    mockTeamsService.getAll.mockResolvedValue([{ name: 'team-1' }] as never);
    const { result } = renderHook(() => useToolForm({ mode: ToolFormMode.CREATE }));

    act(() => {
      result.current.form.setValue('type', 'team');
    });

    await waitFor(() => {
      expect(mockTeamsService.getAll).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(result.current.state.teams).toEqual([{ name: 'team-1' }]);
    });
    expect(result.current.state.teamsLoading).toBe(false);
  });
});

describe('useToolForm — view mode', () => {
  const detail = {
    name: 'my-tool',
    description: 'desc',
    annotations: { note: 'x' },
    spec: {
      type: 'http',
      inputSchema: { a: 1 },
      http: { url: 'https://x.dev' },
    },
  };

  beforeEach(() => {
    mockToolsService.getDetail.mockResolvedValue(detail as never);
  });

  it('fetches the tool and prefills the form', async () => {
    const { result } = renderHook(() =>
      useToolForm({ mode: ToolFormMode.VIEW, toolName: 'my-tool' }),
    );

    await waitFor(() => {
      expect(mockToolsService.getDetail).toHaveBeenCalledWith('default', 'my-tool');
    });
    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.tool).toEqual(detail);
    expect(result.current.form.getValues('name')).toBe('my-tool');
    expect(result.current.form.getValues('type')).toBe('http');
    expect(result.current.form.getValues('description')).toBe('desc');
    expect(result.current.form.getValues('httpUrl')).toBe('https://x.dev');
    expect(result.current.form.getValues('inputSchema')).toContain('"a": 1');
    expect(result.current.form.getValues('annotations')).toContain('"note"');
  });
});
