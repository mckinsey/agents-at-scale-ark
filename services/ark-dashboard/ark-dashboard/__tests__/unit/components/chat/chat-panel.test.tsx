import { render, screen } from '@testing-library/react';
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
