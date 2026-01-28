import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatHistoryAtom } from '@/atoms/chat-history';
import { lastConversationIdAtom } from '@/atoms/internal-states';
import { EmbeddedChatPanel } from '@/components/chat/embedded-chat-panel';

vi.mock('@/lib/services/chat', () => ({
  chatService: {
    streamChatResponse: vi.fn(),
    submitChatQuery: vi.fn(),
    getQueryResult: vi.fn(),
  },
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/agents/test-agent',
  useSearchParams: () => new URLSearchParams(),
}));

global.EventSource = vi.fn(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  readyState: 0,
  url: '',
  withCredentials: false,
  CONNECTING: 0,
  OPEN: 1,
  CLOSED: 2,
  onerror: null,
  onmessage: null,
  onopen: null,
  dispatchEvent: vi.fn(),
})) as unknown as typeof EventSource;

global.fetch = vi.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ items: [], total: 0, hasMore: false }),
  } as Response),
);

let queryClient: QueryClient;
let store: ReturnType<typeof createStore>;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  store = createStore();
  sessionStorage.clear();
  localStorage.clear();
  global.fetch = vi.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ items: [], total: 0, hasMore: false }),
    } as Response),
  );
});

function renderEmbeddedChatPanel(props: {
  name: string;
  type: 'agent' | 'model' | 'team';
}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>
        <EmbeddedChatPanel {...props} />
      </JotaiProvider>
    </QueryClientProvider>,
  );
}

