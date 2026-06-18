import type { A2ATaskDetailResponse } from '@/lib/api/a2a-tasks-types';
import { apiClient } from '@/lib/api/client';
import { parseDurationToMs } from '@/lib/utils/time';

export type ApprovalDecision = 'approved' | 'rejected';

export interface ApprovalToolCall {
  id: string;
  type: string;
  function?: {
    name: string;
    arguments: string;
  };
}

export interface ApprovalDetails {
  taskId: string;
  toolCalls: ApprovalToolCall[];
  timeout?: string;
  onTimeout?: string;
  agentName?: string;
  phase: string;
  startTime?: string;
  expiresAtMs?: number;
  expired: boolean;
}

export interface ApprovalSubmissionResponse {
  name: string;
  namespace: string;
  taskId: string;
  decision: ApprovalDecision;
}

export function buildApprovalDetails(
  task: A2ATaskDetailResponse,
): ApprovalDetails | null {
  const protocolMetadata = task.status?.protocolMetadata;
  if (!protocolMetadata) return null;

  const toolCallsRaw = protocolMetadata.toolCalls ?? '[]';
  let toolCalls: ApprovalToolCall[] = [];
  try {
    const parsed: unknown = JSON.parse(toolCallsRaw);
    if (Array.isArray(parsed)) {
      toolCalls = parsed as ApprovalToolCall[];
    }
  } catch {
    toolCalls = [];
  }

  let agentName: string | undefined;
  const contextRaw = protocolMetadata.context;
  if (typeof contextRaw === 'string') {
    try {
      const ctx: unknown = JSON.parse(contextRaw);
      if (ctx && typeof ctx === 'object' && 'AgentName' in ctx) {
        const name = (ctx as { AgentName?: unknown }).AgentName;
        if (typeof name === 'string') agentName = name;
      }
      if (!agentName && ctx && typeof ctx === 'object' && 'agentName' in ctx) {
        const name = (ctx as { agentName?: unknown }).agentName;
        if (typeof name === 'string') agentName = name;
      }
    } catch {
      agentName = undefined;
    }
  }

  const startTime = task.status?.startTime;
  const timeoutMs = parseDurationToMs(protocolMetadata.timeout);
  let expiresAtMs: number | undefined;
  let expired = false;
  if (startTime && timeoutMs !== null) {
    const startMs = new Date(startTime).getTime();
    if (!Number.isNaN(startMs)) {
      expiresAtMs = startMs + timeoutMs;
      expired = Date.now() > expiresAtMs;
    }
  }

  return {
    taskId: task.taskId,
    toolCalls,
    timeout: protocolMetadata.timeout,
    onTimeout: protocolMetadata.onTimeout,
    agentName,
    phase: task.status?.phase ?? '',
    startTime,
    expiresAtMs,
    expired,
  };
}

export async function submitApproval(
  taskName: string,
  namespace: string,
  decision: ApprovalDecision,
): Promise<ApprovalSubmissionResponse> {
  return apiClient.post<ApprovalSubmissionResponse>(
    `/api/v1/a2a-tasks/${taskName}/approval`,
    { decision },
    { params: { namespace } },
  );
}
