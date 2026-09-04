import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatInput } from '@/components/sessions-conversations/chat-input';
import type { Conversation } from '@/lib/services/conversations';
import { useSendMessage } from '@/lib/services/conversations-hooks';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services/conversations-hooks');
vi.mock('@/components/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

const mockGetByName = vi.fn();
const mockTeamGetByName = vi.fn();
vi.mock('@/lib/services', () => ({
  agentsService: {
    getByName: (...args: unknown[]) => mockGetByName(...args),
  },
  teamsService: {
    getByName: (...args: unknown[]) => mockTeamGetByName(...args),
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
    const workflowConversation: Conversation = {
      conversationId: 'conv-1',
      name: 'Multi-agent workflow',
      participants: ['agent-1', 'agent-2'], // Multiple participants = workflow
      messageCount: 10,
      toolCallCount: 5,
      duration: '5m',
      startTime: '2024-01-01T00:00:00Z',
      participantType: 'agent',
      errorCount: 0,
    };

    it('should render the tool-calls toggle and a disabled input for workflows', () => {
      render(<ChatInput {...baseProps} conversation={workflowConversation} />);

      // Tool-calls toggle button (replaces the old switch + "Show tool calls" label)
      expect(
        screen.getByRole('button', { name: /tool calls/i }),
      ).toBeInTheDocument();

      // Chat input renders but is disabled for workflow conversations
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
      expect(screen.getByPlaceholderText('Message agent-1')).toBeDisabled();
    });

    it('should reflect the showToolCalls state on the toggle', () => {
      const { rerender } = render(
        <ChatInput
          {...baseProps}
          conversation={workflowConversation}
          showToolCalls={false}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'Show tool calls' }),
      ).toHaveAttribute('aria-pressed', 'false');

      rerender(
        <ChatInput
          {...baseProps}
          conversation={workflowConversation}
          showToolCalls={true}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'Hide tool calls' }),
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('should call onShowToolCallsChange when the toggle is clicked', async () => {
      const user = userEvent.setup();

      render(
        <ChatInput
          {...baseProps}
          conversation={workflowConversation}
          showToolCalls={false}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: 'Show tool calls' }),
      );

      expect(mockOnShowToolCallsChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Workflow conversations without tool calls', () => {
    it('should render UI with disabled input when workflow has no tool calls', () => {
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

      // UI should render even with 0 tool calls
      expect(container.firstChild).not.toBeNull();

      // Tool toggle should still be present (allows toggling even with no tools)
      expect(screen.getByRole('button', { name: /tool calls/i })).toBeInTheDocument();

      // Chat input should be disabled for workflow conversations
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
    });

    it('should render UI with disabled input when toolCallCount is undefined in workflow', () => {
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
        <ChatInput
          {...baseProps}
          conversation={workflowConversation}
        />
      );

      // UI should render even when toolCallCount is undefined
      expect(container.firstChild).not.toBeNull();

      // Input should be disabled for workflow conversations
      expect(screen.getByRole('textbox')).toBeDisabled();

      // Tool toggle should be present
      expect(screen.getByRole('button', { name: /tool calls/i })).toBeInTheDocument();
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
      const sendButton = screen.getByRole('button', { name: 'Send message' });
      expect(sendButton).toBeInTheDocument();

      // Should render the tool-calls toggle
      expect(
        screen.getByRole('button', { name: /tool calls/i }),
      ).toBeInTheDocument();
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

      // Should also render the tool-calls toggle
      expect(
        screen.getByRole('button', { name: /tool calls/i }),
      ).toBeInTheDocument();
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

      const sendButton = screen.getByRole('button', { name: 'Send message' });

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
      screen.getByRole('button', { name: 'Send message' });

    // Selects a variable in a freshly added row and gives it a value. The new
    // list UI starts empty, so the user adds a row (+), picks the variable from
    // the dropdown, then types the value.
    const addVariableValue = async (variableName: string, value: string) => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Add variable' }),
      );
      await userEvent.click(
        screen.getByRole('combobox', { name: 'Choose variable' }),
      );
      await userEvent.click(
        await screen.findByRole('option', { name: variableName }),
      );
      await userEvent.type(
        screen.getByPlaceholderText('Enter value...'),
        value,
      );
    };

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
        await screen.findByText(/needs a value definition/i),
      ).toBeInTheDocument();

      await userEvent.type(
        screen.getByPlaceholderText('Message param-agent'),
        'Hello',
      );

      expect(findSendButton()).toBeDisabled();
      expect(mockSendMessage).not.toHaveBeenCalled();

      await addVariableValue('agent_name', 'researcher');

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

      await addVariableValue('agent_name', 'researcher');
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
        expect(mockGetByName).toHaveBeenCalledWith('default', 'param-agent');
      });

      await userEvent.type(
        screen.getByPlaceholderText('Message param-agent'),
        'Hello',
      );

      expect(findSendButton()).not.toBeDisabled();
    });
  });
});
