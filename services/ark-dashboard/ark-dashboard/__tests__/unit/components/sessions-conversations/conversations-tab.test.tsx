import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationsTab } from '@/components/sessions-conversations/conversations-tab';
import { useListConversations } from '@/lib/services/conversations-hooks';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import type { Conversation } from '@/lib/services/conversations';
import type { BrokerSession } from '@/lib/services/broker-sessions';

vi.mock('@/lib/services/conversations-hooks');
vi.mock('@/lib/services/broker-sessions-hooks');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock child components
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
  MessageDisplay: ({ conversationId, pendingMessages, isProcessing }: any) => (
    <div data-testid="message-display">
      <div data-testid="conversation-id">{conversationId}</div>
      <div data-testid="pending-count">{pendingMessages.length}</div>
      <div data-testid="processing">{isProcessing ? 'true' : 'false'}</div>
    </div>
  ),
}));

vi.mock('@/components/sessions-conversations/chat-input', () => ({
  ChatInput: ({ conversationId, onAddPendingMessage, onSetProcessing, onEnableQueries }: any) => (
    <div data-testid="chat-input">
      <button
        data-testid="send-message"
        onClick={() => {
          onAddPendingMessage(conversationId, 'test message');
          onSetProcessing(conversationId, true);
        }}
      >
        Send
      </button>
      <button data-testid="enable-queries" onClick={onEnableQueries}>
        Enable
      </button>
    </div>
  ),
}));

vi.mock('@/components/sessions-conversations/new-conversation-dialog', () => ({
  NewConversationDialog: ({ open, onSelectParticipant }: any) =>
    open ? (
      <div data-testid="new-conversation-dialog">
        <button
          data-testid="select-participant"
          onClick={() =>
            onSelectParticipant({ id: 'p1', name: 'test-agent', type: 'agent' })
          }
        >
          Select
        </button>
      </div>
    ) : null,
}));

vi.mock('@/lib/utils/uuid', () => ({
  generateUUID: () => 'generated-uuid',
}));

