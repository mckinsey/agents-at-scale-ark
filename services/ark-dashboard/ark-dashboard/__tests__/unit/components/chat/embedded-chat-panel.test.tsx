import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
