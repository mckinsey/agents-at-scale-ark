import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationsTab } from '@/components/sessions-conversations/conversations-tab';
import { useListConversations } from '@/lib/services/conversations-hooks';
import type { Conversation } from '@/lib/services/conversations';

vi.mock('@/lib/services/conversations-hooks');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/sessions-conversations/conversation-sidebar', () => ({
  ConversationSidebar: ({ conversations, selectedId, onSelect }: any) => (
    <div data-testid="conversation-sidebar">
      {conversations.map((conv: any) => (
        <button
          key={conv.conversationId}
          data-testid={`conv-${conv.conversationId}`}
          data-selected={selectedId === conv.conversationId}
          onClick={() => onSelect(conv.conversationId)}
        >
          {conv.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/sessions-conversations/message-display', () => ({
  MessageDisplay: ({ conversationId, showToolCalls, onShowToolCallsChange }: any) => (
    <div data-testid="message-display">
      <div data-testid="conversation-id">{conversationId}</div>
      <div data-testid="show-tool-calls">{showToolCalls ? 'true' : 'false'}</div>
      <button
        data-testid="toggle-tool-calls"
        onClick={() => onShowToolCallsChange(!showToolCalls)}
      >
        toggle
      </button>
    </div>
  ),
}));

describe('ConversationsTab', () => {
  const mockConversations: Conversation[] = [
    {
      conversationId: 'conv-1',
      name: 'agent-1',
      participants: ['agent-1'],
      messageCount: 5,
      toolCallCount: 2,
      duration: '2m',
      startTime: '2024-01-01T00:00:00Z',
      participantType: 'agent',
      errorCount: 0,
    },
    {
      conversationId: 'conv-2',
      name: 'agent-2',
      participants: ['agent-2'],
      messageCount: 3,
      toolCallCount: 0,
      duration: '1m',
      startTime: '2024-01-01T00:05:00Z',
      participantType: 'agent',
      errorCount: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListConversations).mockReturnValue({
      data: mockConversations,
      isLoading: false,
    } as any);
  });

  it('should render conversations list from backend', () => {
    render(<ConversationsTab sessionId="session-1" />);

    expect(screen.getByTestId('conv-conv-1')).toBeInTheDocument();
    expect(screen.getByTestId('conv-conv-2')).toBeInTheDocument();
  });

  it('should auto-select the first conversation', () => {
    render(<ConversationsTab sessionId="session-1" />);

    expect(screen.getByTestId('conversation-id')).toHaveTextContent('conv-1');
  });

  it('should handle conversation selection', async () => {
    const user = userEvent.setup();
    render(<ConversationsTab sessionId="session-1" />);

    await user.click(screen.getByTestId('conv-conv-2'));

    expect(screen.getByTestId('conversation-id')).toHaveTextContent('conv-2');
  });

  it('should show loading skeleton while conversations load', () => {
    vi.mocked(useListConversations).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { container } = render(<ConversationsTab sessionId="session-1" />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it('should show empty state when there are no conversations', () => {
    vi.mocked(useListConversations).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    render(<ConversationsTab sessionId="session-1" />);

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('should own the tool-call visibility state', async () => {
    const user = userEvent.setup();
    render(<ConversationsTab sessionId="session-1" />);

    expect(screen.getByTestId('show-tool-calls')).toHaveTextContent('true');

    await user.click(screen.getByTestId('toggle-tool-calls'));

    expect(screen.getByTestId('show-tool-calls')).toHaveTextContent('false');
  });

  it('should show an error state instead of the empty state when conversations fail to load', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    vi.mocked(useListConversations).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Internal Server Error'),
      refetch,
    } as unknown as ReturnType<typeof useListConversations>);

    render(<ConversationsTab sessionId="session-1" />);

    expect(
      screen.getByText('Failed to load conversations'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No conversations yet')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});
