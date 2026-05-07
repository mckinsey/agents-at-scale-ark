import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SessionMessage } from '@/components/sessions-conversations/session-message';
import type { ToolCallData } from '@/components/chat/tool-call';

describe('SessionMessage', () => {
  const mockToolCall: ToolCallData = {
    id: 'call-1',
    type: 'function',
    function: {
      name: 'search',
      arguments: '{"query":"test query"}',
    },
  };

  describe('user messages', () => {
    it('should render user message with content', () => {
      render(<SessionMessage role="user" content="Hello, world!" />);

      expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    });

    it('should apply correct styling for user messages', () => {
      const { container } = render(
        <SessionMessage role="user" content="Hello" />
      );

      const messageContainer = container.querySelector('.items-end');
      expect(messageContainer).toBeInTheDocument();

      const messageBox = container.querySelector('.bg-secondary');
      expect(messageBox).toBeInTheDocument();
    });

    it('should not show sender for user messages', () => {
      render(
        <SessionMessage role="user" content="Hello" sender="User" />
      );

      expect(screen.queryByText('User')).not.toBeInTheDocument();
    });

    it('should not show timestamp for user messages', () => {
      render(
        <SessionMessage
          role="user"
          content="Hello"
          timestamp="2024-01-01T00:00:00Z"
        />
      );

      const container = screen.getByText('Hello').closest('div');
      expect(container?.textContent).not.toContain('00:00:00');
    });
  });

  describe('assistant messages with sender', () => {
    it('should render assistant message with content', () => {
      render(
        <SessionMessage
          role="assistant"
          content="Hi there!"
          sender="test-agent"
        />
      );

      expect(screen.getByText('Hi there!')).toBeInTheDocument();
      expect(screen.getByText('test-agent')).toBeInTheDocument();
    });

    it('should show Bot icon for assistant messages', () => {
      const { container } = render(
        <SessionMessage
          role="assistant"
          content="Hello"
          sender="test-agent"
        />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should show timestamp when provided', () => {
      const timestamp = '2024-01-01T12:30:45Z';
      const date = new Date(timestamp);
      const expectedTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      render(
        <SessionMessage
          role="assistant"
          content="Hello"
          sender="test-agent"
          timestamp={timestamp}
        />
      );

      expect(screen.getByText(expectedTime)).toBeInTheDocument();
    });

    it('should not show timestamp when not provided', () => {
      const { container } = render(
        <SessionMessage
          role="assistant"
          content="Hello"
          sender="test-agent"
        />
      );

      const senderLine = container.querySelector('.text-xs.font-medium');
      expect(senderLine?.textContent).toBe('test-agent');
    });

    it('should show tool calls when showToolCalls is true', () => {
      render(
        <SessionMessage
          role="assistant"
          content="Hello"
          sender="test-agent"
          toolCalls={[mockToolCall]}
          showToolCalls={true}
        />
      );

      expect(screen.getByText('search')).toBeInTheDocument();
    });

    it('should hide tool calls when showToolCalls is false', () => {
      render(
        <SessionMessage
          role="assistant"
          content="Hello"
          sender="test-agent"
          toolCalls={[mockToolCall]}
          showToolCalls={false}
        />
      );

      expect(screen.queryByText('search')).not.toBeInTheDocument();
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    it('should render multiple tool calls', () => {
      const toolCalls: ToolCallData[] = [
        mockToolCall,
        {
          id: 'call-2',
          type: 'function',
          function: {
            name: 'calculate',
            arguments: '{"expression":"1+1"}',
          },
        },
      ];

      render(
        <SessionMessage
          role="assistant"
          content="Results"
          sender="test-agent"
          toolCalls={toolCalls}
          showToolCalls={true}
        />
      );

      expect(screen.getByText('search')).toBeInTheDocument();
      expect(screen.getByText('calculate')).toBeInTheDocument();
    });
  });

  describe('assistant messages without sender (system)', () => {
    it('should render as system message when no sender provided', () => {
      render(<SessionMessage role="assistant" content="System message" />);

      expect(screen.getByText('System')).toBeInTheDocument();
      expect(screen.getByText('System message')).toBeInTheDocument();
    });

    it('should show AlertCircle icon for system messages', () => {
      const { container } = render(
        <SessionMessage role="assistant" content="System message" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render system message in pre tag', () => {
      render(<SessionMessage role="assistant" content="Error: Something went wrong" />);

      const pre = screen.getByText('Error: Something went wrong').closest('pre');
      expect(pre).toBeInTheDocument();
    });

    it('should show bare tool calls when no content and showToolCalls is true', () => {
      render(
        <SessionMessage
          role="assistant"
          content=""
          toolCalls={[mockToolCall]}
          showToolCalls={true}
        />
      );

      expect(screen.getByText('search')).toBeInTheDocument();
      expect(screen.queryByText('System')).not.toBeInTheDocument();
    });

    it('should hide message when only tool calls and showToolCalls is false', () => {
      const { container } = render(
        <SessionMessage
          role="assistant"
          content=""
          toolCalls={[mockToolCall]}
          showToolCalls={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should return null when no content and no sender', () => {
      const { container } = render(
        <SessionMessage role="assistant" content="" />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('system messages', () => {
    it('should render system message', () => {
      render(<SessionMessage role="system" content="System notification" />);

      expect(screen.getByText('System notification')).toBeInTheDocument();
    });
  });

  describe('content handling', () => {
    it('should render empty container when content is empty string for user', () => {
      const { container } = render(
        <SessionMessage role="user" content="" />
      );

      const messageContainer = container.querySelector('.items-end');
      expect(messageContainer).toBeInTheDocument();
    });

    it('should render empty container when content is only whitespace for user', () => {
      const { container } = render(
        <SessionMessage role="user" content="   " />
      );

      const messageContainer = container.querySelector('.items-end');
      expect(messageContainer).toBeInTheDocument();
    });

    it('should preserve whitespace in content', () => {
      render(
        <SessionMessage
          role="assistant"
          content="Line 1\n\nLine 2"
          sender="test-agent"
        />
      );

      const pre = screen.getByText(/Line 1/).closest('pre');
      expect(pre).toHaveClass('whitespace-pre-wrap');
    });
  });

  describe('tool calls visibility', () => {
    it('should hide message with only tool calls when showToolCalls is false', () => {
      const { container } = render(
        <SessionMessage
          role="assistant"
          content=""
          sender="test-agent"
          toolCalls={[mockToolCall]}
          showToolCalls={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should show message with content even when tool calls hidden', () => {
      render(
        <SessionMessage
          role="assistant"
          content="Hello"
          sender="test-agent"
          toolCalls={[mockToolCall]}
          showToolCalls={false}
        />
      );

      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.queryByText('search')).not.toBeInTheDocument();
    });

    it('should default showToolCalls to false', () => {
      render(
        <SessionMessage
          role="assistant"
          content="Hello"
          sender="test-agent"
          toolCalls={[mockToolCall]}
        />
      );

      expect(screen.queryByText('search')).not.toBeInTheDocument();
    });
  });

  describe('custom styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <SessionMessage
          role="user"
          content="Hello"
          className="custom-class"
        />
      );

      const element = container.querySelector('.custom-class');
      expect(element).toBeInTheDocument();
    });
  });

  describe('variant rendering with tree tool calls', () => {
    it('should render tool calls with tree variant', () => {
      const { container } = render(
        <SessionMessage
          role="assistant"
          content="Result"
          sender="test-agent"
          toolCalls={[mockToolCall]}
          showToolCalls={true}
        />
      );

      expect(screen.getByText('search')).toBeInTheDocument();
      expect(container.querySelector('.flex-col.gap-3')).toBeInTheDocument();
    });
  });

  describe('timestamp formatting', () => {
    it('should format timestamp in 24-hour format', () => {
      const timestamp = '2024-01-01T14:30:45Z';
      const date = new Date(timestamp);
      const expectedTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      render(
        <SessionMessage
          role="assistant"
          content="Hello"
          sender="test-agent"
          timestamp={timestamp}
        />
      );

      expect(screen.getByText(expectedTime)).toBeInTheDocument();
    });

    it('should handle midnight correctly', () => {
      const timestamp = '2024-01-01T00:00:00Z';
      const date = new Date(timestamp);
      const expectedTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      render(
        <SessionMessage
          role="assistant"
          content="Hello"
          sender="test-agent"
          timestamp={timestamp}
        />
      );

      expect(screen.getByText(expectedTime)).toBeInTheDocument();
    });
  });

  describe('alignment', () => {
    it('should align user messages to the right', () => {
      const { container } = render(
        <SessionMessage role="user" content="Hello" />
      );

      const messageContainer = container.querySelector('.items-end');
      expect(messageContainer).toBeInTheDocument();
    });

    it('should align assistant messages to the left', () => {
      const { container } = render(
        <SessionMessage role="assistant" content="Hello" sender="agent" />
      );

      const messageContainer = container.querySelector('.items-start');
      expect(messageContainer).toBeInTheDocument();
    });

    it('should align system messages to the left', () => {
      const { container } = render(
        <SessionMessage role="assistant" content="System message" />
      );

      const messageContainer = container.querySelector('.items-start');
      expect(messageContainer).toBeInTheDocument();
    });
  });
});
