import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider, createStore, useAtomValue } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isChatStreamingEnabledAtom,
  queryTimeoutSettingAtom,
} from '@/atoms/experimental-features';
import { lastConversationIdAtom } from '@/atoms/internal-states';
import FloatingChat from '@/components/floating-chat';
import type { QueryDetailResponse } from '@/lib/services';
import { chatService } from '@/lib/services';

const mockInvalidateQueriesList = vi.fn();

vi.mock('@/lib/services/queries-hooks', () => ({
  useInvalidateQueriesList: () => mockInvalidateQueriesList,
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

// Mock Next.js router - used by ChatMessage component
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock the chat service
vi.mock('@/lib/services', () => ({
  chatService: {
    streamChatResponse: vi.fn(),
    startStreamChatResponse: vi.fn(),
    streamQueryStatus: vi.fn().mockResolvedValue(() => {}),
    submitChatQuery: vi.fn(),
    getQueryResult: vi.fn(),
    getQuery: vi.fn().mockResolvedValue({ status: { conversationId: '' } }),
    resolveMemoryNotice: vi
      .fn()
      .mockResolvedValue({ settled: true, notice: null }),
  },
  agentsService: {
    getByName: vi.fn().mockResolvedValue({ parameters: [] }),
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

// Shaped like the DOM AbortError the real fetch throws, so the hook's
// `err.name === 'AbortError'` swallow path is exercised.
function makeAbortError(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

function renderFloatingChat(
  props: {
    id: string;
    name: string;
    type: 'agent' | 'model' | 'team';
    position: number;
    onClose: () => void;
  },
  store?: ReturnType<typeof createStore>,
) {
  if (store) {
    return render(
      <JotaiProvider store={store}>
        <FloatingChat {...props} />
      </JotaiProvider>,
    );
  }
  return render(
    <JotaiProvider>
      <FloatingChat {...props} />
    </JotaiProvider>,
  );
}

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
    sessionStorage.clear();
    localStorage.clear();

    vi.mocked(chatService.submitChatQuery).mockResolvedValue({
      name: 'test-query',
    } as Awaited<ReturnType<typeof chatService.submitChatQuery>>);

    vi.mocked(chatService.startStreamChatResponse).mockImplementation(
      async (...args: unknown[]) => ({
        queryName: 'test-query',
        chunks: (
          chatService.streamChatResponse as (
            ...a: unknown[]
          ) => AsyncGenerator<Record<string, unknown>>
        )(...args),
      }),
    );
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(() => {});
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

      renderFloatingChat(defaultProps);

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

      renderFloatingChat(defaultProps);

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

      renderFloatingChat(defaultProps);

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

      renderFloatingChat(defaultProps);

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

      renderFloatingChat(defaultProps);

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

      renderFloatingChat(defaultProps);

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

    it('stops a hung chunk stream when the query reaches a terminal phase (#2862)', async () => {
      const user = userEvent.setup();

      // Chunk stream that yields once, then hangs until the transport is
      // released — simulates the broker never sending [DONE] (executor killed /
      // broker unreachable).
      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* (
          _namespace,
          _input,
          _targetType,
          _targetName,
          _sessionId,
          _conversationId,
          _timeout,
          abortSignal,
        ) {
          yield { choices: [{ delta: { content: 'partial' } }] };
          await new Promise<void>((_resolve, reject) => {
            if (abortSignal?.aborted) return reject(makeAbortError());
            abortSignal?.addEventListener(
              'abort',
              () => reject(makeAbortError()),
              { once: true },
            );
          });
        },
      );

      // Query reaches a terminal phase with no [DONE] on the chunk stream: fire
      // the onTerminal callback the hook passes to bind the stream to the poll.
      vi.mocked(chatService.streamQueryStatus).mockImplementation(
        async (
          _namespace,
          _queryName,
          _onUpdate,
          _pollInterval,
          onTerminal,
        ) => {
          onTerminal?.('done');
          return () => {};
        },
      );

      renderFloatingChat(defaultProps);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Hi');
      await user.click(screen.getByRole('button', { name: /send/i }));

      // Streaming started: first chunk rendered, input disabled.
      await waitFor(() => {
        expect(screen.getByText('partial')).toBeInTheDocument();
      });
      expect(input).toBeDisabled();

      // A re-enabled input is how the chat signals it left the streaming state.
      // The hung stream never ends on its own, so this only happens if the
      // terminal-phase poll stops it; without that wiring the input stays
      // disabled and this waitFor times out.
      await waitFor(
        () => {
          expect(input).not.toBeDisabled();
        },
        { timeout: 4000 },
      );
      // Stopping is a clean close, not an abort surfaced to the user: no error
      // message is rendered for the turn.
      expect(
        screen.queryByText(/Failed to send message/i),
      ).not.toBeInTheDocument();
    });

    it('lets a late chunk within the grace finish instead of truncating (#2862)', async () => {
      const user = userEvent.setup();

      // The query goes terminal while a final chunk is still in flight. The
      // grace must let that chunk land rather than stopping the stream at once.
      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* (
          _namespace,
          _input,
          _targetType,
          _targetName,
          _sessionId,
          _conversationId,
          _timeout,
          abortSignal,
        ) {
          yield { choices: [{ delta: { content: 'part1' } }] };
          const late = new Promise<void>(resolve => setTimeout(resolve, 50));
          const released = new Promise<never>((_resolve, reject) => {
            if (abortSignal?.aborted) return reject(makeAbortError());
            abortSignal?.addEventListener(
              'abort',
              () => reject(makeAbortError()),
              { once: true },
            );
          });
          await Promise.race([late, released]);
          yield {
            choices: [{ delta: { content: 'part2' }, finish_reason: 'stop' }],
          };
        },
      );

      vi.mocked(chatService.streamQueryStatus).mockImplementation(
        async (
          _namespace,
          _queryName,
          _onUpdate,
          _pollInterval,
          onTerminal,
        ) => {
          onTerminal?.('done');
          return () => {};
        },
      );

      renderFloatingChat(defaultProps);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Hi');
      await user.click(screen.getByRole('button', { name: /send/i }));

      // The late chunk must arrive; a zero grace would stop before it lands.
      await waitFor(() => {
        expect(screen.getByText('part1part2')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(input).not.toBeDisabled();
      });
      expect(
        screen.queryByText(/Failed to send message/i),
      ).not.toBeInTheDocument();
    });

    it('surfaces a failure when the query force-closes on phase:error (#2862)', async () => {
      const user = userEvent.setup();

      // Query fails without ever emitting an error chunk (e.g. pre-exec timeout):
      // the stream hangs, only the terminal phase reports the failure.
      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* (
          _namespace,
          _input,
          _targetType,
          _targetName,
          _sessionId,
          _conversationId,
          _timeout,
          abortSignal,
        ) {
          yield { choices: [{ delta: { content: 'partial' } }] };
          await new Promise<void>((_resolve, reject) => {
            if (abortSignal?.aborted) return reject(makeAbortError());
            abortSignal?.addEventListener(
              'abort',
              () => reject(makeAbortError()),
              { once: true },
            );
          });
        },
      );
      vi.mocked(chatService.streamQueryStatus).mockImplementation(
        async (
          _namespace,
          _queryName,
          _onUpdate,
          _pollInterval,
          onTerminal,
        ) => {
          onTerminal?.('error');
          return () => {};
        },
      );

      renderFloatingChat(defaultProps);
      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Hi');
      await user.click(screen.getByRole('button', { name: /send/i }));

      // Without threading the error phase, this force-closes as a silent success.
      await waitFor(
        () => {
          expect(screen.getByText('Query failed')).toBeInTheDocument();
        },
        { timeout: 4000 },
      );
    });

    it('force-closes cleanly on phase:cancelled without marking a failure (#2862)', async () => {
      const user = userEvent.setup();

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* (
          _namespace,
          _input,
          _targetType,
          _targetName,
          _sessionId,
          _conversationId,
          _timeout,
          abortSignal,
        ) {
          yield { choices: [{ delta: { content: 'partial' } }] };
          await new Promise<void>((_resolve, reject) => {
            if (abortSignal?.aborted) return reject(makeAbortError());
            abortSignal?.addEventListener(
              'abort',
              () => reject(makeAbortError()),
              { once: true },
            );
          });
        },
      );
      vi.mocked(chatService.streamQueryStatus).mockImplementation(
        async (
          _namespace,
          _queryName,
          _onUpdate,
          _pollInterval,
          onTerminal,
        ) => {
          onTerminal?.('cancelled');
          return () => {};
        },
      );

      renderFloatingChat(defaultProps);
      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Hi');
      await user.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(
        () => {
          expect(input).not.toBeDisabled();
        },
        { timeout: 4000 },
      );
      // cancelled is not a failure: the partial answer stays, nothing is marked failed.
      expect(screen.getByText('partial')).toBeInTheDocument();
      expect(screen.queryByText('Query failed')).not.toBeInTheDocument();
    });

    it('force-closes cleanly on legacy phase:canceled without marking a failure (#2862)', async () => {
      const user = userEvent.setup();

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* (
          _namespace,
          _input,
          _targetType,
          _targetName,
          _sessionId,
          _conversationId,
          _timeout,
          abortSignal,
        ) {
          yield { choices: [{ delta: { content: 'partial' } }] };
          await new Promise<void>((_resolve, reject) => {
            if (abortSignal?.aborted) return reject(makeAbortError());
            abortSignal?.addEventListener(
              'abort',
              () => reject(makeAbortError()),
              { once: true },
            );
          });
        },
      );
      vi.mocked(chatService.streamQueryStatus).mockImplementation(
        async (
          _namespace,
          _queryName,
          _onUpdate,
          _pollInterval,
          onTerminal,
        ) => {
          onTerminal?.('canceled');
          return () => {};
        },
      );

      renderFloatingChat(defaultProps);
      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Hi');
      await user.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(
        () => {
          expect(input).not.toBeDisabled();
        },
        { timeout: 4000 },
      );
      expect(screen.getByText('partial')).toBeInTheDocument();
      expect(screen.queryByText('Query failed')).not.toBeInTheDocument();
    });

    it('does not force-close on phase:unknown, so a live answer is not truncated (#2862)', async () => {
      const user = userEvent.setup();

      // A late chunk lands past the grace; an `unknown` phase must not abort it.
      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* (
          _namespace,
          _input,
          _targetType,
          _targetName,
          _sessionId,
          _conversationId,
          _timeout,
          abortSignal,
        ) {
          yield { choices: [{ delta: { content: 'part1' } }] };
          const late = new Promise<void>(resolve => setTimeout(resolve, 500));
          const released = new Promise<never>((_resolve, reject) => {
            if (abortSignal?.aborted) return reject(makeAbortError());
            abortSignal?.addEventListener(
              'abort',
              () => reject(makeAbortError()),
              { once: true },
            );
          });
          await Promise.race([late, released]);
          yield {
            choices: [{ delta: { content: 'part2' }, finish_reason: 'stop' }],
          };
        },
      );
      vi.mocked(chatService.streamQueryStatus).mockImplementation(
        async (
          _namespace,
          _queryName,
          _onUpdate,
          _pollInterval,
          onTerminal,
        ) => {
          onTerminal?.('unknown');
          return () => {};
        },
      );

      renderFloatingChat(defaultProps);
      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Hi');
      await user.click(screen.getByRole('button', { name: /send/i }));

      // 500ms > 300ms grace: if `unknown` armed the force-close, part2 is lost.
      await waitFor(
        () => {
          expect(screen.getByText('part1part2')).toBeInTheDocument();
        },
        { timeout: 4000 },
      );
    });
  });

  describe('window state management', () => {
    beforeEach(() => {
      vi.mocked(useAtomValue).mockReturnValue(true);
    });

    describe('default state', () => {
      it('should start in default state with visible content', () => {
        renderFloatingChat(defaultProps);

        expect(
          screen.getByPlaceholderText('Type your message...'),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/start a conversation with the agent/i),
        ).toBeInTheDocument();
      });

      it('should show minimize button in default state', () => {
        renderFloatingChat(defaultProps);

        const minimizeButton = screen.getByRole('button', {
          name: /minimize chat/i,
        });
        expect(minimizeButton).toBeInTheDocument();
      });

      it('should show maximize button in default state', () => {
        renderFloatingChat(defaultProps);

        const maximizeButton = screen.getByRole('button', {
          name: /maximize chat/i,
        });
        expect(maximizeButton).toBeInTheDocument();
      });
    });

    describe('minimized state', () => {
      it('should hide chat content when minimized', async () => {
        const user = userEvent.setup();
        renderFloatingChat(defaultProps);

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
        renderFloatingChat(defaultProps);

        const minimizeButton = screen.getByRole('button', {
          name: /minimize chat/i,
        });
        await user.click(minimizeButton);

        expect(screen.getByText('Test Agent')).toBeInTheDocument();
      });

      it('should keep close button visible when minimized', async () => {
        const user = userEvent.setup();
        renderFloatingChat(defaultProps);

        const minimizeButton = screen.getByRole('button', {
          name: /minimize chat/i,
        });
        await user.click(minimizeButton);

        const closeButton = screen.getByRole('button', { name: /close chat/i });
        expect(closeButton).toBeInTheDocument();
      });

      it('should allow normalizing from minimized state', async () => {
        const user = userEvent.setup();
        renderFloatingChat(defaultProps);

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
        renderFloatingChat(defaultProps);

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
        renderFloatingChat(defaultProps);

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
        renderFloatingChat(defaultProps);

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
        renderFloatingChat(defaultProps);

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
        renderFloatingChat(defaultProps);

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

    const getToolCallsToggle = () =>
      screen.getByRole('button', { name: /tool calls/i });

    it('should render the tool-calls toggle', () => {
      renderFloatingChat(defaultProps);

      expect(getToolCallsToggle()).toBeInTheDocument();
    });

    it('should have tool calls enabled by default', () => {
      renderFloatingChat(defaultProps);

      expect(getToolCallsToggle()).toHaveAttribute('aria-pressed', 'true');
    });

    it('should toggle debug mode when the toggle is clicked', async () => {
      const user = userEvent.setup();
      renderFloatingChat(defaultProps);

      expect(getToolCallsToggle()).toHaveAttribute('aria-pressed', 'true');

      await user.click(getToolCallsToggle());
      expect(getToolCallsToggle()).toHaveAttribute('aria-pressed', 'false');

      await user.click(getToolCallsToggle());
      expect(getToolCallsToggle()).toHaveAttribute('aria-pressed', 'true');
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

      renderFloatingChat(defaultProps);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'What is the weather?');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('The weather is sunny')).toBeInTheDocument();
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

      renderFloatingChat(defaultProps);

      const debugSwitch = screen.getByRole('button', {
        name: /tool calls/i,
      });
      await user.click(debugSwitch);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'What is the weather?');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('The weather is sunny')).toBeInTheDocument();
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

      renderFloatingChat(defaultProps);

      const debugSwitch = screen.getByRole('button', {
        name: /tool calls/i,
      });

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'What is the weather?');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('get_weather')).toBeInTheDocument();
      });

      await user.click(debugSwitch);

      expect(screen.queryByText('get_weather')).not.toBeInTheDocument();
      expect(screen.getByText('The weather is sunny')).toBeInTheDocument();
    });
  });

  describe('streaming disabled', () => {
    it('should poll for response when feature flag is disabled', async () => {
      // Mock feature flag to false, timeout to '5m'
      // useAtomValue is called twice in the component (isChatStreamingEnabled and queryTimeout)
      // and then again when checking isChatStreamingEnabled in handleSendMessage
      vi.mocked(useAtomValue).mockImplementation(atom => {
        if (atom === isChatStreamingEnabledAtom) {
          return false;
        }
        if (atom === queryTimeoutSettingAtom) {
          return '5m';
        }
        return undefined;
      });

      const user = userEvent.setup();

      // Mock submitChatQuery
      vi.mocked(chatService.submitChatQuery).mockResolvedValue({
        name: 'query-123',
      } as unknown as QueryDetailResponse);

      // Mock getQueryResult to return done immediately
      vi.mocked(chatService.getQueryResult).mockResolvedValue({
        terminal: true,
        status: 'done',
        response: 'Polled response',
      });

      renderFloatingChat(defaultProps);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test message');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(chatService.submitChatQuery).toHaveBeenCalledWith(
          'default',
          'Test message',
          'agent',
          'Test Agent',
          expect.any(String),
          undefined, // conversationId
          '5m', // timeout
          undefined, // parameters
        );
      });

      // Should call getQueryResult
      await waitFor(() => {
        expect(chatService.getQueryResult).toHaveBeenCalledWith('default', 'query-123');
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

    it('should persist conversation ID to sessionStorage', () => {
      vi.mocked(useAtomValue).mockImplementation(atom => {
        if (atom === isChatStreamingEnabledAtom) {
          return false;
        }
        if (atom === queryTimeoutSettingAtom) {
          return '5m';
        }
        if (atom === lastConversationIdAtom) {
          return null;
        }
        return undefined;
      });

      renderFloatingChat(defaultProps);

      const storedId = sessionStorage.getItem('last-conversation-id');
      expect(storedId).not.toBe(null);
    });

    it('should persist messages to sessionStorage', async () => {
      vi.mocked(useAtomValue).mockImplementation(atom => {
        if (atom === isChatStreamingEnabledAtom) {
          return true;
        }
        if (atom === queryTimeoutSettingAtom) {
          return '5m';
        }
        return undefined;
      });

      const user = userEvent.setup();

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          yield { choices: [{ delta: { content: 'Test response' } }] };
        },
      );

      renderFloatingChat(defaultProps);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test message');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Test message')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Test response')).toBeInTheDocument();
      });

      // Verify messages are persisted in sessionStorage
      const storedHistory = sessionStorage.getItem('agent-chat-history');
      expect(storedHistory).not.toBe(null);

      const parsedHistory = JSON.parse(storedHistory!);
      const chatKey = 'agent-Test Agent';
      expect(parsedHistory[chatKey]).toBeDefined();
      expect(parsedHistory[chatKey].messages).toHaveLength(2);
      expect(parsedHistory[chatKey].messages[0].content).toBe('Test message');
      expect(parsedHistory[chatKey].messages[1].content).toBe('Test response');
    });

    it('should handle polling errors', async () => {
      // Mock atoms
      vi.mocked(useAtomValue).mockImplementation(atom => {
        if (atom === isChatStreamingEnabledAtom) {
          return false;
        }
        if (atom === queryTimeoutSettingAtom) {
          return '5m';
        }
        return undefined;
      });

      const user = userEvent.setup();

      vi.mocked(chatService.submitChatQuery).mockResolvedValue({
        name: 'query-error',
      } as unknown as QueryDetailResponse);

      vi.mocked(chatService.getQueryResult).mockResolvedValue({
        terminal: true,
        status: 'error',
        response: 'Something went wrong',
      });

      renderFloatingChat(defaultProps);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test message');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(chatService.submitChatQuery).toHaveBeenCalledWith(
          'default',
          'Test message',
          'agent',
          'Test Agent',
          expect.any(String),
          undefined,
          '5m',
          undefined, // parameters
        );
      });

      await waitFor(
        () => {
          expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    });
  });

  describe('clear chat button', () => {
    beforeEach(() => {
      vi.mocked(useAtomValue).mockReturnValue(true);
    });

    it('should render the New Chat button', () => {
      renderFloatingChat(defaultProps);

      const clearButton = screen.getByRole('button', { name: /new chat/i });
      expect(clearButton).toBeInTheDocument();
    });

    it('should be disabled when no messages exist', () => {
      renderFloatingChat(defaultProps);

      const clearButton = screen.getByRole('button', { name: /new chat/i });
      expect(clearButton).toBeDisabled();
    });

    it('should be disabled while processing', async () => {
      const user = userEvent.setup();

      let resolveStream: () => void;
      const streamPromise = new Promise<void>(resolve => {
        resolveStream = resolve;
      });

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          yield { choices: [{ delta: { content: 'Processing' } }] };
          await streamPromise;
        },
      );

      renderFloatingChat(defaultProps);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(input).toBeDisabled();
      });

      const clearButton = screen.getByRole('button', { name: /new chat/i });
      expect(clearButton).toBeDisabled();

      resolveStream!();
    });

    it('should be enabled when messages exist and not processing', async () => {
      const user = userEvent.setup();

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          yield { choices: [{ delta: { content: 'Response' } }] };
        },
      );

      renderFloatingChat(defaultProps);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test message');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Response')).toBeInTheDocument();
      });

      const clearButton = screen.getByRole('button', { name: /new chat/i });
      expect(clearButton).not.toBeDisabled();
    });

    it('should clear messages when clicked', async () => {
      const user = userEvent.setup();

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          yield { choices: [{ delta: { content: 'First response' } }] };
        },
      );

      renderFloatingChat(defaultProps);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'First message');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('First response')).toBeInTheDocument();
      });

      expect(screen.getByText('First message')).toBeInTheDocument();

      const clearButton = screen.getByRole('button', { name: /new chat/i });
      await user.click(clearButton);

      expect(screen.queryByText('First message')).not.toBeInTheDocument();
      expect(screen.queryByText('First response')).not.toBeInTheDocument();
      expect(
        screen.getByText(/start a conversation with the agent/i),
      ).toBeInTheDocument();
    });

    it('should create new session ID when clicked', async () => {
      const user = userEvent.setup();
      const store = createStore();

      vi.mocked(chatService.streamChatResponse)
        .mockImplementationOnce(async function* () {
          yield { choices: [{ delta: { content: 'First response' } }] };
        })
        .mockImplementationOnce(async function* () {
          yield { choices: [{ delta: { content: 'Second response' } }] };
        });

      renderFloatingChat(defaultProps, store);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'First message');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('First response')).toBeInTheDocument();
      });

      const firstConversationId = store.get(lastConversationIdAtom);

      const clearButton = screen.getByRole('button', { name: /new chat/i });
      await user.click(clearButton);

      await waitFor(() => {
        expect(
          screen.getByText(/start a conversation with the agent/i),
        ).toBeInTheDocument();
      });

      await user.type(input, 'Second message');
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Second response')).toBeInTheDocument();
      });

      const secondConversationId = store.get(lastConversationIdAtom);

      expect(firstConversationId).not.toBe(secondConversationId);
      expect(firstConversationId).toBeTruthy();
      expect(secondConversationId).toBeTruthy();
    });

    it('should persist cleared state to sessionStorage', async () => {
      const user = userEvent.setup();

      vi.mocked(chatService.streamChatResponse).mockImplementation(
        async function* () {
          yield { choices: [{ delta: { content: 'Response' } }] };
        },
      );

      renderFloatingChat(defaultProps);

      const input = screen.getByPlaceholderText('Type your message...');
      await user.type(input, 'Test message');

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Response')).toBeInTheDocument();
      });

      const storedHistoryBefore = sessionStorage.getItem('agent-chat-history');
      expect(storedHistoryBefore).not.toBe(null);
      const parsedHistoryBefore = JSON.parse(storedHistoryBefore!);
      const chatKey = 'agent-Test Agent';
      expect(parsedHistoryBefore[chatKey].messages).toHaveLength(2);

      const clearButton = screen.getByRole('button', { name: /new chat/i });
      await user.click(clearButton);

      await waitFor(() => {
        expect(
          screen.getByText(/start a conversation with the agent/i),
        ).toBeInTheDocument();
      });

      const storedHistoryAfter = sessionStorage.getItem('agent-chat-history');
      expect(storedHistoryAfter).not.toBe(null);
      const parsedHistoryAfter = JSON.parse(storedHistoryAfter!);
      expect(parsedHistoryAfter[chatKey].messages).toHaveLength(0);
    });
  });
});