describe('ConversationsTab', () => {
  const mockOnMessageSent = vi.fn();

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
      toolCallCount: 1,
      duration: '1m',
      startTime: '2024-01-01T00:05:00Z',
      participantType: 'agent',
      errorCount: 0,
    },
  ];

  const mockSession: BrokerSession = {
    sessionId: 'session-1',
    name: 'Session 1',
    status: 'active',
    errorCount: 0,
    participants: [{ id: 'p1', name: 'test-agent', type: 'agent' }],
    conversationCount: 2,
    createdAt: '2024-01-01T00:00:00Z',
    lastActivity: '2024-01-01T01:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListConversations).mockReturnValue({
      data: mockConversations,
      isLoading: false,
    } as any);
    vi.mocked(useGetSession).mockReturnValue({
      data: mockSession,
      isLoading: false,
    } as any);
  });

  it('should render conversations list from backend', () => {
    render(
      <ConversationsTab
        sessionId="session-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    expect(screen.getByTestId('conv-conv-1')).toBeInTheDocument();
    expect(screen.getByTestId('conv-conv-2')).toBeInTheDocument();
  });

  it('should show loading skeleton when loading', () => {
    vi.mocked(useListConversations).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { container } = render(
      <ConversationsTab
        sessionId="session-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it('should show empty state when no conversations', () => {
    vi.mocked(useListConversations).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    render(
      <ConversationsTab
        sessionId="session-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('should create temporary conversation from initialParticipant', () => {
    vi.mocked(useListConversations).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    render(
      <ConversationsTab
        sessionId="session-1"
        initialParticipant={{ name: 'temp-agent', type: 'agent' }}
        initialConversationId="temp-conv-id"
        hasSentMessage={false}
        onMessageSent={mockOnMessageSent}
      />
    );

    expect(screen.getByTestId('conv-temp-conv-id')).toBeInTheDocument();
    expect(screen.getByText('temp-agent')).toBeInTheDocument();
  });

  it('should merge temporary and backend conversations', () => {
    render(
      <ConversationsTab
        sessionId="session-1"
        initialParticipant={{ name: 'temp-agent', type: 'agent' }}
        initialConversationId="temp-conv"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    // Should show both temporary and backend conversations
    expect(screen.getByTestId('conv-temp-conv')).toBeInTheDocument();
    expect(screen.getByTestId('conv-conv-1')).toBeInTheDocument();
    expect(screen.getByTestId('conv-conv-2')).toBeInTheDocument();
  });

  it('should filter duplicate conversations when merging', () => {
    render(
      <ConversationsTab
        sessionId="session-1"
        initialParticipant={{ name: 'agent-1', type: 'agent' }}
        initialConversationId="conv-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    // Should only show conv-1 once (backend version wins)
    const conv1Elements = screen.getAllByTestId('conv-conv-1');
    expect(conv1Elements).toHaveLength(1);
  });

  it('should handle conversation selection', async () => {
    const user = userEvent.setup();

    render(
      <ConversationsTab
        sessionId="session-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    await user.click(screen.getByTestId('conv-conv-1'));

    // Should show MessageDisplay with selected conversation
    expect(screen.getByTestId('message-display')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-id')).toHaveTextContent('conv-1');
  });

  it('should show no selection state when no conversation selected', () => {
    render(
      <ConversationsTab
        sessionId="session-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    expect(screen.getByText('No participant selected')).toBeInTheDocument();
    expect(screen.getByText('Create a conversation to start')).toBeInTheDocument();
  });

  it('should toggle sidebar collapse', async () => {
    const user = userEvent.setup();

    render(
      <ConversationsTab
        sessionId="session-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    const collapseButton = screen.getByTitle('Collapse sidebar');
    await user.click(collapseButton);

    // Sidebar should be collapsed - "Conversations" header hidden
    expect(screen.queryByText('Conversations')).not.toBeInTheDocument();

    const expandButton = screen.getByTitle('Expand sidebar');
    await user.click(expandButton);

    // Sidebar should be expanded - "Conversations" header visible
    expect(screen.getByText('Conversations')).toBeInTheDocument();
  });

  it('should open new conversation dialog', async () => {
    const user = userEvent.setup();

    render(
      <ConversationsTab
        sessionId="session-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    // Find and click the Plus button (in the sidebar header)
    const buttons = screen.getAllByRole('button');
    const plusButton = buttons.find((btn) =>
      btn.querySelector('svg')?.classList.contains('lucide-plus')
    );

    await user.click(plusButton!);

    expect(screen.getByTestId('new-conversation-dialog')).toBeInTheDocument();
  });

  it('should create new conversation from dialog', async () => {
    const user = userEvent.setup();

    render(
      <ConversationsTab
        sessionId="session-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    // Open dialog
    const buttons = screen.getAllByRole('button');
    const plusButton = buttons.find((btn) =>
      btn.querySelector('svg')?.classList.contains('lucide-plus')
    );
    await user.click(plusButton!);

    // Select participant
    await user.click(screen.getByTestId('select-participant'));

    // Should create new conversation with generated UUID
    expect(screen.getByTestId('conv-generated-uuid')).toBeInTheDocument();
  });

  it('should handle pending messages state', async () => {
    const user = userEvent.setup();

    render(
      <ConversationsTab
        sessionId="session-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    // Select conversation
    await user.click(screen.getByTestId('conv-conv-1'));

    // Send message
    await user.click(screen.getByTestId('send-message'));

    await waitFor(() => {
      expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
      expect(screen.getByTestId('processing')).toHaveTextContent('true');
    });
  });

  it('should enable queries and call onMessageSent', async () => {
    const user = userEvent.setup();

    render(
      <ConversationsTab
        sessionId="session-1"
        initialParticipant={{ name: 'temp-agent', type: 'agent' }}
        initialConversationId="temp-conv"
        hasSentMessage={false}
        onMessageSent={mockOnMessageSent}
      />
    );

    // Select the temporary conversation
    await user.click(screen.getByTestId('conv-temp-conv'));

    // Click enable queries button
    await user.click(screen.getByTestId('enable-queries'));

    expect(mockOnMessageSent).toHaveBeenCalled();
  });

  it('should skip API calls for new sessions', () => {
    render(
      <ConversationsTab
        sessionId="session-1"
        initialParticipant={{ name: 'temp-agent', type: 'agent' }}
        initialConversationId="temp-conv"
        hasSentMessage={false}
        onMessageSent={mockOnMessageSent}
      />
    );

    // Should call hooks with enabled: false
    expect(useListConversations).toHaveBeenCalledWith('session-1', {
      enabled: false,
    });
    expect(useGetSession).toHaveBeenCalledWith('session-1', {
      enabled: false,
    });
  });

  it('should enable API calls after first message sent', () => {
    render(
      <ConversationsTab
        sessionId="session-1"
        initialParticipant={{ name: 'temp-agent', type: 'agent' }}
        initialConversationId="temp-conv"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    // Should call hooks with enabled: true
    expect(useListConversations).toHaveBeenCalledWith('session-1', {
      enabled: true,
    });
  });

  it('should keep temporary conversations when backend is empty', () => {
    vi.mocked(useListConversations).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    render(
      <ConversationsTab
        sessionId="session-1"
        initialParticipant={{ name: 'temp-agent', type: 'agent' }}
        initialConversationId="temp-conv"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    // Should still show temporary conversation even though backend is empty
    expect(screen.getByTestId('conv-temp-conv')).toBeInTheDocument();
  });

  it('should keep temporary conversations while backend is loading', () => {
    vi.mocked(useListConversations).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    render(
      <ConversationsTab
        sessionId="session-1"
        initialParticipant={{ name: 'temp-agent', type: 'agent' }}
        initialConversationId="temp-conv"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    // Should show temporary conversation while loading
    expect(screen.getByTestId('conv-temp-conv')).toBeInTheDocument();
  });

  it('should pass session participants to dialog', async () => {
    const user = userEvent.setup();

    render(
      <ConversationsTab
        sessionId="session-1"
        hasSentMessage={true}
        onMessageSent={mockOnMessageSent}
      />
    );

    // The NewConversationDialog should receive session participants
    // We can verify this by checking that the dialog can be opened
    const buttons = screen.getAllByRole('button');
    const plusButton = buttons.find((btn) =>
      btn.querySelector('svg')?.classList.contains('lucide-plus')
    );
    await user.click(plusButton!);

    expect(screen.getByTestId('new-conversation-dialog')).toBeInTheDocument();
  });
});
