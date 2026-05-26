import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Agent } from '@/lib/services';

const useAgentFormMock = vi.fn();

vi.mock('@/components/forms/agent-form/use-agent-form', () => ({
  useAgentForm: () => useAgentFormMock(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: false }),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({ children }: { children: React.ReactNode }) => (
    <a>{children}</a>
  ),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({
    actions,
    currentPage,
  }: {
    actions?: React.ReactNode;
    currentPage?: string;
  }) => (
    <div data-testid="page-header">
      <span>{currentPage}</span>
      {actions}
    </div>
  ),
}));

vi.mock('@/components/ui/prompt-editor', () => ({
  PromptEditor: () => <div data-testid="prompt-editor" />,
}));

vi.mock('@/components/ui/parameter-editor', () => ({
  ParameterEditor: () => <div data-testid="parameter-editor" />,
}));

vi.mock('@/components/forms/agent-form/sections', () => ({
  BasicInfoSection: () => <div data-testid="basic-info-section" />,
  ModelConfigSection: () => <div data-testid="model-config-section" />,
  SkillsDisplaySection: () => <div data-testid="skills-display-section" />,
  ToolSelectionSection: () => <div data-testid="tool-selection-section" />,
}));

vi.mock('@/components/ui/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormField: ({
    render,
  }: {
    render: (args: { field: { value: string; onChange: () => void } }) => React.ReactNode;
  }) => <>{render({ field: { value: '', onChange: () => {} } })}</>,
  FormItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormControl: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormMessage: () => null,
}));

import { EditAgentForm } from '@/components/forms/agent-form/edit-agent-form';

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
      agent: { name: 'a1', isA2A: false } as unknown as Agent,
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

describe('EditAgentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the loading spinner when loading', () => {
    useAgentFormMock.mockReturnValue(buildHook({ loading: true, agent: null }));
    const { container } = render(<EditAgentForm mode="edit" />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders "Agent not found" when agent is null and not loading', () => {
    useAgentFormMock.mockReturnValue(buildHook({ agent: null }));
    render(<EditAgentForm mode="edit" />);
    expect(screen.getByText('Agent not found')).toBeInTheDocument();
  });

  it('renders the form with both panels for non-A2A agents', () => {
    useAgentFormMock.mockReturnValue(buildHook());
    render(<EditAgentForm mode="edit" />);
    expect(screen.getByTestId('prompt-editor')).toBeInTheDocument();
    expect(screen.getByTestId('basic-info-section')).toBeInTheDocument();
    expect(screen.getByTestId('model-config-section')).toBeInTheDocument();
    expect(screen.getByTestId('tool-selection-section')).toBeInTheDocument();
    expect(screen.queryByTestId('skills-display-section')).not.toBeInTheDocument();
  });

  it('hides prompt panel and renders Skills section for A2A agents', () => {
    useAgentFormMock.mockReturnValue(
      buildHook({ agent: { name: 'a2a', isA2A: true } }),
    );
    render(<EditAgentForm mode="edit" />);
    expect(screen.queryByTestId('prompt-editor')).not.toBeInTheDocument();
    expect(screen.getByTestId('skills-display-section')).toBeInTheDocument();
    expect(
      screen.queryByTestId('tool-selection-section'),
    ).not.toBeInTheDocument();
  });

  it('shows unavailable-tools warning when present', () => {
    useAgentFormMock.mockReturnValue(
      buildHook({
        unavailableTools: [{ name: 'broken', namespace: 'default' }],
      }),
    );
    render(<EditAgentForm mode="edit" />);
    expect(
      screen.getByText(/remove all unavailable tools before saving/i),
    ).toBeInTheDocument();
  });

  it('disables Save when saving is true', () => {
    useAgentFormMock.mockReturnValue(buildHook({ saving: true }));
    render(<EditAgentForm mode="edit" />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });
});
