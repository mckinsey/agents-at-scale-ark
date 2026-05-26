import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Tool } from '@/lib/services';

const useAgentFormMock = vi.fn();
const mockReadOnly = { value: false };

vi.mock('@/components/forms/agent-form/use-agent-form', () => ({
  useAgentForm: () => useAgentFormMock(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: mockReadOnly.value }),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({
    actions,
    customBreadcrumb,
  }: {
    actions?: React.ReactNode;
    customBreadcrumb?: React.ReactNode;
  }) => (
    <div data-testid="page-header">
      {customBreadcrumb}
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

import { CreateAgentForm } from '@/components/forms/agent-form/create-agent-form';

function buildHook(overrides: Record<string, unknown> = {}) {
  return {
    form: {
      watch: vi.fn(() => ''),
      handleSubmit: vi.fn(fn => fn),
      formState: { isSubmitting: false },
      control: {},
    },
    state: {
      loading: false,
      saving: false,
      agent: null,
      models: [],
      executionEngines: [],
      availableTools: [] as Tool[],
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
      isToolSelected: vi.fn(() => false),
      onSubmit: vi.fn(),
    },
  };
}

describe('CreateAgentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadOnly.value = false;
  });

  it('renders the main form with breadcrumb and Create button', () => {
    useAgentFormMock.mockReturnValue(buildHook());
    render(<CreateAgentForm mode="create" />);
    expect(screen.getByText('Create agent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
    expect(screen.getByTestId('prompt-editor')).toBeInTheDocument();
    expect(screen.getByTestId('parameter-editor')).toBeInTheDocument();
  });

  it('Cancel link is wired to /agents', () => {
    useAgentFormMock.mockReturnValue(buildHook());
    render(<CreateAgentForm mode="create" />);
    const cancel = screen.getByRole('link', { name: /cancel/i });
    expect(cancel).toHaveAttribute('href', '/agents');
  });

  it('shows "Select tools" when no tools selected', () => {
    useAgentFormMock.mockReturnValue(
      buildHook({
        availableTools: [{ name: 't1' } as Tool, { name: 't2' } as Tool],
      }),
    );
    render(<CreateAgentForm mode="create" />);
    expect(screen.getByText('Select tools')).toBeInTheDocument();
  });

  it('shows selected-count label when tools are selected', () => {
    const hook = buildHook({
      availableTools: [{ name: 't1' } as Tool, { name: 't2' } as Tool],
    });
    hook.actions.isToolSelected = vi.fn((n: string): boolean => n === 't1');
    useAgentFormMock.mockReturnValue(hook);
    render(<CreateAgentForm mode="create" />);
    expect(screen.getByText('1 tool selected')).toBeInTheDocument();
  });

  it('disables Create button when readOnlyMode is true', () => {
    mockReadOnly.value = true;
    useAgentFormMock.mockReturnValue(buildHook());
    render(<CreateAgentForm mode="create" />);
    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled();
  });

  it('clicking Create button calls actions.onSubmit through form.handleSubmit', async () => {
    const hook = buildHook();
    useAgentFormMock.mockReturnValue(hook);
    render(<CreateAgentForm mode="create" />);
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(hook.form.handleSubmit).toHaveBeenCalledWith(hook.actions.onSubmit);
  });
});
