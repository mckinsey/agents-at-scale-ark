import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatPanel } from '@/components/chat/chat-panel';
import { useChatSession } from '@/lib/hooks';

vi.mock('@/lib/hooks', () => ({
  useChatSession: vi.fn(),
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
    supportsOutputSchema: false,
    hasOwnOutputSchema: false,
    outputSchemaOverride: '',
    setOutputSchemaOverride: vi.fn(),
    isOutputSchemaOverrideValid: true,
    ...overrides,
  };
}

function renderChatPanel(overrides: Partial<ChatSession> = {}) {
  vi.mocked(useChatSession).mockReturnValue(chatSession(overrides));
  return render(<ChatPanel name="test-agent" type="agent" />);
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

describe('ChatPanel output schema override', () => {
  it('hides the override toggle when the target does not support it', () => {
    renderChatPanel({ supportsOutputSchema: false });

    expect(
      screen.queryByRole('button', { name: 'Output schema override' }),
    ).not.toBeInTheDocument();
  });

  it('opens the schema editor from the toggle', async () => {
    const user = userEvent.setup();
    renderChatPanel({ supportsOutputSchema: true });

    expect(screen.queryByLabelText('Output schema')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Output schema override' }),
    );

    expect(screen.getByLabelText('Output schema')).toBeInTheDocument();
  });

  it('blocks sending while the override is invalid', async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn(async () => {});
    renderChatPanel({
      supportsOutputSchema: true,
      outputSchemaOverride: '{"type":',
      isOutputSchemaOverrideValid: false,
      sendMessage,
    });

    await user.type(
      screen.getByPlaceholderText('Type your message...'),
      'Hello{Enter}',
    );

    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('explains why sending is blocked while the editor is collapsed', async () => {
    const user = userEvent.setup();
    renderChatPanel({
      supportsOutputSchema: true,
      outputSchemaOverride: '{"type":',
      isOutputSchemaOverrideValid: false,
    });

    expect(
      screen.getByText(/The output schema override is invalid/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Output schema override' }),
    );

    expect(
      screen.queryByText(/The output schema override is invalid/),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Output schema')).toBeInTheDocument();
  });

  it('marks the toggle by override validity', () => {
    const { unmount } = renderChatPanel({
      supportsOutputSchema: true,
      outputSchemaOverride: '{"type":"object"}',
      isOutputSchemaOverrideValid: true,
    });
    const toggle = () =>
      screen.getByRole('button', { name: 'Output schema override' });

    expect(toggle().querySelector('.bg-status-success')).not.toBeNull();
    expect(toggle().querySelector('.bg-status-error')).toBeNull();
    unmount();

    renderChatPanel({
      supportsOutputSchema: true,
      outputSchemaOverride: '{"type":',
      isOutputSchemaOverrideValid: false,
    });

    expect(toggle().querySelector('.bg-status-error')).not.toBeNull();
    expect(toggle().querySelector('.bg-status-success')).toBeNull();
  });

  it('disables the override when the agent has its own schema', () => {
    renderChatPanel({
      supportsOutputSchema: true,
      hasOwnOutputSchema: true,
      outputSchemaOverride: '{"type":',
      isOutputSchemaOverrideValid: false,
    });

    expect(
      screen.getByRole('button', { name: 'Output schema override' }),
    ).toBeDisabled();
    expect(
      screen.queryByText(/The output schema override is invalid/),
    ).not.toBeInTheDocument();
  });
});
