import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ViewAgentForm } from '@/components/forms/agent-form/view-agent-form';
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
    list: vi.fn().mockResolvedValue([]),
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

vi.mock('@/components/chat/embedded-chat-panel', () => ({
  EmbeddedChatPanel: () => <div data-testid="embedded-chat-panel" />,
}));

vi.mock('@/components/ui/prompt-editor', () => ({
  PromptEditor: () => <div data-testid="prompt-editor" />,
}));

vi.mock('@/components/ui/parameter-editor', () => ({
  ParameterEditor: () => <div data-testid="parameter-editor" />,
}));

vi.mock('@/components/forms/agent-form/sections', () => ({
  SkillsDisplaySection: () => <div data-testid="skills-display-section" />,
  A2AManagedInfo: () => <div data-testid="a2a-managed-info" />,
  AgentStreamingField: ({
    streamingSupported,
  }: {
    streamingSupported?: string;
  }) => <div data-testid="agent-streaming-field">{streamingSupported}</div>,
  AgentOriginField: ({ a2aServerName }: { a2aServerName?: string }) => (
    <div data-testid="agent-origin-field">{a2aServerName ?? 'ARK'}</div>
  ),
}));

vi.mock('@/components/forms/shared/custom-headers-field', () => ({
  CustomHeadersField: () => <div data-testid="custom-headers-field" />,
}));

vi.mock('@/components/ui/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormField: ({
    render: renderField,
  }: {
    render: (args: {
      field: { value: string; onChange: () => void };
      fieldState: { error: undefined };
    }) => React.ReactNode;
  }) => (
    <>
      {renderField({
        field: { value: '', onChange: () => {} },
        fieldState: { error: undefined },
      })}
    </>
  ),
  FormItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormControl: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormMessage: () => null,
}));

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
      isOutputSchemaSupported: vi.fn((_engineName?: string) => false),
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
    expect(screen.getByText('Prompt')).toBeInTheDocument();
    expect(screen.getByTestId('parameter-editor')).toBeInTheDocument();
    expect(screen.getByTestId('embedded-chat-panel')).toBeInTheDocument();
    expect(
      screen.queryByTestId('skills-display-section'),
    ).not.toBeInTheDocument();
  });

  it('renders the Output Schema field for openai-responses agents', () => {
    const hook = buildHook();
    hook.form.watch = vi.fn((field?: string) =>
      field === 'executionEngineName' ? 'executor-openai-responses' : '',
    );
    hook.actions.isOutputSchemaSupported.mockReturnValue(true);
    useAgentFormMock.mockReturnValue(hook);
    render(<ViewAgentForm mode="view" agentName="a1" />);
    expect(screen.getByText('Output Schema')).toBeInTheDocument();
    expect(screen.getByLabelText('Output schema')).toBeInTheDocument();
    expect(hook.actions.isOutputSchemaSupported).toHaveBeenCalledWith(
      'executor-openai-responses',
    );
  });

  it('hides the Output Schema field for other engines', () => {
    useAgentFormMock.mockReturnValue(buildHook());
    render(<ViewAgentForm mode="view" agentName="a1" />);
    expect(screen.queryByText('Output Schema')).not.toBeInTheDocument();
  });

  it('renders Skills section for A2A agents', () => {
    useAgentFormMock.mockReturnValue(
      buildHook({ agent: { name: 'a2a', isA2A: true, skills: [] } }),
    );
    render(<ViewAgentForm mode="view" agentName="a2a" />);
    expect(screen.getByTestId('skills-display-section')).toBeInTheDocument();
    expect(screen.queryByText('Prompt')).not.toBeInTheDocument();
  });

  it('disables Save Changes when hasChanges is false', () => {
    useAgentFormMock.mockReturnValue(buildHook({ hasChanges: false }));
    render(<ViewAgentForm mode="view" agentName="a1" />);
    expect(
      screen.getByRole('button', { name: /save changes/i }),
    ).toBeDisabled();
  });

  it('toggles the YAML viewer when the YAML button is clicked', async () => {
    useAgentFormMock.mockReturnValue(buildHook());
    render(<ViewAgentForm mode="view" agentName="a1" />);
    expect(screen.queryByTestId('yaml-viewer')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /yaml/i }));
    expect(screen.getByTestId('yaml-viewer')).toBeInTheDocument();
  });

  it('blocks editing of agents generated by an A2A server and explains why', () => {
    useAgentFormMock.mockReturnValue(
      buildHook({
        hasChanges: true,
        agent: {
          name: 'simple-agent',
          isA2A: true,
          skills: [],
          annotations: {
            'ark.mckinsey.com/a2a-server-name': 'simple-agent',
            'ark.mckinsey.com/a2a-streaming-supported': 'false',
          },
        },
      }),
    );
    render(<ViewAgentForm mode="view" agentName="simple-agent" />);

    expect(screen.getByTestId('a2a-managed-info')).toBeInTheDocument();
    expect(screen.getByTestId('agent-streaming-field')).toHaveTextContent(
      'false',
    );
    expect(screen.getByTestId('agent-origin-field')).toHaveTextContent(
      'simple-agent',
    );
    expect(
      screen.getByRole('button', { name: /save changes/i }),
    ).toBeDisabled();
  });

  it('does not show the A2A notice for regular agents', () => {
    useAgentFormMock.mockReturnValue(buildHook());
    render(<ViewAgentForm mode="view" agentName="a1" />);
    expect(screen.queryByTestId('a2a-managed-info')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('agent-streaming-field'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-origin-field')).toHaveTextContent('ARK');
  });
});
