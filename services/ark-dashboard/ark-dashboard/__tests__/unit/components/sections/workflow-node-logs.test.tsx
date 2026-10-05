import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowNodeLogs } from '@/components/sections/workflow-node-logs';
import { APIError } from '@/lib/api/client';
import { fetchNodeLogWindow } from '@/lib/services/workflow-logs';
import {
  getNodeLogBuffer,
  getNodeLogScrollState,
  logBufferKey,
  resetNodeLogStore,
} from '@/lib/services/workflow-logs-store';

vi.mock('@/lib/services/workflow-logs', () => ({
  fetchNodeLogWindow: vi.fn(),
}));

const target = {
  namespace: 'test-namespace',
  workflowName: 'wf-1',
  nodeId: 'node-1',
};

const otherTarget = { ...target, nodeId: 'node-2' };

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

const originalScrollIntoView = Element.prototype.scrollIntoView;

describe('WorkflowNodeLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNodeLogStore();
    Element.prototype.scrollIntoView = function scrollIntoViewStub(
      this: Element,
    ) {
      const container = this.closest<HTMLElement>(
        '[data-testid="workflow-node-logs-scroll"]',
      );
      if (container) container.scrollTop = container.scrollHeight;
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('renders the tail page', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('hello\nworld'));

    await renderLogs();

    expect(screen.getByText(/hello/)).toBeInTheDocument();
    expect(screen.getByText('Start of log')).toBeInTheDocument();
  });

  it('loads older logs without waiting for a scroll when the page is not scrollable', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('newer', true))
      .mockResolvedValueOnce(windowOf('older', false));

    await renderLogs();

    expect(vi.mocked(fetchNodeLogWindow).mock.calls[1][1]).toMatchObject({
      skipTailLines: 1,
    });
    expect(screen.getByText(/older/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /older logs/ }),
    ).not.toBeInTheDocument();
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

  it('keeps the viewport anchored on the same content when an older page prepends', async () => {
    let resolveOlder: (window: ReturnType<typeof windowOf>) => void = () => {};
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('newer', true))
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOlder = resolve;
          }),
      );

    render(
      <WorkflowNodeLogs
        target={target}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );
    const container = screen.getByTestId('workflow-node-logs-scroll');
    stubScrollMetrics(container, 1000, 100);
    await act(async () => {});

    container.scrollTop = 150;
    await act(async () => {
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);

    stubScrollMetrics(container, 1600, 100);
    await act(async () => {
      resolveOlder(windowOf('older', false));
    });

    expect(container.scrollTop).toBe(1600 - (1000 - 150));
    expect(getNodeLogBuffer(logBufferKey(target)).lines).toEqual([
      'older',
      'newer',
    ]);
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

  it('fetches the tail once more when the node finishes and then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    const { rerender } = await renderLogs(true);
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);

    rerender(
      <WorkflowNodeLogs
        target={target}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );
    await act(async () => {});

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchNodeLogWindow).mock.calls[1][1]).toMatchObject({
      sinceTimestamp: 't1',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
  });

  it('starts polling when the node begins running after mount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    const { rerender } = await renderLogs(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);

    rerender(
      <WorkflowNodeLogs
        target={target}
        isRunning={true}
        argoUrl="http://argo.test"
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(vi.mocked(fetchNodeLogWindow).mock.calls.length).toBeGreaterThan(1);
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

  it('restores the scroll position after a collapse and re-expand', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a\nb\nc'));

    const { unmount } = await renderLogs();
    const container = screen.getByTestId('workflow-node-logs-scroll');
    stubScrollMetrics(container, 5000, 100);
    container.scrollTop = 1800;
    await act(async () => {
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    unmount();

    await renderLogs();

    expect(screen.getByTestId('workflow-node-logs-scroll').scrollTop).toBe(
      1800,
    );
  });

  it('fetches and scrolls to the bottom of a node that has never been viewed when the target changes', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('alpha'))
      .mockResolvedValueOnce(windowOf('beta'));

    const { rerender } = await renderLogs();
    const container = screen.getByTestId('workflow-node-logs-scroll');
    stubScrollMetrics(container, 5000, 100);
    container.scrollTop = 2000;
    await act(async () => {
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    stubScrollMetrics(container, 3000, 100);
    rerender(
      <WorkflowNodeLogs
        target={otherTarget}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );
    await act(async () => {});

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchNodeLogWindow).mock.calls[1][0].nodeId).toBe(
      'node-2',
    );
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    expect(container.scrollTop).toBe(3000);
  });

  it('restores the remembered scroll position without refetching when switching back to a node', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('alpha'))
      .mockResolvedValueOnce(windowOf('beta'));

    const { rerender } = await renderLogs();
    const container = screen.getByTestId('workflow-node-logs-scroll');
    stubScrollMetrics(container, 5000, 100);
    container.scrollTop = 2000;
    await act(async () => {
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    stubScrollMetrics(container, 3000, 100);
    rerender(
      <WorkflowNodeLogs
        target={otherTarget}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );
    await act(async () => {});
    expect(container.scrollTop).toBe(3000);

    stubScrollMetrics(container, 5000, 100);
    rerender(
      <WorkflowNodeLogs
        target={target}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );
    await act(async () => {});

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
    expect(container.scrollTop).toBe(2000);
  });

  it('lands at the bottom when switching to a node remembered as stuck to the bottom', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('alpha'))
      .mockResolvedValueOnce(windowOf('beta'));

    const { rerender } = await renderLogs();
    const container = screen.getByTestId('workflow-node-logs-scroll');
    stubScrollMetrics(container, 5000, 100);
    container.scrollTop = 2000;
    await act(async () => {
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    stubScrollMetrics(container, 3000, 100);
    rerender(
      <WorkflowNodeLogs
        target={otherTarget}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );
    await act(async () => {});
    expect(getNodeLogScrollState(logBufferKey(otherTarget))).toEqual({
      scrollTop: 3000,
      stickToBottom: true,
    });

    stubScrollMetrics(container, 5000, 100);
    rerender(
      <WorkflowNodeLogs
        target={target}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );
    await act(async () => {});
    expect(container.scrollTop).toBe(2000);

    stubScrollMetrics(container, 3500, 100);
    rerender(
      <WorkflowNodeLogs
        target={otherTarget}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );
    await act(async () => {});

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(container.scrollTop).toBe(3500);
  });

  it('offers the Argo UI link when the logs cannot be loaded', async () => {
    vi.mocked(fetchNodeLogWindow).mockRejectedValue(new Error('404'));

    await renderLogs();

    expect(
      screen.getByRole('link', { name: /View logs in Argo UI/ }),
    ).toHaveAttribute('href', 'http://argo.test');
  });

  it('recovers on retry after a failed initial load without a remount', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(windowOf('recovered'));

    await renderLogs();
    expect(screen.getByText('Failed to load logs')).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: 'Retry' });
    await act(async () => {
      retry.click();
    });

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(screen.getByText('recovered')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load logs')).not.toBeInTheDocument();
  });

  it('retries a failed initial load on an interval while the node is running', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchNodeLogWindow)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(windowOf('recovered'));

    await renderLogs(true);
    expect(screen.getByText('Failed to load logs')).toBeInTheDocument();
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(vi.mocked(fetchNodeLogWindow).mock.calls.length).toBeGreaterThan(1);
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('does not auto-retry a permanent error on a running node', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchNodeLogWindow).mockRejectedValue(
      new APIError('container main is not valid for pod', 400),
    );

    await renderLogs(true);
    expect(screen.getByText('Failed to load logs')).toBeInTheDocument();
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9300);
    });

    // A 400 can never succeed by repeating, so the interval must not fire it.
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Failed to load logs')).toBeInTheDocument();
  });

  it('does not let a poll append while an older page is still loading', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('newer', true))
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue(windowOf('polled'));

    render(
      <WorkflowNodeLogs
        target={target}
        isRunning={true}
        argoUrl="http://argo.test"
      />,
    );
    const container = screen.getByTestId('workflow-node-logs-scroll');
    stubScrollMetrics(container, 1000, 100);
    await act(async () => {});

    container.scrollTop = 150;
    await act(async () => {
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);

    stubScrollMetrics(container, 1600, 100);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(getNodeLogBuffer(logBufferKey(target)).lines).toEqual(['newer']);
  });

  it('shows a poll failure beneath the logs without hiding them', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('hello'))
      .mockRejectedValue(new Error('HTTP 500'));

    await renderLogs(true);
    expect(screen.getByText('hello')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Failed to load logs')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /View logs in Argo UI/ }),
    ).not.toBeInTheDocument();
  });

  it('shows an older page failure beneath the logs without hiding them', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('newer', true))
      .mockRejectedValueOnce(new Error('HTTP 500'));

    render(
      <WorkflowNodeLogs
        target={target}
        isRunning={false}
        argoUrl="http://argo.test"
      />,
    );
    const container = screen.getByTestId('workflow-node-logs-scroll');
    stubScrollMetrics(container, 1000, 100);
    await act(async () => {});
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);

    container.scrollTop = 150;
    await act(async () => {
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Failed to load logs')).toBeInTheDocument();
    expect(screen.getByText('newer')).toBeInTheDocument();
    expect(screen.queryByText('Loading older logs...')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /View logs in Argo UI/ }),
    ).not.toBeInTheDocument();
  });
});
