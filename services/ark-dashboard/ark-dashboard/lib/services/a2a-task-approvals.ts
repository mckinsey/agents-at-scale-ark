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

function parseToolCalls(raw: string): ApprovalToolCall[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ApprovalToolCall[]) : [];
  } catch {
    return [];
  }
}

function readStringField(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === 'object' && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function extractAgentName(contextRaw: unknown): string | undefined {
  if (typeof contextRaw !== 'string') return undefined;
  try {
    const ctx: unknown = JSON.parse(contextRaw);
    return (
      readStringField(ctx, 'AgentName') ?? readStringField(ctx, 'agentName')
    );
  } catch {
    return undefined;
  }
}

function computeExpiry(
  startTime: string | undefined,
  timeoutMs: number | null,
): { expiresAtMs?: number; expired: boolean } {
  if (!startTime || timeoutMs === null) return { expired: false };
  const startMs = new Date(startTime).getTime();
  if (Number.isNaN(startMs)) return { expired: false };
  const expiresAtMs = startMs + timeoutMs;
  return { expiresAtMs, expired: Date.now() > expiresAtMs };
}

export function buildApprovalDetails(
  task: A2ATaskDetailResponse,
): ApprovalDetails | null {
  const protocolMetadata = task.status?.protocolMetadata;
  if (!protocolMetadata) return null;

  const startTime = task.status?.startTime;
  const { expiresAtMs, expired } = computeExpiry(
    startTime,
    parseDurationToMs(protocolMetadata.timeout),
  );

  return {
    taskId: task.taskId,
    toolCalls: parseToolCalls(protocolMetadata.toolCalls ?? '[]'),
    timeout: protocolMetadata.timeout,
    onTimeout: protocolMetadata.onTimeout,
    agentName: extractAgentName(protocolMetadata.context),
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
