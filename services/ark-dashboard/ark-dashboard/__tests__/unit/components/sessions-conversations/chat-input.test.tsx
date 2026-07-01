import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatInput } from '@/components/sessions-conversations/chat-input';
import type { Conversation } from '@/lib/services/conversations';
import { useSendMessage } from '@/lib/services/conversations-hooks';

vi.mock('@/lib/services/conversations-hooks');
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

const mockGetByName = vi.fn();
vi.mock('@/lib/services', () => ({
  agentsService: {
    getByName: (...args: unknown[]) => mockGetByName(...args),
  },
}));

describe('ChatInput', () => {
  const mockOnAddPendingMessage = vi.fn();
  const mockOnSetProcessing = vi.fn();
  const mockOnEnableQueries = vi.fn();
  const mockOnShowToolCallsChange = vi.fn();
  const mockSendMessage = vi.fn();

  const baseProps = {
    conversationId: 'conv-1',
    sessionId: 'session-1',
    onAddPendingMessage: mockOnAddPendingMessage,
    onSetProcessing: mockOnSetProcessing,
    onEnableQueries: mockOnEnableQueries,
    showToolCalls: false,
    onShowToolCallsChange: mockOnShowToolCallsChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByName.mockResolvedValue({ parameters: [] });
    vi.mocked(useSendMessage).mockReturnValue({
      mutate: mockSendMessage,
      isPending: false,
    } as any);
  });

  describe('Workflow conversations with tool calls', () => {
    it('should render tool toggle UI when workflow has tool calls', () => {
      const workflowConversation: Conversation = {
        conversationId: 'conv-1',
        name: 'Multi-agent workflow',
        participants: ['agent-1', 'agent-2'], // Multiple participants = workflow
        messageCount: 10,
        toolCallCount: 5, // Has tool calls
        duration: '5m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      render(<ChatInput {...baseProps} conversation={workflowConversation} />);

      // Should render tool toggle switch
      expect(screen.getByRole('switch')).toBeInTheDocument();

      // Should show tool call count badge
      expect(screen.getByText('5')).toBeInTheDocument();

      // Should show "Show tool calls" label
      expect(screen.getByText('Show tool calls')).toBeInTheDocument();

      // Should NOT render regular chat input
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByText(/Message/)).not.toBeInTheDocument();
    });

    it('should render tool toggle with correct count for different toolCallCount values', () => {
      const workflowConversation: Conversation = {
        conversationId: 'conv-1',
        name: 'Workflow',
        participants: ['agent-1', 'agent-2'],
        messageCount: 10,
        toolCallCount: 42,
        duration: '5m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      render(<ChatInput {...baseProps} conversation={workflowConversation} />);

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should pass showToolCalls prop to Switch component', () => {
      const workflowConversation: Conversation = {
        conversationId: 'conv-1',
        name: 'Workflow',
        participants: ['agent-1', 'agent-2'],
        messageCount: 10,
        toolCallCount: 3,
        duration: '5m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      const { rerender } = render(
        <ChatInput
          {...baseProps}
          conversation={workflowConversation}
          showToolCalls={false}
        />,
      );

      const switchElement = screen.getByRole('switch');
      expect(switchElement).not.toBeChecked();

      rerender(
        <ChatInput
          {...baseProps}
          conversation={workflowConversation}
          showToolCalls={true}
        />,
      );

      expect(switchElement).toBeChecked();
    });

    it('should call onShowToolCallsChange when switch is toggled', async () => {
      const user = userEvent.setup();
      const workflowConversation: Conversation = {
        conversationId: 'conv-1',
        name: 'Workflow',
        participants: ['agent-1', 'agent-2'],
        messageCount: 10,
        toolCallCount: 5,
        duration: '5m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      render(
        <ChatInput
          {...baseProps}
          conversation={workflowConversation}
          showToolCalls={false}
        />,
      );

      const switchElement = screen.getByRole('switch');
      await user.click(switchElement);

      expect(mockOnShowToolCallsChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Workflow conversations without tool calls', () => {
    it('should render nothing when workflow has no tool calls', () => {
      const workflowConversation: Conversation = {
        conversationId: 'conv-1',
        name: 'Workflow',
        participants: ['agent-1', 'agent-2'], // Multiple participants = workflow
        messageCount: 10,
        toolCallCount: 0, // No tool calls
        duration: '5m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      const { container } = render(
        <ChatInput {...baseProps} conversation={workflowConversation} />,
      );

      // Component should return null - no UI rendered
      expect(container.firstChild).toBeNull();

      // Should NOT render tool toggle
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();

      // Should NOT render regular chat input
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('should render nothing when toolCallCount is undefined in workflow', () => {
      const workflowConversation: Conversation = {
        conversationId: 'conv-1',
        name: 'Workflow',
        participants: ['agent-1', 'agent-2'],
        messageCount: 10,
        toolCallCount: undefined as any, // Undefined tool calls (defaults to 0)
        duration: '5m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      const { container } = render(
        <ChatInput {...baseProps} conversation={workflowConversation} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Regular (non-workflow) conversations', () => {
    it('should render regular chat input for single-participant conversation', () => {
      const regularConversation: Conversation = {
        conversationId: 'conv-1',
        name: 'agent-1',
        participants: ['agent-1'], // Single participant = not a workflow
        messageCount: 10,
        toolCallCount: 0,
        duration: '5m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      render(<ChatInput {...baseProps} conversation={regularConversation} />);

      // Should render regular chat input
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('Message agent-1'),
      ).toBeInTheDocument();

      // Should render send button
      const buttons = screen.getAllByRole('button');
      const sendButton = buttons.find(btn =>
        btn.querySelector('svg')?.classList.contains('lucide-send'),
      );
      expect(sendButton).toBeInTheDocument();

      // Should NOT render tool toggle
      expect(screen.queryByText('Show tool calls')).not.toBeInTheDocument();
    });

    it('should render regular chat input even if conversation has tool calls (non-workflow)', () => {
      const regularConversation: Conversation = {
        conversationId: 'conv-1',
        name: 'agent-1',
        participants: ['agent-1'], // Single participant
        messageCount: 10,
        toolCallCount: 10, // Has tool calls but not a workflow
        duration: '5m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      render(<ChatInput {...baseProps} conversation={regularConversation} />);

      // Should render regular chat input
      expect(screen.getByRole('textbox')).toBeInTheDocument();

      // Should also render tool toggle at bottom (existing feature for regular conversations)
      expect(screen.getByText('Show tool calls')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should handle null conversation gracefully', () => {
      render(<ChatInput {...baseProps} conversation={null} />);

      // Should render chat input with fallback participant name
      expect(
        screen.getByPlaceholderText('Message participant'),
      ).toBeInTheDocument();
    });

    it('should send message when send button is clicked', async () => {
      const user = userEvent.setup();
      const regularConversation: Conversation = {
        conversationId: 'conv-1',
        name: 'agent-1',
        participants: ['agent-1'],
        messageCount: 10,
        toolCallCount: 0,
        duration: '5m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      render(<ChatInput {...baseProps} conversation={regularConversation} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello agent');

      const buttons = screen.getAllByRole('button');
      const sendButton = buttons.find(btn =>
        btn.querySelector('svg')?.classList.contains('lucide-send'),
      );

      await user.click(sendButton!);

      expect(mockOnAddPendingMessage).toHaveBeenCalledWith(
        'conv-1',
        'Hello agent',
      );
      expect(mockOnSetProcessing).toHaveBeenCalledWith('conv-1', true);
    });
  });

  describe('Edge cases', () => {
    it('should handle conversation with empty participants array', () => {
      const conversation: Conversation = {
        conversationId: 'conv-1',
        name: 'Empty',
        participants: [], // Empty array
        messageCount: 0,
        toolCallCount: 0,
        duration: '0m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      render(<ChatInput {...baseProps} conversation={conversation} />);

      // Should render regular chat input (0 participants treated as non-workflow)
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should treat exactly 1 participant as non-workflow even if participants array exists', () => {
      const conversation: Conversation = {
        conversationId: 'conv-1',
        name: 'Single',
        participants: ['agent-1'], // Exactly 1
        messageCount: 0,
        toolCallCount: 5,
        duration: '0m',
        startTime: '2024-01-01T00:00:00Z',
        participantType: 'agent',
        errorCount: 0,
      };

      render(<ChatInput {...baseProps} conversation={conversation} />);

      // Should render regular chat input
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  describe('agent requiring query parameters', () => {
    const agentConversation: Conversation = {
      conversationId: 'conv-1',
      name: 'param-agent',
      participants: ['param-agent'],
      messageCount: 0,
      toolCallCount: 0,
      duration: '0m',
      startTime: '2024-01-01T00:00:00Z',
      participantType: 'agent',
      errorCount: 0,
    };

    const findSendButton = () =>
      screen
        .getAllByRole('button')
        .find(btn =>
          btn.querySelector('svg')?.classList.contains('lucide-send'),
        );

    it('shows the parameter editor and keeps send disabled until required params are filled', async () => {
      mockGetByName.mockResolvedValue({
        parameters: [
          {
            name: 'agent_name',
            valueFrom: { queryParameterRef: { name: 'agent_name' } },
          },
        ],
      });

      render(<ChatInput {...baseProps} conversation={agentConversation} />);

      expect(
        await screen.findByText(/needs the agent_name parameter/i),
      ).toBeInTheDocument();

      await userEvent.type(
        screen.getByPlaceholderText('Message param-agent'),
        'Hello',
      );

      expect(findSendButton()).toBeDisabled();
      expect(mockSendMessage).not.toHaveBeenCalled();

      await userEvent.type(
        await screen.findByPlaceholderText('Enter value...'),
        'researcher',
      );

      expect(findSendButton()).not.toBeDisabled();
    });

    it('passes supplied parameters when sending', async () => {
      mockGetByName.mockResolvedValue({
        parameters: [
          {
            name: 'agent_name',
            valueFrom: { queryParameterRef: { name: 'agent_name' } },
          },
        ],
      });

      render(<ChatInput {...baseProps} conversation={agentConversation} />);

      await userEvent.type(
        await screen.findByPlaceholderText('Enter value...'),
        'researcher',
      );
      await userEvent.type(
        screen.getByPlaceholderText('Message param-agent'),
        'Hello',
      );

      await userEvent.click(findSendButton()!);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Hello',
          parameters: [{ name: 'agent_name', value: 'researcher' }],
        }),
        expect.anything(),
      );
    });

    it('allows sending when the agent has no required parameters', async () => {
      mockGetByName.mockResolvedValue({ parameters: [] });

      render(<ChatInput {...baseProps} conversation={agentConversation} />);

      await waitFor(() => {
        expect(mockGetByName).toHaveBeenCalledWith('param-agent');
      });

      await userEvent.type(
        screen.getByPlaceholderText('Message param-agent'),
        'Hello',
      );

      expect(findSendButton()).not.toBeDisabled();
    });
  });
});
