import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CHAT_MCP_CREDENTIALS_KEY } from '@/atoms/chat-mcp-credentials';
import { ChatPanel } from '@/components/chat/chat-panel';
import { useChatSession } from '@/lib/hooks';
import { useGetAllMcpServers } from '@/lib/services/mcp-servers-hooks';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';
import { useUser } from '@/providers/UserProvider';

vi.mock('@/lib/hooks', () => ({
  useChatSession: vi.fn(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'team-a',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/providers/UserProvider', () => ({
  useUser: vi.fn(() => ({ user: null })),
}));

vi.mock('@/lib/services/mcp-servers-hooks', () => ({
  useGetAllMcpServers: vi.fn(),
}));

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: vi.fn(),
}));

vi.mock('@/components/forms/shared/create-resource-dialog', () => ({
  CreateResourceButton: () => null,
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/components/icons', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/icons')>();
  return {
    ...actual,
    Info: () => <svg data-testid="info-icon" />,
    Warning: () => <svg data-testid="warning-icon" />,
  };
});

type ChatSession = ReturnType<typeof useChatSession>;

function chatSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    messages: [],
    sessionId: 'session-1',
    isProcessing: false,
    isWaitingForApprovalResponse: false,
    error: null,
    sendMessage: vi.fn(async () => {}),
    clearChat: vi.fn(),
    messagesEndRef: { current: null },
    scrollContainerRef: { current: null },
    handleScroll: vi.fn(),
    cancelQuery: vi.fn(),
    pollAfterApproval: vi.fn(async () => {}),
    parameterVariant: 'agent',
    hasParameters: false,
    availableParameters: [],
    teamAgents: [],
    parameterRows: [],
    addParameterRow: vi.fn(),
    setParameterRowName: vi.fn(),
    setParameterRowValue: vi.fn(),
    setParameterRowAgent: vi.fn(),
    removeParameterRow: vi.fn(),
    canAddParameterRow: false,
    missingParameters: [],
    engineToolWarning: null,
    ...overrides,
  };
}

const NAME_LABEL = 'ark.mckinsey.com/name';

function mcpServer(name: string, labels: Record<string, string> | null) {
  return { id: name, name, namespace: 'team-a', labels };
}

const refetchServers = vi.fn();

function mockMcpServers(
  servers: ReturnType<typeof mcpServer>[] | undefined,
  isPending = false,
) {
  vi.mocked(useGetAllMcpServers).mockReturnValue({
    data: servers,
    isPending,
    refetch: refetchServers,
  } as unknown as ReturnType<typeof useGetAllMcpServers>);
}

type SecretOption = {
  name: string;
  display_name?: string;
  scope?: 'shared' | 'personal';
};

