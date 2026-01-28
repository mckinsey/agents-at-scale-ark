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

  it('should clear traces and events when starting a new chat', async () => {
    const user = userEvent.setup();

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

    const newChatButton = screen.getByText(/New Chat/i);
    expect(newChatButton).not.toBeDisabled();

    await user.click(newChatButton);

    const messages = store.get(chatHistoryAtom)['agent-test-agent'].messages;
    expect(messages).toHaveLength(0);

    const debugTab = screen.getByRole('tab', { name: /Debug/i });
    await user.click(debugTab);

    expect(screen.getByText(/Waiting for data.../i)).toBeInTheDocument();
  });
});
