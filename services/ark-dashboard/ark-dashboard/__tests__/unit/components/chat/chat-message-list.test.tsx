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

      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
    });
  });

  describe('strategy indicator', () => {
    it('should show strategy indicator when strategy is set and messages exist', () => {
      const messages: ExtendedChatMessage[] = [
        { role: 'user', content: 'Hello' } as ExtendedChatMessage,
      ];

      renderChatMessageList({ messages, strategy: 'round-robin' });

      expect(
        screen.getByText('Agents respond in round-robin order'),
      ).toBeInTheDocument();
    });

    it('should not show strategy indicator when no messages', () => {
      renderChatMessageList({ strategy: 'round-robin' });

      expect(
        screen.queryByText('Agents respond in round-robin order'),
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
});
