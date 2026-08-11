import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageDisplay } from '@/components/sessions-conversations/message-display';
import { useGetMessages } from '@/lib/services/conversations-hooks';
import { useGetQuery } from '@/lib/services/queries-hooks';
import { useA2ATask } from '@/lib/services/a2a-tasks-hooks';
import { useSubmitApproval } from '@/lib/services/a2a-task-approvals-hooks';
import type { Conversation } from '@/lib/services/conversations';

vi.mock('@/lib/services/conversations-hooks');
vi.mock('@/lib/services/queries-hooks', () => ({
  useGetQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useListQueries: vi.fn(() => ({ data: undefined, isLoading: false })),
}));
vi.mock('@/lib/services/a2a-tasks-hooks', () => ({
  useA2ATask: vi.fn(() => ({ data: undefined, isLoading: false })),
}));
vi.mock('@/lib/services/a2a-task-approvals-hooks', () => ({
  useSubmitApproval: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    get: vi.fn((key: string) => key === 'namespace' ? 'default' : null),
  })),
}));
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

  function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

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
      />,
      { wrapper: createWrapper() }
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
      />,
      { wrapper: createWrapper() }
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
      />,
      { wrapper: createWrapper() }
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
      />,
      { wrapper: createWrapper() }
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
      />,
      { wrapper: createWrapper() }
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
      />,
      { wrapper: createWrapper() }
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
      />,
      { wrapper: createWrapper() }
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
      />,
      { wrapper: createWrapper() }
    );

    // Should only show 2 messages: 1 from backend (Hello) and 1 from backend (Hi there!)
    // The pending "Hello" should be filtered out as duplicate
    const userMessages = screen.getAllByTestId('message-user');
    expect(userMessages).toHaveLength(1);
  });

  describe('tool approval', () => {
    const approvalA2ATask = {
      name: 'a2a-task-task-123',
      namespace: 'default',
      taskId: 'task-123',
      agentRef: { name: 'deploy-agent' },
      queryRef: { name: 'q1' },
      status: {
        phase: 'input-required',
        protocolMetadata: {
          toolCalls: JSON.stringify([
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'write-file', arguments: '{"path":"/tmp/x"}' },
            },
          ]),
          timeout: '5m',
          onTimeout: 'reject',
          context: JSON.stringify({ AgentName: 'deploy-agent' }),
        },
      },
    };

    const mutateAsync = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      sessionStorage.clear();
      vi.mocked(useGetQuery).mockReturnValue({
        data: {
          status: {
            phase: 'input-required',
            response: { a2a: { taskId: 'task-123' } },
          },
        },
        isLoading: false,
      } as any);
      vi.mocked(useA2ATask).mockReturnValue({
        data: approvalA2ATask,
        isLoading: false,
      } as any);
      vi.mocked(useSubmitApproval).mockReturnValue({
        mutate: vi.fn(),
        mutateAsync,
        isPending: false,
      } as any);
    });

    function renderApproval() {
      return render(
        <MessageDisplay
          conversationId="conv-1"
          sessionId="session-1"
          conversation={mockConversation}
          pendingMessages={[]}
          onClearPending={mockOnClearPending}
          isProcessing={true}
          showToolCalls={true}
        />,
        { wrapper: createWrapper() },
      );
    }

    it('renders the approval notification when a query awaits approval', () => {
      renderApproval();

      expect(
        screen.getByRole('button', { name: /approve/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /reject/i }),
      ).toBeInTheDocument();
    });

    it('submits an approval when approve is clicked', async () => {
      renderApproval();

      fireEvent.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith('approved'),
      );
    });

    it('submits a rejection when reject is clicked', async () => {
      renderApproval();

      fireEvent.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith('rejected'),
      );
    });
  });
});
