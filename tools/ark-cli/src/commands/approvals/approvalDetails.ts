import type {A2ATaskDetail} from '../../lib/arkApiClient.js';
import {parseDuration} from '../../lib/duration.js';

export interface ApprovalToolCall {
  id: string;
  type: string;
  function?: {
    name: string;
    arguments: string;
  };
}

export interface ApprovalDetails {
  name: string;
  taskId: string;
  agentName?: string;
  toolCalls: ApprovalToolCall[];
  timeout?: string;
  onTimeout?: string;
  phase: string;
  expiresAt?: Date;
  expired: boolean;
}

function parseToolCalls(raw: string | undefined): ApprovalToolCall[] {
  if (!raw) return [];
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

function extractAgentName(contextRaw: string | undefined): string | undefined {
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
  timeout: string | undefined
): {expiresAt?: Date; expired: boolean} {
  if (!startTime || !timeout) return {expired: false};
  let timeoutMs: number;
  try {
    timeoutMs = parseDuration(timeout);
  } catch {
    return {expired: false};
  }
  const startMs = new Date(startTime).getTime();
  if (Number.isNaN(startMs)) return {expired: false};
  const expiresAtMs = startMs + timeoutMs;
  return {expiresAt: new Date(expiresAtMs), expired: Date.now() > expiresAtMs};
}

/**
 * Build displayable approval details from an A2ATask detail response, mirroring
 * the dashboard's parsing of `status.protocolMetadata`. Returns null when the
 * task carries no approval metadata.
 */
export function buildApprovalDetails(
  task: A2ATaskDetail
): ApprovalDetails | null {
  const protocolMetadata = task.status?.protocolMetadata;
  if (!protocolMetadata) return null;

  const {expiresAt, expired} = computeExpiry(
    task.status?.startTime ?? undefined,
    protocolMetadata.timeout
  );

  return {
    name: task.name,
    taskId: task.taskId,
    agentName: extractAgentName(protocolMetadata.context) ?? task.agentRef?.name,
    toolCalls: parseToolCalls(protocolMetadata.toolCalls),
    timeout: protocolMetadata.timeout,
    onTimeout: protocolMetadata.onTimeout,
    phase: task.status?.phase ?? '',
    expiresAt,
    expired,
  };
}
