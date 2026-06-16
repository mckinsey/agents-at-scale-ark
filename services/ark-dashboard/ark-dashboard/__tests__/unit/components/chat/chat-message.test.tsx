import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatMessage } from '@/components/chat/chat-message';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

describe('ChatMessage', () => {
  describe('basic rendering', () => {
    it('should render user message', () => {
      render(<ChatMessage role="user" content="Hello world" />);

      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('should render assistant message', () => {
      render(<ChatMessage role="assistant" content="Hi there!" />);

      expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });

    it('should render system message', () => {
      render(<ChatMessage role="system" content="System message" />);

      expect(screen.getByText('System message')).toBeInTheDocument();
    });
  });

  describe('sender name display', () => {
    it('should display sender name for assistant messages', () => {
      render(
        <ChatMessage
          role="assistant"
          content="Response"
          sender="agent-alpha"
        />,
      );

      expect(screen.getByText('agent-alpha')).toBeInTheDocument();
    });

    it('should not display sender name for user messages', () => {
      render(<ChatMessage role="user" content="Question" sender="user-123" />);

      expect(screen.queryByText('user-123')).not.toBeInTheDocument();
    });

    it('should display different sender names', () => {
      const { rerender } = render(
        <ChatMessage role="assistant" content="Test" sender="agent-1" />,
      );

      expect(screen.getByText('agent-1')).toBeInTheDocument();

      rerender(
        <ChatMessage role="assistant" content="Test" sender="agent-2" />,
      );

      expect(screen.getByText('agent-2')).toBeInTheDocument();
    });
  });

  describe('status display', () => {
    it('should render message with pending status', () => {
      render(
        <ChatMessage
          role="assistant"
          content="Processing..."
          status="pending"
        />,
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('should render message with failed status', () => {
      render(
        <ChatMessage
          role="assistant"
          content="Error occurred"
          status="failed"
        />,
      );

      expect(screen.getByText('Error occurred')).toBeInTheDocument();
    });

    it('should show error icon for failed messages with queryName', () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Failed"
          status="failed"
          queryName="query-123"
        />,
      );

      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('view modes', () => {
    it('should render in text mode by default', () => {
      render(<ChatMessage role="assistant" content="Plain text" />);

      expect(screen.getByText('Plain text')).toBeInTheDocument();
    });

    it('should support markdown view mode', () => {
      render(
        <ChatMessage
          role="assistant"
          content="**Bold text**"
          viewMode="markdown"
        />,
      );

      expect(screen.getByText(/Bold text/)).toBeInTheDocument();
    });
  });

  describe('tool calls', () => {
    it('should render tool calls', () => {
      const toolCalls = [
        {
          id: 'call-1',
          type: 'function' as const,
          function: {
            name: 'search',
            arguments: '{"query":"test"}',
          },
        },
      ];

      render(<ChatMessage role="assistant" content="" toolCalls={toolCalls} />);

      expect(screen.getByText('search')).toBeInTheDocument();
    });

    it('should render multiple tool calls', () => {
      const toolCalls = [
        {
          id: 'call-1',
          type: 'function' as const,
          function: {
            name: 'search',
            arguments: '{"query":"test"}',
          },
        },
        {
          id: 'call-2',
          type: 'function' as const,
          function: {
            name: 'calculate',
            arguments: '{"expression":"2+2"}',
          },
        },
      ];

      render(<ChatMessage role="assistant" content="" toolCalls={toolCalls} />);

      expect(screen.getByText('search')).toBeInTheDocument();
      expect(screen.getByText('calculate')).toBeInTheDocument();
    });
  });

  describe('custom styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          className="custom-message-class"
        />,
      );

      const messageElement = container.querySelector('.custom-message-class');
      expect(messageElement).toBeInTheDocument();
    });
  });

  describe('empty content', () => {
    it('should handle empty content gracefully', () => {
      const { container } = render(<ChatMessage role="assistant" content="" />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should render tool calls even with empty content', () => {
      const toolCalls = [
        {
          id: 'call-1',
          type: 'function' as const,
          function: {
            name: 'action',
            arguments: '{}',
          },
        },
      ];

      render(<ChatMessage role="assistant" content="" toolCalls={toolCalls} />);

      expect(screen.getByText('action')).toBeInTheDocument();
    });
  });
});
