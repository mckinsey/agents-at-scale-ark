import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';
import {
  WORKFLOW_LOG_MAX_BYTES,
  WORKFLOW_LOG_PAGE_LINES,
} from '@/lib/constants/workflow-logs';

export type LogWindow = components['schemas']['LogWindow'];

export interface LogWindowParams {
  container?: string;
  maxLines?: number;
  maxBytes?: number;
  skipTailLines?: number;
  sinceTimestamp?: string;
  beforeTimestamp?: string;
}

export interface LogWindowTarget {
  namespace: string;
  workflowName: string;
  nodeId: string;
  podName?: string;
  container?: string;
}

function buildParams(
  params: LogWindowParams,
): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {
    max_lines: params.maxLines ?? WORKFLOW_LOG_PAGE_LINES,
    max_bytes: params.maxBytes ?? WORKFLOW_LOG_MAX_BYTES,
  };

  if (params.skipTailLines) {
    query.skip_tail_lines = params.skipTailLines;
  }
  if (params.sinceTimestamp) {
    query.since_timestamp = params.sinceTimestamp;
  }
  if (params.beforeTimestamp) {
    query.before_timestamp = params.beforeTimestamp;
  }
  if (params.container) {
    query.container = params.container;
  }

  return query;
}

export const workflowLogsService = {
  async getPodLogWindow(
    namespace: string,
    podName: string,
    params: LogWindowParams = {},
  ): Promise<LogWindow> {
    return apiClient.get<LogWindow>(
      `/api/v1/resources/api/v1/namespaces/${namespace}/pods/${podName}/log/window`,
      { params: buildParams(params) },
    );
  },

  async getWorkflowNodeLogWindow(
    namespace: string,
    workflowName: string,
    nodeId: string,
    params: LogWindowParams = {},
  ): Promise<LogWindow> {
    return apiClient.get<LogWindow>(
      `/api/v1/resources/apis/argoproj.io/v1alpha1/namespaces/${namespace}/workflows/${workflowName}/${nodeId}/log/window`,
      { params: buildParams(params) },
    );
  },
};

export async function fetchNodeLogWindow(
  target: LogWindowTarget,
  params: LogWindowParams = {},
): Promise<LogWindow> {
  const withContainer = {
    ...params,
    container: params.container ?? target.container,
  };

  if (target.podName) {
    try {
      return await workflowLogsService.getPodLogWindow(
        target.namespace,
        target.podName,
        withContainer,
      );
    } catch {
      console.debug('Pod log window not available, trying workflow node logs');
    }
  }

  return workflowLogsService.getWorkflowNodeLogWindow(
    target.namespace,
    target.workflowName,
    target.nodeId,
    withContainer,
  );
}