describe('EmbeddedChatPanel', () => {
  it('should use persisted conversation ID as sessionId when available', () => {
    sessionStorage.setItem(
      'last-conversation-id',
      JSON.stringify('persisted-session-123'),
    );

    renderEmbeddedChatPanel({ name: 'test-agent', type: 'agent' });

    const atomValue = store.get(lastConversationIdAtom);
    expect(atomValue).toBe('persisted-session-123');
  });

  it('should persist new sessionId to atom on new chat creation', async () => {
    renderEmbeddedChatPanel({ name: 'test-agent', type: 'agent' });

    const newChatButton = screen.getByText(/New Chat/i);
    expect(newChatButton).toBeInTheDocument();
  });

  it('should render chat interface', () => {
    renderEmbeddedChatPanel({ name: 'test-agent', type: 'agent' });

    expect(screen.getByText(/Chat with test-agent/i)).toBeInTheDocument();
  });

  it('should NOT clear traces and events when starting a new chat', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes('/v1/broker/traces')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              items: [
                {
                  traceId: 'trace-1',
                  spans: [
                    {
                      attributes: [
                        { key: 'session.id', value: 'session-A' },
                        { key: 'agent', value: 'test-agent' },
                      ],
                      startTimeUnixNano: '1704103200000000000',
                    },
                  ],
                },
              ],
              total: 1,
              hasMore: false,
            }),
        } as Response);
      }
      return Promise.resolve({
        json: () => Promise.resolve({ items: [], total: 0, hasMore: false }),
      } as Response);
    });
    global.fetch = fetchMock;

    store.set(chatHistoryAtom, {
      'agent-test-agent': {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        sessionId: 'old-session-id',
      },
    });

    renderEmbeddedChatPanel({ name: 'test-agent', type: 'agent' });

    const debugTab = screen.getByRole('tab', { name: /Debug/i });
    await user.click(debugTab);

    expect(await screen.findByText(/Session: session-A/i)).toBeInTheDocument();

    const chatTab = screen.getByRole('tab', { name: /Chat/i });
    await user.click(chatTab);

    const newChatButton = await screen.findByText(/New Chat/i);
    expect(newChatButton).not.toBeDisabled();

    await user.click(newChatButton);

    const messages = store.get(chatHistoryAtom)['agent-test-agent'].messages;
    expect(messages).toHaveLength(0);

    await user.click(debugTab);

    expect(screen.getByText(/Session: session-A/i)).toBeInTheDocument();
  });

  it('should fetch traces without session_id query parameter', () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockClear();

    renderEmbeddedChatPanel({ name: 'test-agent', type: 'agent' });

    expect(fetchMock).toHaveBeenCalled();
    const tracesCall = Array.from(fetchMock.mock.calls).find(call =>
      call[0].toString().includes('/v1/broker/traces'),
    );
    expect(tracesCall).toBeDefined();
    expect(tracesCall![0].toString()).not.toContain('session_id');
  });

  it('should fetch events without session_id query parameter', () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockClear();

    renderEmbeddedChatPanel({ name: 'test-agent', type: 'agent' });

    expect(fetchMock).toHaveBeenCalled();
    const eventsCall = Array.from(fetchMock.mock.calls).find(call =>
      call[0].toString().includes('/v1/broker/events'),
    );
    expect(eventsCall).toBeDefined();
    expect(eventsCall![0].toString()).not.toContain('session_id');
  });

  it('should group traces and spans by session ID', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes('/v1/broker/traces')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              items: [
                {
                  traceId: 'trace-1',
                  spans: [
                    {
                      attributes: [
                        { key: 'session.id', value: 'session-A' },
                        { key: 'agent', value: 'test-agent' },
                      ],
                      startTimeUnixNano: '1704103200000000000',
                    },
                  ],
                },
                {
                  traceId: 'trace-2',
                  spans: [
                    {
                      attributes: [
                        { key: 'session.id', value: 'session-B' },
                        { key: 'agent', value: 'test-agent' },
                      ],
                      startTimeUnixNano: '1704103260000000000',
                    },
                  ],
                },
                {
                  traceId: 'trace-3',
                  spans: [
                    {
                      attributes: [
                        { key: 'session.id', value: 'session-A' },
                        { key: 'agent', value: 'test-agent' },
                      ],
                      startTimeUnixNano: '1704103320000000000',
                    },
                  ],
                },
              ],
              total: 3,
              hasMore: false,
            }),
        } as Response);
      }
      return Promise.resolve({
        json: () => Promise.resolve({ items: [], total: 0, hasMore: false }),
      } as Response);
    });
    global.fetch = fetchMock;

    renderEmbeddedChatPanel({ name: 'test-agent', type: 'agent' });

    const debugTab = screen.getByRole('tab', { name: /Debug/i });
    await user.click(debugTab);

    expect(await screen.findByText(/Session: session-A/i)).toBeInTheDocument();
    expect(screen.getByText(/Session: session-B/i)).toBeInTheDocument();
    expect(screen.getByText(/2 entries/i)).toBeInTheDocument();
    expect(screen.getByText(/1 entry/i)).toBeInTheDocument();
  });

  it('should group events by session ID', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes('/v1/broker/events')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              items: [
                {
                  timestamp: '2024-01-01T10:00:00Z',
                  eventType: 'Normal',
                  reason: 'ExecutionComplete',
                  message: 'Test execution completed',
                  data: {
                    sessionId: 'session-X',
                    queryName: 'test-agent',
                  },
                },
                {
                  timestamp: '2024-01-01T10:01:00Z',
                  eventType: 'Normal',
                  reason: 'ExecutionComplete',
                  message: 'Test execution completed',
                  data: {
                    sessionId: 'session-Y',
                    queryName: 'test-agent',
                  },
                },
                {
                  timestamp: '2024-01-01T10:02:00Z',
                  eventType: 'Normal',
                  reason: 'ExecutionComplete',
                  message: 'Test execution completed',
                  data: {
                    sessionId: 'session-X',
                    queryName: 'test-agent',
                  },
                },
              ],
              total: 3,
              hasMore: false,
            }),
        } as Response);
      }
      return Promise.resolve({
        json: () => Promise.resolve({ items: [], total: 0, hasMore: false }),
      } as Response);
    });

    renderEmbeddedChatPanel({ name: 'test-agent', type: 'agent' });

    const debugTab = screen.getByRole('tab', { name: /Debug/i });
    await user.click(debugTab);

    const eventsTab = screen.getByRole('tab', { name: /Cluster Events/i });
    await user.click(eventsTab);

    expect(await screen.findByText(/Session: session-X/i)).toBeInTheDocument();
    expect(await screen.findByText(/Session: session-Y/i)).toBeInTheDocument();
  });
});
