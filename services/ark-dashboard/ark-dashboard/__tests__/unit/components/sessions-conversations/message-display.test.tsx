import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageDisplay } from '@/components/sessions-conversations/message-display';
import { useGetMessages } from '@/lib/services/conversations-hooks';
import type { Conversation } from '@/lib/services/conversations';

vi.mock('@/lib/services/conversations-hooks');
vi.mock('@/components/sessions-conversations/session-message', () => ({
  SessionMessage: ({ role, content }: any) => (
    <div data-testid={`message-${role}`}>{content}</div>
  ),
}));

describe('MessageDisplay', () => {
  const mockConversation: Conversation = {
    conversationId: 'conv-1',
    name: 'test-agent',
    participants: ['test-agent'],
    messageCount: 2,
    toolCallCount: 0,
    duration: '1m',
    startTime: '2024-01-01T00:00:00Z',
    participantType: 'agent',
    errorCount: 0,
  };

  const mockMessages = [
    {
      query_id: 'q1',
      sequence: 1,
      message: { role: 'user', content: 'Hello' },
      timestamp: '2024-01-01T00:00:00Z',
    },
    {
      query_id: 'q1',
      sequence: 2,
      message: { role: 'assistant', content: 'Hi there!' },
      timestamp: '2024-01-01T00:00:10Z',
    },
  ];

  const mockOnClearPending = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetMessages).mockReturnValue({
      data: mockMessages,
      isLoading: false,
    } as any);
  });

  it('should show loading skeleton when loading', () => {
    vi.mocked(useGetMessages).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { container } = render(
      <MessageDisplay
        conversationId="conv-1"
        sessionId="session-1"
        conversation={mockConversation}
        pendingMessages={[]}
        onClearPending={mockOnClearPending}
        isProcessing={false}
        showToolCalls={true}
      />
    );

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it('should display conversation participant info', () => {
    render(
      <MessageDisplay
        conversationId="conv-1"
        sessionId="session-1"
        conversation={mockConversation}
        pendingMessages={[]}
        onClearPending={mockOnClearPending}
        isProcessing={false}
        showToolCalls={true}
      />
    );

    expect(screen.getByText('test-agent')).toBeInTheDocument();
    expect(screen.getByText('agent')).toBeInTheDocument();
  });

  it('should render messages from backend', () => {
    render(
      <MessageDisplay
        conversationId="conv-1"
        sessionId="session-1"
        conversation={mockConversation}
        pendingMessages={[]}
        onClearPending={mockOnClearPending}
        isProcessing={false}
        showToolCalls={true}
      />
    );

    expect(screen.getByTestId('message-user')).toHaveTextContent('Hello');
    expect(screen.getByTestId('message-assistant')).toHaveTextContent('Hi there!');
  });

  it('should display pending messages', () => {
    const pendingMessages = [
      { role: 'user' as const, content: 'Pending message', timestamp: '2024-01-01T00:00:20Z' },
    ];

    render(
      <MessageDisplay
        conversationId="conv-1"
        sessionId="session-1"
        conversation={mockConversation}
        pendingMessages={pendingMessages}
        onClearPending={mockOnClearPending}
        isProcessing={false}
        showToolCalls={true}
      />
    );

    expect(screen.getAllByTestId('message-user')).toHaveLength(2); // 1 backend + 1 pending
  });

  it('should show processing indicator when processing', () => {
    render(
      <MessageDisplay
        conversationId="conv-1"
        sessionId="session-1"
        conversation={mockConversation}
        pendingMessages={[]}
        onClearPending={mockOnClearPending}
        isProcessing={true}
        showToolCalls={true}
      />
    );

    // Processing indicator has animated dots
    const dots = screen.getAllByRole('generic').filter(el =>
      el.className.includes('animate-bounce')
    );
    expect(dots.length).toBe(3);
  });

  it('should show empty state for temporary conversation', () => {
    vi.mocked(useGetMessages).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    render(
      <MessageDisplay
        conversationId="conv-1"
        sessionId="session-1"
        conversation={{ ...mockConversation, isTemporary: true }}
        pendingMessages={[]}
        onClearPending={mockOnClearPending}
        isProcessing={false}
        showToolCalls={true}
      />
    );

    expect(screen.getByText(/Conversation started with/i)).toBeInTheDocument();
    expect(screen.getByText(/Send a message below/i)).toBeInTheDocument();
  });

  it('should show workflow message for conversations without messages', () => {
    vi.mocked(useGetMessages).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    render(
      <MessageDisplay
        conversationId="conv-1"
        sessionId="session-1"
        conversation={mockConversation}
        pendingMessages={[]}
        onClearPending={mockOnClearPending}
        isProcessing={false}
        showToolCalls={true}
      />
    );

    expect(screen.getByText(/No conversation messages available/i)).toBeInTheDocument();
    expect(screen.getByText(/Workflow sessions/i)).toBeInTheDocument();
  });

  it('should filter duplicate pending messages', () => {
    const pendingMessages = [
      { role: 'user' as const, content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
    ];

    render(
      <MessageDisplay
        conversationId="conv-1"
        sessionId="session-1"
        conversation={mockConversation}
        pendingMessages={pendingMessages}
        onClearPending={mockOnClearPending}
        isProcessing={false}
        showToolCalls={true}
      />
    );

    // Should only show 2 messages: 1 from backend (Hello) and 1 from backend (Hi there!)
    // The pending "Hello" should be filtered out as duplicate
    const userMessages = screen.getAllByTestId('message-user');
    expect(userMessages).toHaveLength(1);
  });
});
