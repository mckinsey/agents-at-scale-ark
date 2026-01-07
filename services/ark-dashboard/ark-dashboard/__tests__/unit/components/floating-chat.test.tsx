import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAtomValue } from 'jotai';
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
    submitChatQuery: vi.fn(),
    getQueryResult: vi.fn(),
  },
}));

// Mock jotai
vi.mock('jotai', async importOriginal => {
  const actual = await importOriginal<typeof import('jotai')>();
  return {
    ...actual,
    useAtomValue: vi.fn(),
  };
});

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

  describe('streaming enabled', () => {
    // Mock feature flag to true
    vi.mocked(useAtomValue).mockReturnValue(true);

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

  describe('window state management', () => {
    beforeEach(() => {
      vi.mocked(useAtomValue).mockReturnValue(true);
    });

    describe('default state', () => {
      it('should start in default state with visible content', () => {
        render(<FloatingChat {...defaultProps} />);

        expect(
          screen.getByPlaceholderText('Type your message...'),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/start a conversation with the agent/i),
        ).toBeInTheDocument();
      });

      it('should show minimize button in default state', () => {
        render(<FloatingChat {...defaultProps} />);

        const minimizeButton = screen.getByRole('button', {
          name: /minimize chat/i,
        });
        expect(minimizeButton).toBeInTheDocument();
      });

      it('should show maximize button in default state', () => {
        render(<FloatingChat {...defaultProps} />);

        const maximizeButton = screen.getByRole('button', {
          name: /maximize chat/i,
        });
        expect(maximizeButton).toBeInTheDocument();
      });
    });

    describe('minimized state', () => {
      it('should hide chat content when minimized', async () => {
        const user = userEvent.setup();
        render(<FloatingChat {...defaultProps} />);

        const minimizeButton = screen.getByRole('button', {
          name: /minimize chat/i,
        });
        await user.click(minimizeButton);

        expect(
          screen.queryByPlaceholderText('Type your message...'),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText(/start a conversation with the agent/i),
        ).not.toBeInTheDocument();
      });

      it('should keep the chat name visible when minimized', async () => {
        const user = userEvent.setup();
        render(<FloatingChat {...defaultProps} />);

        const minimizeButton = screen.getByRole('button', {
          name: /minimize chat/i,
        });
        await user.click(minimizeButton);

        expect(screen.getByText('Test Agent')).toBeInTheDocument();
      });

      it('should keep close button visible when minimized', async () => {
        const user = userEvent.setup();
        render(<FloatingChat {...defaultProps} />);

        const minimizeButton = screen.getByRole('button', {
          name: /minimize chat/i,
        });
        await user.click(minimizeButton);

        const closeButton = screen.getByRole('button', { name: /close chat/i });
        expect(closeButton).toBeInTheDocument();
      });

      it('should allow normalizing from minimized state', async () => {
        const user = userEvent.setup();
        render(<FloatingChat {...defaultProps} />);

        const minimizeButton = screen.getByRole('button', {
          name: /minimize chat/i,
        });
        await user.click(minimizeButton);

        const restoreButton = screen.getByRole('button', {
          name: /restore chat/i,
        });
        await user.click(restoreButton);

        expect(
          screen.getByPlaceholderText('Type your message...'),
        ).toBeInTheDocument();
      });

      it('should allow maximizing from minimized state', async () => {
        const user = userEvent.setup();
        render(<FloatingChat {...defaultProps} />);

        const minimizeButton = screen.getByRole('button', {
          name: /minimize chat/i,
        });
        await user.click(minimizeButton);

        const maximizeButton = screen.getByRole('button', {
          name: /maximize chat/i,
        });
        await user.click(maximizeButton);

        expect(
          screen.getByPlaceholderText('Type your message...'),
        ).toBeInTheDocument();
        const restoreSizeButton = screen.getByRole('button', {
          name: /restore size/i,
        });
        expect(restoreSizeButton).toBeInTheDocument();
      });
    });

    describe('maximized state', () => {
      it('should show restore size button when maximized', async () => {
        const user = userEvent.setup();
        render(<FloatingChat {...defaultProps} />);

        const maximizeButton = screen.getByRole('button', {
          name: /maximize chat/i,
        });
        await user.click(maximizeButton);

        const restoreSizeButton = screen.getByRole('button', {
          name: /restore size/i,
        });
        expect(restoreSizeButton).toBeInTheDocument();
      });

      it('should allow normalizing from maximized state', async () => {
        const user = userEvent.setup();
        render(<FloatingChat {...defaultProps} />);

        const maximizeButton = screen.getByRole('button', {
          name: /maximize chat/i,
        });
        await user.click(maximizeButton);

        const restoreSizeButton = screen.getByRole('button', {
          name: /restore size/i,
        });
        await user.click(restoreSizeButton);

        const maximizeAgainButton = screen.getByRole('button', {
          name: /maximize chat/i,
        });
        expect(maximizeAgainButton).toBeInTheDocument();
      });

      it('should allow minimizing from maximized state', async () => {
        const user = userEvent.setup();
        render(<FloatingChat {...defaultProps} />);

        const maximizeButton = screen.getByRole('button', {
          name: /maximize chat/i,
        });
        await user.click(maximizeButton);

        const minimizeButton = screen.getByRole('button', {
          name: /minimize chat/i,
        });
        await user.click(minimizeButton);

        expect(
          screen.queryByPlaceholderText('Type your message...'),
        ).not.toBeInTheDocument();
        const restoreButton = screen.getByRole('button', {
          name: /restore chat/i,
        });
        expect(restoreButton).toBeInTheDocument();
      });

      it('should keep close button visible when maximized', async () => {
        const user = userEvent.setup();
        render(<FloatingChat {...defaultProps} />);

        const maximizeButton = screen.getByRole('button', {
          name: /maximize chat/i,
        });
        await user.click(maximizeButton);

        const closeButton = screen.getByRole('button', { name: /close chat/i });
        expect(closeButton).toBeInTheDocument();
      });
    });
  });

  describe('debug mode toggle', () => {
    beforeEach(() => {
      vi.mocked(useAtomValue).mockReturnValue(true);
    });

    it('should render debug mode switch', () => {
      render(<FloatingChat {...defaultProps} />);

      const debugSwitch = screen.getByRole('switch', { name: /show tool calls/i });
      expect(debugSwitch).toBeInTheDocument();
    });

    it('should have debug mode enabled by default', () => {
      render(<FloatingChat {...defaultProps} />);

      const debugSwitch = screen.getByRole('switch', { name: /show tool calls/i });
      expect(debugSwitch).toBeChecked();
    });

    it('should toggle debug mode when switch is clicked', async () => {
      const user = userEvent.setup();
      render(<FloatingChat {...defaultProps} />);

      const debugSwitch = screen.getByRole('switch', { name: /show tool calls/i });
      expect(debugSwitch).toBeChecked();

      await user.click(debugSwitch);
      expect(debugSwitch).not.toBeChecked();

      await user.click(debugSwitch);
      expect(debugSwitch).toBeChecked();
    });

    it('should toggle debug mode when label is clicked', async () => {
      const user = userEvent.setup();
      render(<FloatingChat {...defaultProps} />);

      const debugSwitch = screen.getByRole('switch', { name: /show tool calls/i });
      const label = screen.getByText('Show tool calls');

      expect(debugSwitch).toBeChecked();

      await user.click(label);
      expect(debugSwitch).not.toBeChecked();
    });

    it('should show tool calls by default (debug mode on)', async () => {
      const user = userEvent.setup();

      const mockChunks = [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: 'call_1',
                    function: { name: 'get_weather', arguments: '' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [{ function: { arguments: '{"city":"NYC"}' } }],
              },
            },
          ],
        },
        { choices: [{ delta: { content: 'The weather is sunny' } }] },
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
      await user.type(input, 'What is the weather?');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(
          screen.getByText('The weather is sunny'),
        ).toBeInTheDocument();
      });

      expect(screen.getByText('get_weather')).toBeInTheDocument();
    });

    it('should not show tool calls when debug mode is disabled', async () => {
      const user = userEvent.setup();

      const mockChunks = [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: 'call_1',
                    function: { name: 'get_weather', arguments: '' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [{ function: { arguments: '{"city":"NYC"}' } }],
              },
            },
          ],
        },
        { choices: [{ delta: { content: 'The weather is sunny' } }] },
      ];

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        },
      );

      render(<FloatingChat {...defaultProps} />);

      const debugSwitch = screen.getByRole('switch', { name: /show tool calls/i });
      await user.click(debugSwitch);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'What is the weather?');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(
          screen.getByText('The weather is sunny'),
        ).toBeInTheDocument();
      });

      expect(screen.queryByText('get_weather')).not.toBeInTheDocument();
    });

    it('should hide tool calls when debug mode is toggled off after being on', async () => {
      const user = userEvent.setup();

      const mockChunks = [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: 'call_1',
                    function: { name: 'get_weather', arguments: '' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [{ function: { arguments: '{"city":"NYC"}' } }],
              },
            },
          ],
        },
        { choices: [{ delta: { content: 'The weather is sunny' } }] },
      ];

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        },
      );

      render(<FloatingChat {...defaultProps} />);

      const debugSwitch = screen.getByRole('switch', { name: /show tool calls/i });

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'What is the weather?');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('get_weather')).toBeInTheDocument();
      });

      await user.click(debugSwitch);

      expect(screen.queryByText('get_weather')).not.toBeInTheDocument();
      expect(
        screen.getByText('The weather is sunny'),
      ).toBeInTheDocument();
    });
  });

  describe('streaming disabled', () => {
    it('should poll for response when feature flag is disabled', async () => {
      // Mock feature flag to false
      vi.mocked(useAtomValue).mockReturnValue(false);

      const user = userEvent.setup();

      // Mock submitChatQuery
      vi.mocked(chatService.submitChatQuery).mockResolvedValue({
        name: 'query-123',
      } as any);

      // Mock getQueryResult to return pending then done
      vi.mocked(chatService.getQueryResult)
        .mockResolvedValueOnce({
          terminal: false,
          status: 'running',
          response: undefined,
        })
        .mockResolvedValueOnce({
          terminal: true,
          status: 'done',
          response: 'Polled response',
        });

      render(<FloatingChat {...defaultProps} />);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test message');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      // Should call submitChatQuery
      await waitFor(() => {
        expect(chatService.submitChatQuery).toHaveBeenCalledWith(
          expect.arrayContaining([{ role: 'user', content: 'Test message' }]),
          'agent',
          'Test Agent',
          expect.any(String),
        );
      });

      // Should call getQueryResult
      await waitFor(() => {
        expect(chatService.getQueryResult).toHaveBeenCalledWith('query-123');
      });

      // Should eventually show the response
      await waitFor(
        () => {
          expect(screen.getByText('Polled response')).toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Should NOT call streamChatResponse
      expect(chatService.streamChatResponse).not.toHaveBeenCalled();
    });

    it('should handle polling errors', async () => {
      // Mock feature flag to false
      vi.mocked(useAtomValue).mockReturnValue(false);

      const user = userEvent.setup();

      vi.mocked(chatService.submitChatQuery).mockResolvedValue({
        name: 'query-error',
      } as any);

      vi.mocked(chatService.getQueryResult).mockResolvedValue({
        terminal: true,
        status: 'error',
        response: 'Something went wrong',
      });

      render(<FloatingChat {...defaultProps} />);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test message');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(
        () => {
          expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    });
  });
});
