import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useToolFormMock = vi.fn();
const mockReadOnly = { value: false };

vi.mock('@/components/forms/tool-form/use-tool-form', () => ({
  useToolForm: () => useToolFormMock(),
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

vi.mock('@/components/ui/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormField: ({
    render,
  }: {
    render: (args: {
      field: { value: string; onChange: () => void };
      fieldState: { error?: { message?: string } };
    }) => React.ReactNode;
  }) => (
    <>{render({ field: { value: '', onChange: () => {} }, fieldState: {} })}</>
  ),
}));

import { ToolForm } from '@/components/forms/tool-form/tool-form';
import { ToolFormMode } from '@/components/forms/tool-form/types';

function buildHook(stateOverrides: Record<string, unknown> = {}) {
  return {
    form: {
      handleSubmit: vi.fn(fn => fn),
      control: {},
      formState: { isSubmitting: false },
    },
    state: {
      loading: false,
      saving: false,
      tool: null,
      agents: [],
      teams: [],
      agentsLoading: false,
      teamsLoading: false,
      selectedType: '',
      ...stateOverrides,
    },
    actions: {
      onSubmit: vi.fn(),
    },
  };
}

describe('ToolForm — create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadOnly.value = false;
  });

  it('renders breadcrumb, core fields, and Create button', () => {
    useToolFormMock.mockReturnValue(buildHook());
    render(<ToolForm mode={ToolFormMode.CREATE} />);
    expect(screen.getByText('Create tool')).toBeInTheDocument();
    expect(screen.getByText('New tool configuration')).toBeInTheDocument();
    expect(screen.getByText(/^Name/)).toBeInTheDocument();
    expect(screen.getByText(/^Type/)).toBeInTheDocument();
    expect(screen.getByText(/^Description/)).toBeInTheDocument();
    expect(screen.getByText(/^Input Schema/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^create$/i }),
    ).toBeInTheDocument();
  });

  it('Cancel link is wired to /tools', () => {
    useToolFormMock.mockReturnValue(buildHook());
    render(<ToolForm mode={ToolFormMode.CREATE} />);
    const cancel = screen.getByRole('link', { name: /cancel/i });
    expect(cancel).toHaveAttribute('href', '/tools');
  });

  it('disables Create button when readOnlyMode is true', () => {
    mockReadOnly.value = true;
    useToolFormMock.mockReturnValue(buildHook());
    render(<ToolForm mode={ToolFormMode.CREATE} />);
    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled();
  });

  it('clicking Create calls actions.onSubmit through form.handleSubmit', async () => {
    const hook = buildHook();
    useToolFormMock.mockReturnValue(hook);
    render(<ToolForm mode={ToolFormMode.CREATE} />);
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(hook.form.handleSubmit).toHaveBeenCalledWith(hook.actions.onSubmit);
  });

  it('does not render type-specific fields when no type is selected', () => {
    useToolFormMock.mockReturnValue(buildHook());
    render(<ToolForm mode={ToolFormMode.CREATE} />);
    expect(screen.queryByText(/^URL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Agent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Team/)).not.toBeInTheDocument();
  });

  it('renders the URL field when http type is selected', () => {
    useToolFormMock.mockReturnValue(buildHook({ selectedType: 'http' }));
    render(<ToolForm mode={ToolFormMode.CREATE} />);
    expect(screen.getByText(/^URL/)).toBeInTheDocument();
  });
});

describe('ToolForm — view mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadOnly.value = false;
  });

  it('shows a not-found message when the tool is missing', () => {
    useToolFormMock.mockReturnValue(buildHook({ loading: false, tool: null }));
    render(<ToolForm mode={ToolFormMode.VIEW} toolName="my-tool" />);
    expect(screen.getByText('Tool not found')).toBeInTheDocument();
  });

  it('renders the tool name and a Back button', () => {
    useToolFormMock.mockReturnValue(buildHook({ tool: { name: 'my-tool' } }));
    render(<ToolForm mode={ToolFormMode.VIEW} toolName="my-tool" />);
    expect(
      screen.getByRole('heading', { name: 'my-tool' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back/i })).toBeInTheDocument();
  });

  it('does not render any edit affordance', () => {
    useToolFormMock.mockReturnValue(buildHook({ tool: { name: 'my-tool' } }));
    render(<ToolForm mode={ToolFormMode.VIEW} toolName="my-tool" />);
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
    expect(
      screen.queryByText('You have unsaved changes'),
    ).not.toBeInTheDocument();
  });
});
