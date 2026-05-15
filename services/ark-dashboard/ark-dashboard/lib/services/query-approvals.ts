/**
 * Query approval service - handles tool call approvals for HITL workflows
 */

import { apiClient } from '@/lib/api/client';

interface ToolCall {
  id: string;
  type: string;
  function?: {
    name: string;
    arguments: string;
  };
}

export interface ApprovalDetails {
  taskId: string;
  toolCalls: ToolCall[];
  timeout?: string;
  onTimeout?: string;
  agentName?: string;
  phase: string;
}

interface ApprovalActionRequest {
  action: 'approved' | 'rejected';
  toolCallId?: string;
  toolCallIds?: string[];
}

interface ApprovalResponse {
  status: string;
  queryName: string;
  queryNamespace: string;
  action: 'approved' | 'rejected';
  taskId?: string;
}

/**
 * Get pending approval details for a query
 */
export async function getApprovalDetails(
  queryName: string,
  namespace: string
): Promise<ApprovalDetails> {
  return apiClient.get<ApprovalDetails>(
    `/api/v1/queries/${queryName}/approval`,
    { params: { namespace } }
  );
}

/**
 * Submit approval or rejection for a query's tool calls
 */
export async function submitApproval(
  queryName: string,
  namespace: string,
  action: 'approved' | 'rejected'
): Promise<ApprovalResponse> {
  const request: ApprovalActionRequest = { action };

  return apiClient.post<ApprovalResponse>(
    `/api/v1/queries/${queryName}/approval?namespace=${namespace}`,
    request
  );
}
