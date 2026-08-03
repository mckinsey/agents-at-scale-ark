import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BrokerPage from '@/app/(dashboard)/broker/page';
import { memoriesService } from '@/lib/services/memories';

vi.mock('@/lib/services/memories', () => ({
  memoriesService: { getAll: vi.fn() },
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

type ESInstance = {
  url: string;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  close: ReturnType<typeof vi.fn>;
};

const esInstances: ESInstance[] = [];

class MockEventSource {
  url: string;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
    esInstances.push(this as unknown as ESInstance);
  }
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const EMPTY_PAGE = { items: [], total: 0, hasMore: false };

/** Serves the five `limit=1` probes; every other GET returns an empty page. */
function mockFetch(probeItems: (url: string) => unknown[]) {
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (/limit=1$/.test(url)) {
      const items = probeItems(url);
      return Promise.resolve(
        jsonResponse({ items, total: items.length, hasMore: false }),
      );
    }
    return Promise.resolve(jsonResponse(EMPTY_PAGE));
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrokerPage />
    </QueryClientProvider>,
  );
}

function emitTrace(data: unknown) {
  const stream = esInstances.find(es => es.url.includes('/broker/traces'));
  act(() => {
    stream?.onmessage?.({ data: JSON.stringify(data) });
  });
}

beforeEach(() => {
  esInstances.length = 0;
  (globalThis as unknown as { EventSource: unknown }).EventSource =
    MockEventSource;
  vi.mocked(memoriesService.getAll).mockResolvedValue([
    { name: 'default' },
  ] as unknown as Awaited<ReturnType<typeof memoriesService.getAll>>);
  mockFetch(() => []);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('BrokerPage', () => {
  it('renders the empty state when every stream is empty', async () => {
    renderPage();

    expect(await screen.findByText('No stream records')).toBeInTheDocument();
    expect(
      screen.getByText(/The broker has no records for default/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      'https://mckinsey.github.io/agents-at-scale-ark/developer-guide/observability/',
    );
    expect(screen.queryByRole('tab', { name: 'OTEL Traces' })).toBeNull();
  });

  it('keeps the memory selector reachable while the empty state is shown', async () => {
    vi.mocked(memoriesService.getAll).mockResolvedValue([
      { name: 'default' },
      { name: 'other' },
    ] as unknown as Awaited<ReturnType<typeof memoriesService.getAll>>);

    renderPage();

    // The selector must not be swallowed by the empty state, otherwise a
    // memory that does hold records becomes unreachable.
    expect(await screen.findByText('No stream records')).toBeInTheDocument();
    expect(screen.getByLabelText('Memory')).toBeInTheDocument();
  });

  it('renders the empty state when no memory exists', async () => {
    vi.mocked(memoriesService.getAll).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('No stream records')).toBeInTheDocument();
  });

  it('never flashes the stream panel while the probe is still resolving', async () => {
    renderPage();

    // Before memories and the probe settle the outcome is unknown, so neither
    // the panel nor the empty state may be committed.
    expect(screen.queryByText('Waiting for data...')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'OTEL Traces' })).toBeNull();
    expect(screen.queryByText('No stream records')).toBeNull();

    expect(await screen.findByText('No stream records')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for data...')).toBeNull();
  });

  it('renders the tabs instead of the empty state when memories cannot be loaded', async () => {
    vi.mocked(memoriesService.getAll).mockRejectedValue(new Error('boom'));

    renderPage();

    expect(
      await screen.findByRole('tab', { name: 'OTEL Traces' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No stream records')).toBeNull();
  });

  it('renders the stream panel once a stream holds a record', async () => {
    mockFetch(url => (url.includes('/broker/events') ? [{ id: 'e1' }] : []));

    renderPage();

    expect(
      await screen.findByRole('tab', { name: 'OTEL Traces' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Waiting for data...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purge' })).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('renders a streamed entry and toggles its payload', async () => {
    const user = userEvent.setup();
    mockFetch(url => (url.includes('/broker/events') ? [{ id: 'e1' }] : []));
    renderPage();
    await screen.findByRole('tab', { name: 'OTEL Traces' });
    await waitFor(() => {
      expect(esInstances.some(es => es.url.includes('/broker/traces'))).toBe(
        true,
      );
    });

    emitTrace({ timestamp: '2026-07-31T10:00:00.000Z', traceId: 'trace-1' });

    const toggle = await waitFor(() => {
      const found = screen
        .getAllByRole('button')
        .find(button => button.getAttribute('aria-expanded') === 'false');
      expect(found).toBeDefined();
      return found!;
    });

    await user.click(toggle);
    expect(await screen.findByText(/"traceId": "trace-1"/)).toBeInTheDocument();

    await user.click(toggle);
    await waitFor(() => {
      expect(screen.queryByText(/"traceId": "trace-1"/)).toBeNull();
    });
  });

  it('switches tabs and keeps the selected tab active', async () => {
    const user = userEvent.setup();
    mockFetch(url => (url.includes('/broker/events') ? [{ id: 'e1' }] : []));
    renderPage();

    const messagesTab = await screen.findByRole('tab', { name: 'Messages' });
    await user.click(messagesTab);

    await waitFor(() => {
      expect(messagesTab).toHaveAttribute('data-state', 'active');
    });
    // Tab label plus the panel title now both read "Messages".
    expect(screen.getAllByText('Messages')).toHaveLength(2);
    expect(screen.getAllByText('OTEL Traces')).toHaveLength(1);
  });

  it('purges a stream and re-probes for records', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(url =>
      url.includes('/broker/events') ? [{ id: 'e1' }] : [],
    );
    renderPage();
    await screen.findByRole('tab', { name: 'OTEL Traces' });

    await user.click(screen.getByRole('button', { name: 'Purge' }));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        call => (call[1] as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(deleteCall).toBeDefined();
      expect(String(deleteCall?.[0])).toContain('/broker/traces');
    });
  });
});
