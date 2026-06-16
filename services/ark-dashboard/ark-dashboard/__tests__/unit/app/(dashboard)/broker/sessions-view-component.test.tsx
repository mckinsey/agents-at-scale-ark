import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { SessionsView } from '@/app/(dashboard)/broker/page';

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

beforeEach(() => {
  esInstances.length = 0;
  (global as unknown as { EventSource: unknown }).EventSource = MockEventSource;
  global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

function latestES(): ESInstance {
  return esInstances[esInstances.length - 1];
}

function emit(data: unknown) {
  act(() => {
    latestES().onmessage?.({ data: JSON.stringify(data) });
  });
}

describe('SessionsView', () => {
  it('renders Waiting for data... initially', () => {
    render(<SessionsView memory="default" />);
    expect(screen.getByText(/waiting for data/i)).toBeDefined();
  });

  it('opens EventSource with correct URL on mount', () => {
    render(<SessionsView memory="default" />);
    expect(esInstances).toHaveLength(1);
    expect(latestES().url).toBe('/api/v1/broker/sessions?memory=default&watch=true');
  });

  it('cleans up EventSource on unmount', () => {
    const { unmount } = render(<SessionsView memory="default" />);
    const es = latestES();
    unmount();
    expect(es.close).toHaveBeenCalled();
  });

  it('renders a session row when an SSE message arrives', async () => {
    render(<SessionsView memory="default" />);
    emit({
      sessionId: 'sess-1',
      session: { lastActivity: '2025-01-01T12:00:00.000Z', foo: 'bar' },
    });
    await waitFor(() => {
      expect(screen.getByText('sess-1')).toBeDefined();
    });
    expect(screen.queryByText(/waiting for data/i)).toBeNull();
  });

  it('ignores malformed SSE messages', () => {
    render(<SessionsView memory="default" />);
    act(() => {
      latestES().onmessage?.({ data: 'not-json' });
    });
    act(() => {
      latestES().onmessage?.({ data: JSON.stringify({ foo: 'bar' }) });
    });
    expect(screen.getByText(/waiting for data/i)).toBeDefined();
  });

  it('sorts sessions by lastActivity descending', async () => {
    render(<SessionsView memory="default" />);
    emit({
      sessionId: 'older',
      session: { lastActivity: '2025-01-01T10:00:00.000Z' },
    });
    emit({
      sessionId: 'newer',
      session: { lastActivity: '2025-01-02T10:00:00.000Z' },
    });
    await waitFor(() => {
      expect(screen.getByText('newer')).toBeDefined();
    });
    const olderEl = screen.getByText('older');
    const newerEl = screen.getByText('newer');
    // eslint-disable-next-line no-bitwise
    const newerFirst =
      newerEl.compareDocumentPosition(olderEl) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    expect(newerFirst).toBeTruthy();
  });

  it('expand/collapse toggles pretty-printed JSON', async () => {
    const user = userEvent.setup();
    render(<SessionsView memory="default" />);
    emit({
      sessionId: 'sess-1',
      session: { lastActivity: '2025-01-01T12:00:00.000Z', data: 'value' },
    });
    await waitFor(() => screen.getByText('sess-1'));

    const expandBtn = screen.getByRole('button', { name: /expand session/i });
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false');

    await user.click(expandBtn);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /collapse session/i }),
      ).toBeDefined();
    });
    expect(screen.getByText(/"data": "value"/)).toBeDefined();

    const collapseBtn = screen.getByRole('button', {
      name: /collapse session/i,
    });
    await user.click(collapseBtn);
    await waitFor(() => {
      expect(screen.queryByText(/"data": "value"/)).toBeNull();
    });
  });

  it('Purge button calls DELETE and clears the store', async () => {
    const user = userEvent.setup();
    render(<SessionsView memory="default" />);
    emit({
      sessionId: 'sess-1',
      session: { lastActivity: '2025-01-01T12:00:00.000Z' },
    });
    await waitFor(() => screen.getByText('sess-1'));

    await user.click(screen.getByRole('button', { name: /purge/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/broker/sessions?memory=default', {
        method: 'DELETE',
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/waiting for data/i)).toBeDefined();
    });
  });

  it('Purge swallows fetch errors', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    const user = userEvent.setup();
    render(<SessionsView memory="default" />);
    await user.click(screen.getByRole('button', { name: /purge/i }));
    expect(global.fetch).toHaveBeenCalled();
  });

  it('Auto-scroll toggle state changes', async () => {
    const user = userEvent.setup();
    render(<SessionsView memory="default" />);
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await user.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });
  });

  it('connection dot turns green on EventSource.onopen', async () => {
    const { container } = render(<SessionsView memory="default" />);
    const dot = container.querySelector('span.rounded-full');
    expect(dot?.className).toContain('bg-gray-300');
    act(() => {
      latestES().onopen?.();
    });
    await waitFor(() => {
      expect(
        container.querySelector('span.rounded-full')?.className,
      ).toContain('bg-green-500');
    });
  });

  it('handles sessions missing lastActivity in sort and row render', async () => {
    render(<SessionsView memory="default" />);
    emit({ sessionId: 'no-activity-a', session: { foo: 'a' } });
    emit({ sessionId: 'no-activity-b', session: { foo: 'b' } });
    emit({
      sessionId: 'with-activity',
      session: { lastActivity: '2025-01-02T10:00:00.000Z' },
    });
    await waitFor(() => {
      expect(screen.getByText('with-activity')).toBeDefined();
    });
    expect(screen.getByText('no-activity-a')).toBeDefined();
    expect(screen.getByText('no-activity-b')).toBeDefined();
  });

  it('connection dot turns gray on EventSource.onerror', async () => {
    const { container } = render(<SessionsView memory="default" />);
    act(() => {
      latestES().onopen?.();
    });
    await waitFor(() => {
      expect(
        container.querySelector('span.rounded-full')?.className,
      ).toContain('bg-green-500');
    });
    act(() => {
      latestES().onerror?.();
    });
    await waitFor(() => {
      expect(
        container.querySelector('span.rounded-full')?.className,
      ).toContain('bg-gray-300');
    });
  });
});
