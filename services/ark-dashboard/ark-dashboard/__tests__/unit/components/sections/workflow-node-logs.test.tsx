import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowNodeLogs } from '@/components/sections/workflow-node-logs';
import { fetchNodeLogWindow } from '@/lib/services/workflow-logs';
import { resetNodeLogStore } from '@/lib/services/workflow-logs-store';

vi.mock('@/lib/services/workflow-logs', () => ({
  fetchNodeLogWindow: vi.fn(),
}));

const target = {
  namespace: 'test-namespace',
  workflowName: 'wf-1',
  nodeId: 'node-1',
};

function windowOf(content: string, hasMoreBefore = false) {
  return {
    content,
    line_count: content ? content.split('\n').length : 0,
    byte_count: content.length,
    has_more_before: hasMoreBefore,
    truncated: false,
    first_timestamp: null,
    last_timestamp: 't1',
  };
}

function stubScrollMetrics(
  element: HTMLElement,
  scrollHeight: number,
  clientHeight: number,
) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
}

async function renderLogs(isRunning = false) {
  const result = render(
    <WorkflowNodeLogs
      target={target}
      isRunning={isRunning}
      argoUrl="http://argo.test"
    />,
  );
  await act(async () => {});
  return result;
}

describe('WorkflowNodeLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNodeLogStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the tail page', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('hello\nworld'));

    await renderLogs();

    expect(screen.getByText(/hello/)).toBeInTheDocument();
    expect(screen.getByText('Start of log')).toBeInTheDocument();
  });

  it('loads older logs when the load button is used', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('newer', true))
      .mockResolvedValueOnce(windowOf('older', false));

    await renderLogs();
    await act(async () => {
      screen.getByRole('button', { name: 'Load older logs' }).click();
    });

    expect(vi.mocked(fetchNodeLogWindow).mock.calls[1][1]).toMatchObject({
      skipTailLines: 1,
    });
    expect(screen.getByText('older')).toBeInTheDocument();
  });

  it('loads older logs when the viewer is scrolled to the top', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('newer', true))
      .mockResolvedValueOnce(windowOf('older', false));

    await renderLogs();
    const container = screen.getByTestId('workflow-node-logs-scroll');

    await act(async () => {
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
  });

  it('polls for new lines while the node is running', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    await renderLogs(true);
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(vi.mocked(fetchNodeLogWindow).mock.calls.length).toBeGreaterThan(1);
  });

  it('does not poll on an interval once the node is terminal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    await renderLogs(false);
    const callsAfterMount = vi.mocked(fetchNodeLogWindow).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(vi.mocked(fetchNodeLogWindow).mock.calls.length).toBe(
      callsAfterMount,
    );
  });

  it('reuses the buffer after a collapse and re-expand', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('kept'));

    const { unmount } = await renderLogs();
    unmount();
    await renderLogs();

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);
    expect(screen.getByText('kept')).toBeInTheDocument();
  });

  it('scrolls to the bottom on the first paint', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    const { rerender } = render(
      <WorkflowNodeLogs
        target={target}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );
    const container = screen.getByTestId('workflow-node-logs-scroll');
    stubScrollMetrics(container, 1000, 100);

    await act(async () => {});
    rerender(
      <WorkflowNodeLogs
        target={target}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );

    expect(container.scrollTop).toBe(1000);
  });

  it('follows appended lines while the viewer is at the bottom', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('a'))
      .mockResolvedValue(windowOf('b'));

    await renderLogs(true);
    const container = screen.getByTestId('workflow-node-logs-scroll');
    stubScrollMetrics(container, 500, 100);
    container.scrollTop = 400;
    await act(async () => {
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    stubScrollMetrics(container, 900, 100);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(container.scrollTop).toBe(900);
  });

  it('leaves the scroll position alone once the user scrolls up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('a'))
      .mockResolvedValue(windowOf('b'));

    await renderLogs(true);
    const container = screen.getByTestId('workflow-node-logs-scroll');
    stubScrollMetrics(container, 5000, 100);
    container.scrollTop = 2000;
    await act(async () => {
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(container.scrollTop).toBe(2000);
  });

  it('offers the Argo UI link when the logs cannot be loaded', async () => {
    vi.mocked(fetchNodeLogWindow).mockRejectedValue(new Error('404'));

    await renderLogs();

    expect(
      screen.getByRole('link', { name: /View logs in Argo UI/ }),
    ).toHaveAttribute('href', 'http://argo.test');
  });
});
