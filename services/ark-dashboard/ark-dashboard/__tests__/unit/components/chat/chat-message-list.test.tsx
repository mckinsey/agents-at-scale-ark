import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChatMessageList } from '@/components/chat/chat-message-list';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

function renderChatMessageList(
  props: Partial<React.ComponentProps<typeof ChatMessageList>> = {},
) {
  const defaults: React.ComponentProps<typeof ChatMessageList> = {
    messages: [],
    type: 'agent',
    debugMode: true,
    isProcessing: false,
    error: null,
    messagesEndRef: createRef<HTMLDivElement>(),
    ...props,
  };
  return render(<ChatMessageList {...defaults} />);
}

describe('ChatMessageList', () => {
  describe('empty state', () => {
    it('should show empty state when no messages and no error', () => {
      renderChatMessageList({ type: 'agent' });

      expect(
        screen.getByText('Start a conversation with the agent'),
      ).toBeInTheDocument();
    });

    it('should show type-specific empty state', () => {
      renderChatMessageList({ type: 'team' });

      expect(
        screen.getByText('Start a conversation with the team'),
      ).toBeInTheDocument();
    });

    it('should not show empty state when there is an error', () => {
      renderChatMessageList({ error: 'Connection failed' });

      expect(
        screen.queryByText(/Start a conversation/),
      ).not.toBeInTheDocument();
    });
  });

  describe('error display', () => {
    it('should show error banner when error is set', () => {
      renderChatMessageList({ error: 'Something went wrong' });

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should not show error banner when error is null', () => {
      const { container } = renderChatMessageList({ error: null });

      expect(
        container.querySelector('.text-destructive'),
      ).not.toBeInTheDocument();
    });
  });

  describe('message rendering', () => {
    it('should render user messages', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello there' } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages });

      expect(screen.getByText('Hello there')).toBeInTheDocument();
    });

    it('should render assistant messages', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'assistant', content: 'Hi back' } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages });

      expect(screen.getByText('Hi back')).toBeInTheDocument();
    });

    it('should skip tool role messages', () => {
      const messages: ExtendedChatMessage[] = [
        {
          role: 'tool',
          content: 'tool result',
          tool_call_id: 'tc-1',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages });

      expect(screen.queryByText('tool result')).not.toBeInTheDocument();
    });

    it('should render multiple messages in order', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'First' } as ExtendedChatMessage,
        { role: 'assistant', content: 'Second' } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages });

      const first = screen.getByText('First');
      const second = screen.getByText('Second');
      expect(first.compareDocumentPosition(second)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });

  describe('strategy indicator', () => {
    it('should show strategy indicator when strategy is set and messages exist', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages, strategy: 'sequential' });

      expect(
        screen.getByText('Agents respond in sequential order'),
      ).toBeInTheDocument();
    });

    it('should not show strategy indicator when no messages', () => {
      renderChatMessageList({ strategy: 'sequential' });

      expect(
        screen.queryByText('Agents respond in sequential order'),
      ).not.toBeInTheDocument();
    });
  });

  describe('typing indicator', () => {
    it('should show typing indicator when processing', () => {
      const { container } = renderChatMessageList({ isProcessing: true });

      expect(container.querySelector('.animate-bounce')).toBeInTheDocument();
    });

    it('should not show typing indicator when not processing', () => {
      const { container } = renderChatMessageList({ isProcessing: false });

      expect(
        container.querySelector('.animate-bounce'),
      ).not.toBeInTheDocument();
    });
  });

  describe('termination events', () => {
    it('should render termination event with agent name', () => {
      const messages: ExtendedChatMessage[] = [
        {
          role: 'assistant',
          content: '',
          name: 'closer-agent',
          tool_calls: [
            {
              id: 'tc-1',
              type: 'function' as const,
              function: {
                name: 'terminate',
                arguments: JSON.stringify({ response: 'Goodbye!' }),
              },
            },
          ],
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages });

      expect(
        screen.getByText(
          /closer-agent has terminated the conversation with the following message/,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Goodbye!')).toBeInTheDocument();
    });

    it('should show Unknown Agent when no sender name', () => {
      const messages: ExtendedChatMessage[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tc-1',
              type: 'function' as const,
              function: {
                name: 'terminate',
                arguments: JSON.stringify({ response: 'Done' }),
              },
            },
          ],
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages });

      expect(
        screen.getByText(
          /Unknown Agent has terminated the conversation with the following message/,
        ),
      ).toBeInTheDocument();
    });
  });

  describe('max turns message', () => {
    it('should render max turns message as italic text', () => {
      const messages: ExtendedChatMessage[] = [
        {
          role: 'system',
          content: 'Reached maximum turns limit',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages });

      expect(
        screen.getByText('Reached maximum turns limit'),
      ).toBeInTheDocument();
    });
  });

  describe('debug mode', () => {
    it('should not show tool calls when debugMode is false', () => {
      const messages: ExtendedChatMessage[] = [
        {
          role: 'assistant',
          content: 'Result',
          tool_calls: [
            {
              id: 'tc-1',
              type: 'function' as const,
              function: {
                name: 'search',
                arguments: '{"query":"test"}',
              },
            },
          ],
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages, debugMode: false });

      expect(screen.getByText('Result')).toBeInTheDocument();
      expect(screen.queryByText('search')).not.toBeInTheDocument();
    });
  });

  describe('scroll anchor', () => {
    it('should render scroll anchor div', () => {
      const ref = createRef<HTMLDivElement>();
      renderChatMessageList({ messagesEndRef: ref });

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('selector transitions', () => {
    it('should render transition between different agents with selector strategy', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from A',
          name: 'agent-a',
        } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from B',
          name: 'agent-b',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages, strategy: 'selector' });

      expect(screen.getByText('Selector chose agent-a')).toBeInTheDocument();
      expect(screen.getByText('Selector chose agent-b')).toBeInTheDocument();
    });

    it('should render transition for every assistant message even when same agent', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'First response',
          name: 'agent-a',
        } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Second response',
          name: 'agent-a',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages, strategy: 'selector' });

      const transitions = screen.getAllByText('Selector chose agent-a');
      expect(transitions).toHaveLength(2);
    });

    it('should render selector strategy indicator', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages, strategy: 'selector' });

      expect(
        screen.getByText('AI selector chooses each respondent'),
      ).toBeInTheDocument();
    });

    it('should use selector agent name in transitions and indicator', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from A',
          name: 'agent-a',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({
        messages,
        strategy: 'selector',
        selectorAgentName: 'my-selector',
      });

      expect(
        screen.getByText('my-selector chooses each respondent'),
      ).toBeInTheDocument();
      expect(screen.getByText('my-selector chose agent-a')).toBeInTheDocument();
    });

    it('should render max turns as badge for selector strategy', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response',
          name: 'agent-a',
        } as ExtendedChatMessage,
        {
          role: 'system',
          content: 'Team conversation reached maximum turns limit (3)',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages, strategy: 'selector' });

      expect(screen.getByText('Maximum turns reached (3)')).toBeInTheDocument();
    });

    it('should render selector failure event when invalid agent selected', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'system',
          content: 'Selector returned invalid agent name: invalid-agent',
        } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from fallback',
          name: 'agent-a',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages, strategy: 'selector' });

      expect(
        screen.getByText('Selector returned invalid agent: invalid-agent. Ending conversation'),
      ).toBeInTheDocument();
    });

    it('should not render selector transition for terminate tool call message', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from A',
          name: 'agent-a',
        } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: '',
          name: 'selector-agent',
          tool_calls: [
            {
              id: 'tc-1',
              type: 'function' as const,
              function: {
                name: 'terminate',
                arguments: JSON.stringify({ response: 'Goodbye!' }),
              },
            },
          ],
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages, strategy: 'selector' });

      expect(screen.getByText('Selector chose agent-a')).toBeInTheDocument();
      expect(screen.queryByText('Selector chose selector-agent')).not.toBeInTheDocument();
    });

    it('should not render selector transitions for non-selector strategy', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from A',
          name: 'agent-a',
        } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from B',
          name: 'agent-b',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages, strategy: 'sequential' });

      expect(screen.queryByText(/Selector chose/)).not.toBeInTheDocument();
    });
  });

  describe('graph transitions', () => {
    const graphEdges = [
      { from: 'agent-a', to: 'agent-b' },
      { from: 'agent-b', to: 'agent-c' },
    ];

    it('should render transition between agent messages with graph strategy', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from A',
          name: 'agent-a',
        } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from B',
          name: 'agent-b',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({
        messages,
        strategy: 'graph',
        graphEdges,
      });

      expect(screen.getAllByText(/agent-a/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/agent-b/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Response from A')).toBeInTheDocument();
      expect(screen.getByText('Response from B')).toBeInTheDocument();
    });

    it('should render end of graph when last agent has no outgoing edges', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from C',
          name: 'agent-c',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({
        messages,
        strategy: 'graph',
        graphEdges,
        isProcessing: false,
      });

      expect(screen.getByText('Conversation ended because agent graph has no outgoing edges')).toBeInTheDocument();
    });

    it('should not render end of graph while processing', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from C',
          name: 'agent-c',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({
        messages,
        strategy: 'graph',
        graphEdges,
        isProcessing: true,
      });

      expect(screen.queryByText('Conversation ended')).not.toBeInTheDocument();
    });

    it('should not render transitions for non-graph strategy', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from A',
          name: 'agent-a',
        } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: 'Response from B',
          name: 'agent-b',
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({
        messages,
        strategy: 'sequential',
        graphEdges,
      });

      expect(screen.queryByText('Conversation ended')).not.toBeInTheDocument();
    });

    it('should not render graph end when termination event exists', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
        {
          role: 'assistant',
          content: '',
          name: 'agent-c',
          tool_calls: [
            {
              id: 'tc-1',
              type: 'function' as const,
              function: {
                name: 'terminate',
                arguments: JSON.stringify({ response: 'Done' }),
              },
            },
          ],
        } as ExtendedChatMessage,
      ];

      renderChatMessageList({
        messages,
        strategy: 'graph',
        graphEdges,
        isProcessing: false,
      });

      expect(screen.queryByText('Conversation ended')).not.toBeInTheDocument();
    });

  });
});
