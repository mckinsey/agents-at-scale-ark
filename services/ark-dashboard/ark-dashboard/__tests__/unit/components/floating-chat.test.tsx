import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FloatingChat from '@/components/floating-chat';
import { chatService } from '@/lib/services';

// Mock Next.js router - used by ChatMessage component
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
}));

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock the chat service
vi.mock('@/lib/services', () => ({
  chatService: {
    streamChatResponse: vi.fn(),
  },
}));

describe('FloatingChat', () => {
  const defaultProps = {
    id: 'test-chat',
    name: 'Test Agent',
    type: 'agent' as const,
    position: 0,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Display streaming chunks incrementally', () => {
    it('should display streaming chunks as they arrive', async () => {
      const user = userEvent.setup();

      // Mock streaming response
      const mockChunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] },
        { choices: [{ delta: { content: '!' } }] },
      ];

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
            // Small delay to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        },
      );

      render(<FloatingChat {...defaultProps} />);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Hi there');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      // Wait for user message to appear
      await waitFor(() => {
        expect(screen.getByText('Hi there')).toBeInTheDocument();
      });

      // Wait for assistant message to start appearing with first chunk
      await waitFor(() => {
        expect(screen.getByText(/Hello/)).toBeInTheDocument();
      });

      // Wait for complete message
      await waitFor(
        () => {
          expect(screen.getByText('Hello world!')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('should accumulate content from multiple chunks into single message', async () => {
      const user = userEvent.setup();

      const mockChunks = [
        { choices: [{ delta: { content: 'First' } }] },
        { choices: [{ delta: { content: ' chunk' } }] },
      ];

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        },
      );

      render(<FloatingChat {...defaultProps} />);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('First chunk')).toBeInTheDocument();
      });

      // Should only have one assistant message, not multiple
      const assistantMessages = screen.getAllByText(/First/);
      expect(assistantMessages).toHaveLength(1);
    });
  });

  describe('Handle streaming completion', () => {
    it('should stop processing when stream completes', async () => {
      const user = userEvent.setup();

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          yield { choices: [{ delta: { content: 'Done' } }] };
          // Stream ends here
        },
      );

      render(<FloatingChat {...defaultProps} />);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      // Wait for message to complete
      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
      });

      // Input should be enabled again (not processing)
      await waitFor(() => {
        expect(input).not.toBeDisabled();
      });
    });
  });

  describe('Show streaming indicator', () => {
    it('should disable input while streaming', async () => {
      const user = userEvent.setup();

      let resolveStream: () => void;
      const streamPromise = new Promise<void>(resolve => {
        resolveStream = resolve;
      });

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          yield { choices: [{ delta: { content: 'Processing' } }] };
          await streamPromise; // Wait until we resolve it
        },
      );

      render(<FloatingChat {...defaultProps} />);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      // Input should be disabled during streaming
      await waitFor(() => {
        expect(input).toBeDisabled();
      });

      // Complete the stream
      resolveStream!();

      // Input should be enabled after streaming completes
      await waitFor(() => {
        expect(input).not.toBeDisabled();
      });
    });

    it('should show typing indicator during streaming', async () => {
      const user = userEvent.setup();

      let resolveStream: () => void;
      const streamPromise = new Promise<void>(resolve => {
        resolveStream = resolve;
      });

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          await streamPromise;
        },
      );

      render(<FloatingChat {...defaultProps} />);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      // Should show "Processing..." placeholder
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Processing...'),
        ).toBeInTheDocument();
      });

      resolveStream!();

      // Should return to normal placeholder
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Type your message...'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Complete conversation flow', () => {
    it('should handle multiple messages in succession', async () => {
      const user = userEvent.setup();

      vi.mocked(chatService.streamChatResponse)
        .mockImplementationOnce(async function* () {
          yield { choices: [{ delta: { content: 'First response' } }] };
        })
        .mockImplementationOnce(async function* () {
          yield { choices: [{ delta: { content: 'Second response' } }] };
        });

      render(<FloatingChat {...defaultProps} />);

      const input = screen.getByPlaceholderText('Type your message...');

      // Send first message
      await user.type(input, 'First message');
      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('First response')).toBeInTheDocument();
      });

      // Send second message
      await user.type(input, 'Second message');
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Second response')).toBeInTheDocument();
      });

      // Both messages should be visible
      expect(screen.getByText('First message')).toBeInTheDocument();
      expect(screen.getByText('First response')).toBeInTheDocument();
      expect(screen.getByText('Second message')).toBeInTheDocument();
      expect(screen.getByText('Second response')).toBeInTheDocument();
    });
  });
});