function mockSecrets(secrets: SecretOption[] = []) {
  vi.mocked(useGetAllSecrets).mockReturnValue({
    data: secrets,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useGetAllSecrets>);
}

function storeCredentials(rows: Record<string, string>[]) {
  localStorage.setItem(
    CHAT_MCP_CREDENTIALS_KEY,
    JSON.stringify({ 'team-a': rows }),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(useUser).mockReturnValue({ user: null });
  mockMcpServers([]);
  mockSecrets();
});

function renderChatPanel(
  overrides: Partial<ChatSession> = {},
  type: 'agent' | 'team' | 'model' = 'agent',
) {
  vi.mocked(useChatSession).mockReturnValue(chatSession(overrides));
  return render(
    <Provider store={createStore()}>
      <ChatPanel name="test-agent" type={type} />
    </Provider>,
  );
}

const ENGINE_TOOL_WARNING =
  'executor-claude-agent-sdk will not receive: get-coordinates (http)';

describe('ChatPanel engine tool notice', () => {
  it('renders the engine tool notice when the session reports one', () => {
    renderChatPanel({ engineToolWarning: ENGINE_TOOL_WARNING });

    expect(screen.getByText(ENGINE_TOOL_WARNING)).toBeInTheDocument();
  });

  it('presents the notice as information rather than a warning', () => {
    renderChatPanel({ engineToolWarning: ENGINE_TOOL_WARNING });

    expect(screen.queryByTestId('warning-icon')).not.toBeInTheDocument();

    const iconShell = screen.getByTestId('info-icon').parentElement;
    expect(iconShell).toHaveClass('text-status-information');
    expect(iconShell).not.toHaveClass('text-status-warning');
  });

  it('renders no notice when the session reports no engine tool warning', () => {
    renderChatPanel({ engineToolWarning: null });

    expect(screen.queryByTestId('info-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('warning-icon')).not.toBeInTheDocument();
  });
});

describe('ChatPanel MCP credentials', () => {
  const GITHUB_ROW = {
    id: 'c1',
    server: 'github',
    header: 'Authorization',
    secret: 'u-0123456789abcdef-github',
    key: 'token',
  };
  const BLOCKED_NOTICE =
    'Fix or remove the MCP credentials below to send a message.';

  async function typeMessage() {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Type your message...'), 'Hi');
    return user;
  }

  async function waitForComposerFocus() {
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Type your message...')).toHaveFocus(),
    );
  }

  function sendButton() {
    return screen.getByRole('button', { name: 'Send message' });
  }

  async function expectSendBlocked(sendMessage: ReturnType<typeof vi.fn>) {
    const user = await typeMessage();
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveAccessibleDescription(BLOCKED_NOTICE);
    await user.keyboard('{Enter}');
    expect(sendMessage).not.toHaveBeenCalled();
  }

  it('is hidden when the namespace has no MCP servers', () => {
    renderChatPanel();

    expect(screen.queryByText('MCP credentials')).not.toBeInTheDocument();
  });

  it('starts collapsed when there are no credentials', async () => {
    mockMcpServers([mcpServer('github', { [NAME_LABEL]: 'github' })]);
    renderChatPanel();
    const user = userEvent.setup();

    expect(
      screen.queryByRole('button', { name: 'Add MCP credential' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Expand MCP credentials' }),
    );

    expect(
      screen.getByText(
        'No credentials. MCP servers get only the headers they are configured with.',
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Collapse MCP credentials' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Add MCP credential' }),
    ).not.toBeInTheDocument();
  });

  it('is hidden for a model chat, sends no credentials and is never blocked by them', async () => {
    mockMcpServers([mcpServer('github', null)]);
    storeCredentials([GITHUB_ROW]);
    const sendMessage = vi.fn(async () => {});

    renderChatPanel({ sendMessage }, 'model');

    expect(screen.queryByText('MCP credentials')).not.toBeInTheDocument();
    expect(useChatSession).toHaveBeenLastCalledWith({
      name: 'test-agent',
      type: 'model',
      mcpCredentials: undefined,
      mcpCredentialsBlocked: false,
    });
    expect(useGetAllMcpServers).toHaveBeenCalledWith({ enabled: false });
    const user = await typeMessage();
    await user.keyboard('{Enter}');
    expect(sendMessage).toHaveBeenCalledWith('Hi');
  });

  it('adds a row with the default header and key and focuses its server', async () => {
    mockMcpServers([mcpServer('github', { [NAME_LABEL]: 'github' })]);
    storeCredentials([{ ...GITHUB_ROW, server: '', secret: '' }]);
    renderChatPanel();
    const user = userEvent.setup();
    await waitForComposerFocus();

    await user.click(
      screen.getByRole('button', { name: 'Add MCP credential' }),
    );

    const row = screen.getByRole('group', { name: 'Credential 2' });
    expect(
      within(row).getByLabelText('Header name for credential 2'),
    ).toHaveValue('Authorization');
    expect(
      within(row).getByLabelText('Secret key for credential 2'),
    ).toHaveValue('token');
    expect(
      within(row).getByRole('combobox', { name: 'Secret for credential 2' }),
    ).toBeInTheDocument();
    expect(
      within(row).getByLabelText('MCP server for credential 2'),
    ).toHaveFocus();
  });

  it('stores the server picked for a row', async () => {
    mockMcpServers([mcpServer('github', { [NAME_LABEL]: 'github' })]);
    storeCredentials([{ ...GITHUB_ROW, server: '' }]);
    renderChatPanel();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('MCP server for credential 1'));
    await user.click(await screen.findByRole('option', { name: 'github' }));

    expect(
      screen.getByRole('group', { name: 'Credential for github' }),
    ).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(CHAT_MCP_CREDENTIALS_KEY) ?? '{}')[
        'team-a'
      ][0].server,
    ).toBe('github');
  });

  it('passes a saved credential for a labelled server to the session', () => {
    mockMcpServers([mcpServer('github', { [NAME_LABEL]: 'github' })]);
    storeCredentials([GITHUB_ROW]);

    renderChatPanel();

    expect(useChatSession).toHaveBeenLastCalledWith({
      name: 'test-agent',
      type: 'agent',
      mcpCredentials: [GITHUB_ROW],
      mcpCredentialsBlocked: false,
    });
    expect(screen.queryByText(BLOCKED_NOTICE)).not.toBeInTheDocument();
  });

  it('offers unlabelled and ambiguous servers as disabled choices', async () => {
    mockMcpServers([
      mcpServer('github', { [NAME_LABEL]: 'github' }),
      mcpServer('gitlab', { [NAME_LABEL]: 'gitlab' }),
      mcpServer('gitlab-proxy', { [NAME_LABEL]: 'gitlab' }),
      mcpServer('jira', null),
    ]);
    storeCredentials([{ ...GITHUB_ROW, server: '' }]);
    renderChatPanel();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('MCP server for credential 1'));

    const jira = await screen.findByRole('option', { name: /jira/ });
    expect(jira).toHaveAttribute('aria-disabled', 'true');
    expect(within(jira).getByText('Needs name label')).toBeInTheDocument();
    const gitlab = screen.getByRole('option', {
      name: /^gitlab Name label also/,
    });
    expect(gitlab).toHaveAttribute('aria-disabled', 'true');
    expect(
      within(gitlab).getByText('Name label also on another server'),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'github' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('disables a saved row whose server lost the label and blocks sending', async () => {
    mockMcpServers([mcpServer('github', { team: 'a' })]);
    storeCredentials([GITHUB_ROW]);
    const sendMessage = vi.fn(async () => {});

    renderChatPanel({ sendMessage });

    const row = screen.getByRole('group', { name: 'Credential for github' });
    expect(row).toHaveAccessibleDescription(
      `Label the MCP server with ${NAME_LABEL}=github to send credentials to it.`,
    );
    expect(within(row).getByLabelText('MCP server for github')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(within(row).getByLabelText('Header name for github')).toBeDisabled();
    expect(within(row).getByLabelText('Secret key for github')).toBeDisabled();
    expect(
      within(row).getByRole('combobox', { name: 'Secret for github' }),
    ).toBeDisabled();
    expect(
      within(row).getByRole('button', { name: 'Remove credential for github' }),
    ).toBeEnabled();
    expect(useChatSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mcpCredentials: [],
        mcpCredentialsBlocked: true,
      }),
    );
    expect(screen.getByText(BLOCKED_NOTICE)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^(Collapse|Expand) MCP/ }),
    ).not.toBeInTheDocument();
    await expectSendBlocked(sendMessage);
  });

  it('keeps a row for a deleted server visible, disabled and blocking', async () => {
    mockMcpServers([]);
    storeCredentials([GITHUB_ROW]);
    const sendMessage = vi.fn(async () => {});

    renderChatPanel({ sendMessage });

    const row = screen.getByRole('group', { name: 'Credential for github' });
    expect(row).toHaveAccessibleDescription(
      'The MCP server github is not in this namespace.',
    );
    expect(within(row).getByLabelText('Header name for github')).toBeDisabled();
    expect(within(row).getByLabelText('Secret key for github')).toBeDisabled();
    expect(
      within(row).getByRole('combobox', { name: 'Secret for github' }),
    ).toBeDisabled();
    await expectSendBlocked(sendMessage);
  });

  it('shows why an incomplete row blocks sending and marks the empty field', async () => {
    mockMcpServers([mcpServer('github', { [NAME_LABEL]: 'github' })]);
    storeCredentials([{ ...GITHUB_ROW, key: '' }]);
    const sendMessage = vi.fn(async () => {});

    renderChatPanel({ sendMessage });

    expect(
      screen.getByText('Fill in every field or remove this credential.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Secret key for github')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Header name for github')).not.toHaveAttribute(
      'aria-invalid',
    );
    await expectSendBlocked(sendMessage);
  });

  it('names the repeated header when two rows send it to one server', () => {
    mockMcpServers([mcpServer('github', { [NAME_LABEL]: 'github' })]);
    storeCredentials([
      GITHUB_ROW,
      { ...GITHUB_ROW, id: 'c2', header: ' authorization ' },
    ]);

    renderChatPanel();

    expect(
      screen.getByText(
        'Another credential already sends authorization to github.',
      ),
    ).toBeInTheDocument();
  });

  it('says it is checking while the server list loads', () => {
    mockMcpServers(undefined, true);
    storeCredentials([GITHUB_ROW]);

    renderChatPanel();

    expect(screen.getByText('Checking MCP servers…')).toBeInTheDocument();
    expect(
      screen.queryByText(/Couldn't load the MCP servers/),
    ).not.toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it('offers a retry when the server list fails to load', async () => {
    mockMcpServers(undefined, false);
    storeCredentials([GITHUB_ROW]);
    renderChatPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(refetchServers).toHaveBeenCalled();
  });

  it('sends again once the blocking row is removed and moves focus to Add', async () => {
    mockMcpServers([mcpServer('github', null)]);
    storeCredentials([GITHUB_ROW]);
    renderChatPanel();
    await waitForComposerFocus();
    const user = await typeMessage();

    await user.click(
      screen.getByRole('button', { name: 'Remove credential for github' }),
    );

    expect(sendButton()).toBeEnabled();
    expect(sendButton()).not.toHaveAccessibleDescription();
    expect(
      screen.getByRole('button', { name: 'Add MCP credential' }),
    ).toHaveFocus();
  });

  it('marks a personal secret in the picker for a signed-in user', async () => {
    vi.mocked(useUser).mockReturnValue({
      user: { name: 'Admin', email: 'admin@ark.local' },
    });
    mockMcpServers([mcpServer('github', { [NAME_LABEL]: 'github' })]);
    mockSecrets([
      { name: 'shared-token', display_name: 'shared-token', scope: 'shared' },
      {
        name: 'u-0123456789abcdef-github',
        display_name: 'github',
        scope: 'personal',
      },
    ]);
    localStorage.setItem(
      CHAT_MCP_CREDENTIALS_KEY,
      JSON.stringify({
        'admin@ark.local/team-a': [{ ...GITHUB_ROW, secret: '' }],
      }),
    );
    renderChatPanel();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('combobox', { name: 'Secret for github' }),
    );

    const personal = await screen.findByRole('option', { name: /github/ });
    expect(within(personal).getByText('Personal')).toBeInTheDocument();
    expect(useGetAllSecrets).toHaveBeenCalledWith('all', { enabled: true });
  });

  it('disables the rows while a query runs', () => {
    mockMcpServers([mcpServer('github', { [NAME_LABEL]: 'github' })]);
    storeCredentials([GITHUB_ROW]);

    renderChatPanel({ isProcessing: true });

    expect(
      screen.getByRole('button', { name: 'Add MCP credential' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove credential for github' }),
    ).toBeDisabled();
  });
});
