import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import {
  fetchNodeLogWindow,
  workflowLogsService,
} from '@/lib/services/workflow-logs';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const window = {
  content: 'line',
  line_count: 1,
  has_more_before: false,
  truncated: false,
  byte_count: 4,
};

describe('workflowLogsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests a pod log window with the namespace in the path and paging params', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(window);

    await workflowLogsService.getPodLogWindow('test-namespace', 'pod-1', {
      maxLines: 500,
      maxBytes: 2048,
      skipTailLines: 500,
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/resources/api/v1/namespaces/test-namespace/pods/pod-1/log/window',
      { params: { max_lines: 500, max_bytes: 2048, skip_tail_lines: 500 } },
    );
  });

  it('requests a workflow node log window with the since cursor', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(window);

    await workflowLogsService.getWorkflowNodeLogWindow(
      'test-namespace',
      'wf-1',
      'node-1',
      { maxLines: 10, maxBytes: 100, sinceTimestamp: '2024-01-01T00:00:00Z' },
    );

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/resources/apis/argoproj.io/v1alpha1/namespaces/test-namespace/workflows/wf-1/node-1/log/window',
      {
        params: {
          max_lines: 10,
          max_bytes: 100,
          since_timestamp: '2024-01-01T00:00:00Z',
        },
      },
    );
  });

  it('omits paging params that are not set', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(window);

    await workflowLogsService.getPodLogWindow('test-namespace', 'pod-1');

    const [, options] = vi.mocked(apiClient.get).mock.calls[0];
    expect(options?.params).not.toHaveProperty('skip_tail_lines');
    expect(options?.params).not.toHaveProperty('since_timestamp');
  });
});

describe('fetchNodeLogWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers the pod endpoint when a pod name is known', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(window);

    await fetchNodeLogWindow({
      namespace: 'test-namespace',
      workflowName: 'wf-1',
      nodeId: 'node-1',
      podName: 'pod-1',
    });

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiClient.get).mock.calls[0][0]).toContain('/pods/pod-1/');
  });

  it('falls back to the workflow node endpoint when the pod lookup fails', async () => {
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce(window);

    await fetchNodeLogWindow({
      namespace: 'test-namespace',
      workflowName: 'wf-1',
      nodeId: 'node-1',
      podName: 'pod-1',
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiClient.get).mock.calls[1][0]).toContain(
      '/workflows/wf-1/node-1/log/window',
    );
  });

  it('goes straight to the workflow node endpoint without a pod name', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(window);

    await fetchNodeLogWindow({
      namespace: 'test-namespace',
      workflowName: 'wf-1',
      nodeId: 'node-1',
    });

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiClient.get).mock.calls[0][0]).toContain(
      '/workflows/wf-1/node-1/log/window',
    );
  });
});
