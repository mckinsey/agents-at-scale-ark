import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAllAgents = vi.fn().mockResolvedValue([
  { name: 'agent-1', id: 'agent-1' },
  { name: 'agent-2', id: 'agent-2' },
]);

vi.mock('@/lib/services', () => ({
  agentsService: {
    getAll: (...args: unknown[]) => mockGetAllAgents(...args),
    getByName: vi.fn().mockResolvedValue({
      name: 'test-agent',
      id: 'test-agent',
      description: '',
      tools: [],
      parameters: [],
    }),
  },
  modelsService: {
    getAll: vi.fn().mockResolvedValue([]),
  },
  toolsService: {
    getAll: vi.fn().mockResolvedValue([]),
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

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

vi.mock('@/components/chat/embedded-chat-panel', () => ({
  EmbeddedChatPanel: () => <div data-testid="chat-panel" />,
}));

vi.mock('@/components/common/panel-toggle-button', () => ({
  PanelToggleButton: () => <div />,
}));

vi.mock('@/components/common/yaml-viewer', () => ({
  YamlViewer: () => <div />,
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({ children, ...props }: { children: React.ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
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

import { AgentForm } from '@/components/forms/agent-form/agent-form';
import { AgentFormMode } from '@/components/forms/agent-form/types';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('AgentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass namespace to agentsService.getAll in VIEW mode', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentForm
          mode={AgentFormMode.VIEW}
          agentName="test-agent"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockGetAllAgents).toHaveBeenCalledWith(mockNamespace);
    });
  });
});
