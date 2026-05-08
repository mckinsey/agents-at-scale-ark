import { apiClient } from '@/lib/api/client';

export type ToolCallInfo = {
  id: string;
  name: string;
  type: string;
  arguments: string;
  description?: string;
  agentReasoning?: string;
};

export type QueryReference = {
  name: string;
  namespace: string;
};

export type ApprovalDecision = {
  action: 'approved' | 'rejected';
  respondedBy: string;
  respondedAt: string;
  reason?: string;
};

export type ToolApprovalStatus = {
  phase: 'pending' | 'approved' | 'rejected' | 'expired';
  decision?: ApprovalDecision;
  requestedAt?: string;
};

export type ToolApproval = {
  name: string;
  namespace: string;
  queryRef: QueryReference;
  toolCalls: ToolCallInfo[];
  phase?: string;
  creationTimestamp?: string;
};

export type ToolApprovalDetail = ToolApproval & {
  timeout?: string;
  onTimeout?: string;
  reasonRequired?: boolean;
  status?: ToolApprovalStatus;
};

export type ToolApprovalListResponse = {
  items: ToolApproval[];
  count: number;
};

export type ApprovalDecisionRequest = {
  action: 'approved' | 'rejected';
  reason?: string;
};

export type ApprovalDecisionResponse = {
  name: string;
  namespace: string;
  phase: string;
  decision: ApprovalDecision;
};

export const toolApprovalsService = {
  async list(namespace?: string): Promise<ToolApprovalListResponse> {
    const params = namespace ? `?namespace=${namespace}` : '';
    return apiClient.get<ToolApprovalListResponse>(
      `/api/v1/tool-approvals${params}`,
    );
  },

  async listPending(namespace?: string): Promise<ToolApprovalListResponse> {
    const params = namespace ? `?namespace=${namespace}` : '';
    return apiClient.get<ToolApprovalListResponse>(
      `/api/v1/tool-approvals/pending${params}`,
    );
  },

  async get(name: string, namespace?: string): Promise<ToolApprovalDetail> {
    const params = namespace ? `?namespace=${namespace}` : '';
    return apiClient.get<ToolApprovalDetail>(
      `/api/v1/tool-approvals/${name}${params}`,
    );
  },

  async submitDecision(
    name: string,
    decision: ApprovalDecisionRequest,
    namespace?: string,
  ): Promise<ApprovalDecisionResponse> {
    const params = namespace ? `?namespace=${namespace}` : '';
    return apiClient.post<ApprovalDecisionResponse>(
      `/api/v1/tool-approvals/${name}/decision${params}`,
      decision,
    );
  },

  async approve(
    name: string,
    reason?: string,
    namespace?: string,
  ): Promise<ApprovalDecisionResponse> {
    return this.submitDecision(name, { action: 'approved', reason }, namespace);
  },

  async reject(
    name: string,
    reason?: string,
    namespace?: string,
  ): Promise<ApprovalDecisionResponse> {
    return this.submitDecision(name, { action: 'rejected', reason }, namespace);
  },

  async delete(name: string, namespace?: string): Promise<void> {
    const params = namespace ? `?namespace=${namespace}` : '';
    await apiClient.delete(`/api/v1/tool-approvals/${name}${params}`);
  },
};
