import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentForm } from '@/components/forms/agent-form/agent-form';
import { AgentFormMode } from '@/components/forms/agent-form/types';
import { SidebarProvider } from '@/components/ui/sidebar';
import { agentsService, modelsService, toolsService } from '@/lib/services';

vi.mock('@/lib/services/agents', () => ({
  agentsService: {
    getByName: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/services/models', () => ({
  modelsService: {
    getAll: vi.fn(),
  },
}));

vi.mock('@/lib/services/tools', () => ({
  toolsService: {
    getAll: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/agents/test-agent',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

global.EventSource = vi.fn(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  readyState: 0,
  url: '',
  withCredentials: false,
  CONNECTING: 0,
  OPEN: 1,
  CLOSED: 2,
  onerror: null,
  onmessage: null,
  onopen: null,
  dispatchEvent: vi.fn(),
})) as unknown as typeof EventSource;

global.fetch = vi.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ items: [], total: 0, hasMore: false }),
  } as Response),
);

let queryClient: QueryClient;
let store: ReturnType<typeof createStore>;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  store = createStore();
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

function renderAgentForm(props: {
  mode: typeof AgentFormMode.CREATE | typeof AgentFormMode.EDIT | typeof AgentFormMode.VIEW;
  agentName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>
        <SidebarProvider>
          <AgentForm {...props} />
        </SidebarProvider>
      </JotaiProvider>
    </QueryClientProvider>,
  );
}

const mockAgent = {
  name: 'test-agent',
  namespace: 'default',
  description: 'Test agent description',
  prompt: 'You are a test agent',
  modelRef: {
    name: 'test-model',
    namespace: 'default',
  },
  tools: [
    {
      name: 'test-tool',
      type: 'custom' as const,
    },
  ],
  parameters: [
    {
      name: 'test-param',
      value: 'test-value',
    },
  ],
  isA2A: false,
  skills: [],
};

const mockModels = [
  {
    name: 'test-model',
    namespace: 'default',
    provider: 'openai',
  },
];

const mockTools = [
  {
    name: 'test-tool',
    namespace: 'default',
    description: 'Test tool',
  },
];

describe('AgentForm', () => {
  describe('CREATE mode', () => {
    it('should render create form with empty fields', async () => {
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.CREATE });

      await waitFor(() => {
        expect(screen.getAllByText('Create Agent').length).toBeGreaterThan(0);
      });
    });

    it('should display prompt editor and configuration panels', async () => {
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.CREATE });

      await waitFor(() => {
        expect(screen.getByText('Agent Prompt')).toBeInTheDocument();
        expect(screen.getByText('Configuration')).toBeInTheDocument();
      });
    });

    it('should show save button', async () => {
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.CREATE });

      await waitFor(() => {
        expect(screen.getAllByText('Create Agent').length).toBeGreaterThan(0);
      });
    });
  });

  describe('EDIT mode', () => {
    it('should load and display agent data', async () => {
      vi.mocked(agentsService.getByName).mockResolvedValue(mockAgent);
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.EDIT, agentName: 'test-agent' });

      await waitFor(() => {
        expect(screen.getByDisplayValue('test-agent')).toBeInTheDocument();
      });
    });

    it('should show save changes button', async () => {
      vi.mocked(agentsService.getByName).mockResolvedValue(mockAgent);
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.EDIT, agentName: 'test-agent' });

      await waitFor(() => {
        expect(screen.getByText('Save Changes')).toBeInTheDocument();
      });
    });
  });

  describe('VIEW mode', () => {
    it('should load and display agent data in view mode', async () => {
      vi.mocked(agentsService.getByName).mockResolvedValue(mockAgent);
      vi.mocked(agentsService.getAll).mockResolvedValue([mockAgent]);
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.VIEW, agentName: 'test-agent' });

      await waitFor(() => {
        expect(screen.getAllByText('test-agent').length).toBeGreaterThan(0);
      });
    });

    it('should show embedded chat panel in view mode', async () => {
      vi.mocked(agentsService.getByName).mockResolvedValue(mockAgent);
      vi.mocked(agentsService.getAll).mockResolvedValue([mockAgent]);
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.VIEW, agentName: 'test-agent' });

      await waitFor(() => {
        expect(screen.getByText(/Chat with test-agent/i)).toBeInTheDocument();
      });
    });

    it('should have YAML toggle button', async () => {
      vi.mocked(agentsService.getByName).mockResolvedValue(mockAgent);
      vi.mocked(agentsService.getAll).mockResolvedValue([mockAgent]);
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.VIEW, agentName: 'test-agent' });

      await waitFor(() => {
        expect(screen.getByText('YAML')).toBeInTheDocument();
      });
    });

    it('should toggle YAML view when YAML button is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(agentsService.getByName).mockResolvedValue(mockAgent);
      vi.mocked(agentsService.getAll).mockResolvedValue([mockAgent]);
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.VIEW, agentName: 'test-agent' });

      const yamlButton = await screen.findByText('YAML');
      await user.click(yamlButton);

      await waitFor(() => {
        expect(screen.getByText('Copy')).toBeInTheDocument();
        expect(screen.getByText('Download')).toBeInTheDocument();
      });
    });

    it('should show agent selector dropdown', async () => {
      vi.mocked(agentsService.getByName).mockResolvedValue(mockAgent);
      vi.mocked(agentsService.getAll).mockResolvedValue([
        mockAgent,
        { ...mockAgent, name: 'another-agent' },
      ]);
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.VIEW, agentName: 'test-agent' });

      await waitFor(() => {
        expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
      });
    });
  });

  describe('YAML generation', () => {
    it('should generate correct YAML content', async () => {
      const user = userEvent.setup();
      vi.mocked(agentsService.getByName).mockResolvedValue(mockAgent);
      vi.mocked(agentsService.getAll).mockResolvedValue([mockAgent]);
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.VIEW, agentName: 'test-agent' });

      const yamlButton = await screen.findByText('YAML');
      await user.click(yamlButton);

      await waitFor(() => {
        const yamlContent = screen.getByText(
          /apiVersion: ark\.mckinsey\.com\/v1alpha1/,
        );
        expect(yamlContent).toBeInTheDocument();
      });
    });
  });

  describe('Panel collapse', () => {
    it('should have panel collapse toggle in view mode', async () => {
      vi.mocked(agentsService.getByName).mockResolvedValue(mockAgent);
      vi.mocked(agentsService.getAll).mockResolvedValue([mockAgent]);
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.VIEW, agentName: 'test-agent' });

      await waitFor(() => {
        const toggleButton = screen.getByTitle('Hide configuration');
        expect(toggleButton).toBeInTheDocument();
      });
    });
  });

  describe('Loading state', () => {
    it('should show loading spinner when loading agent data', () => {
      vi.mocked(agentsService.getByName).mockImplementation(
        () => new Promise(() => {}),
      );
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      const { container } = renderAgentForm({
        mode: AgentFormMode.EDIT,
        agentName: 'test-agent',
      });

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeTruthy();
    });
  });

  describe('Error handling', () => {
    it('should show error message when agent not found', async () => {
      vi.mocked(agentsService.getByName).mockResolvedValue(null);
      vi.mocked(modelsService.getAll).mockResolvedValue(mockModels);
      vi.mocked(toolsService.getAll).mockResolvedValue(mockTools);

      renderAgentForm({ mode: AgentFormMode.EDIT, agentName: 'nonexistent' });

      await waitFor(() => {
        expect(screen.getByText('Agent not found')).toBeInTheDocument();
      });
    });
  });
});
