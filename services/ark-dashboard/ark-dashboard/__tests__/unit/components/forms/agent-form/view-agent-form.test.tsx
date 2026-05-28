import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Agent } from '@/lib/services';

const useAgentFormMock = vi.fn();
const mockPush = vi.fn();

vi.mock('@/components/forms/agent-form/use-agent-form', () => ({
  useAgentForm: () => useAgentFormMock(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: false }),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: mockPush }),
}));

vi.mock('@/lib/services', () => ({
  agentsService: {
    getAll: vi.fn().mockResolvedValue([]),
    getRawResource: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/lib/utils/kubernetes-yaml', () => ({
  toKubernetesYaml: () => 'yaml-output',
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({ children }: { children: React.ReactNode }) => (
    <a>{children}</a>
  ),
}));

vi.mock('@/components/common/panel-toggle-button', () => ({
  PanelToggleButton: () => <button data-testid="panel-toggle" />,
}));

vi.mock('@/components/common/yaml-viewer', () => ({
  YamlViewer: () => <div data-testid="yaml-viewer" />,
}));

vi.mock('@/components/chat/agent-chat-panel', () => ({
  AgentChatPanel: () => <div data-testid="agent-chat-panel" />,
}));

vi.mock('@/components/ui/prompt-editor', () => ({
  PromptEditor: () => <div data-testid="prompt-editor" />,
}));

vi.mock('@/components/ui/parameter-editor', () => ({
  ParameterEditor: () => <div data-testid="parameter-editor" />,
}));

vi.mock('@/components/forms/agent-form/sections', () => ({
  SkillsDisplaySection: () => <div data-testid="skills-display-section" />,
}));

vi.mock('@/components/ui/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormField: ({
    render,
  }: {
    render: (args: {
      field: { value: string; onChange: () => void };
      fieldState: { error: undefined };
    }) => React.ReactNode;
  }) => (
    <>
      {render({
        field: { value: '', onChange: () => {} },
        fieldState: { error: undefined },
      })}
    </>
  ),
  FormItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormControl: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormMessage: () => null,
}));

import { ViewAgentForm } from '@/components/forms/agent-form/view-agent-form';

function buildHook(overrides: Record<string, unknown> = {}) {
  return {
    form: {
      watch: vi.fn(() => ''),
      handleSubmit: vi.fn(() => vi.fn()),
      formState: { isSubmitting: false },
      control: {},
    },
    state: {
      loading: false,
      saving: false,
      agent: { name: 'a1', isA2A: false, skills: [] } as unknown as Agent,
      models: [],
      executionEngines: [],
      availableTools: [],
      toolsLoading: false,
      selectedTools: [],
      unavailableTools: [],
      parameters: [],
      isExperimentalExecutionEngineEnabled: false,
      hasChanges: false,
      ...overrides,
    },
    actions: {
      setParameters: vi.fn(),
      handleToolToggle: vi.fn(),
      handleDeleteTool: vi.fn(),
      isToolSelected: vi.fn(),
      onSubmit: vi.fn(),
    },
  };
}

describe('ViewAgentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the loading spinner while loading', () => {
    useAgentFormMock.mockReturnValue(buildHook({ loading: true, agent: null }));
    const { container } = render(<ViewAgentForm mode="view" agentName="a1" />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders "Agent not found" when agent is null', () => {
    useAgentFormMock.mockReturnValue(buildHook({ agent: null }));
    render(<ViewAgentForm mode="view" agentName="missing" />);
    expect(screen.getByText('Agent not found')).toBeInTheDocument();
  });

  it('renders the form sections + chat panel for non-A2A agents', () => {
    useAgentFormMock.mockReturnValue(buildHook());
    render(<ViewAgentForm mode="view" agentName="a1" />);
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Agent Prompt')).toBeInTheDocument();
    expect(screen.getByTestId('parameter-editor')).toBeInTheDocument();
    expect(screen.getByTestId('agent-chat-panel')).toBeInTheDocument();
    expect(
      screen.queryByTestId('skills-display-section'),
    ).not.toBeInTheDocument();
  });

  it('renders Skills section for A2A agents', () => {
    useAgentFormMock.mockReturnValue(
      buildHook({ agent: { name: 'a2a', isA2A: true, skills: [] } }),
    );
    render(<ViewAgentForm mode="view" agentName="a2a" />);
    expect(screen.getByTestId('skills-display-section')).toBeInTheDocument();
    expect(screen.queryByText('Agent Prompt')).not.toBeInTheDocument();
  });

  it('disables Save Changes when hasChanges is false', () => {
    useAgentFormMock.mockReturnValue(buildHook({ hasChanges: false }));
    render(<ViewAgentForm mode="view" agentName="a1" />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('toggles the YAML viewer when the YAML button is clicked', async () => {
    useAgentFormMock.mockReturnValue(buildHook());
    render(<ViewAgentForm mode="view" agentName="a1" />);
    expect(screen.queryByTestId('yaml-viewer')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /yaml/i }));
    expect(screen.getByTestId('yaml-viewer')).toBeInTheDocument();
  });
});
