import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { A2ATaskDetailResponse } from '@/lib/api/a2a-tasks-types';
import { apiClient } from '@/lib/api/client';

import { buildApprovalDetails, submitApproval } from './a2a-task-approvals';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

describe('submitApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts the decision to the a2a-task approval endpoint with namespace', async () => {
    const mockResponse = {
      name: 'a2a-task-abc',
      namespace: 'default',
      taskId: 'abc',
      decision: 'approved' as const,
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

    const result = await submitApproval('a2a-task-abc', 'default', 'approved');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/a2a-tasks/a2a-task-abc/approval',
      { decision: 'approved' },
      { params: { namespace: 'default' } },
    );
    expect(result).toEqual(mockResponse);
  });

  it('passes rejected decision through', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      name: 'a2a-task-xyz',
      namespace: 'ns',
      taskId: 'xyz',
      decision: 'rejected' as const,
    });

    await submitApproval('a2a-task-xyz', 'ns', 'rejected');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/a2a-tasks/a2a-task-xyz/approval',
      { decision: 'rejected' },
      { params: { namespace: 'ns' } },
    );
  });
});

describe('buildApprovalDetails', () => {
  const baseTask = (
    overrides: Partial<A2ATaskDetailResponse> = {},
  ): A2ATaskDetailResponse => ({
    name: 'a2a-task-abc',
    namespace: 'default',
    taskId: 'abc',
    agentRef: { name: 'agent-1' },
    queryRef: { name: 'query-1' },
    ...overrides,
  });

  it('returns null when protocolMetadata is missing', () => {
    expect(buildApprovalDetails(baseTask())).toBeNull();
    expect(
      buildApprovalDetails(baseTask({ status: { phase: 'input-required' } })),
    ).toBeNull();
  });

  it('parses tool calls, timeout, and agent name from protocolMetadata', () => {
    const task = baseTask({
      taskId: 'task-123',
      status: {
        phase: 'input-required',
        protocolMetadata: {
          toolCalls: JSON.stringify([
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'do-thing', arguments: '{"x":1}' },
            },
          ]),
          timeout: '5m',
          onTimeout: 'reject',
          context: JSON.stringify({
            ConversationID: 'c',
            AgentName: 'deploy-agent',
            AgentNamespace: 'default',
          }),
        },
      },
    });

    const details = buildApprovalDetails(task);
    expect(details).not.toBeNull();
    expect(details!.taskId).toBe('task-123');
    expect(details!.toolCalls).toHaveLength(1);
    expect(details!.toolCalls[0].id).toBe('call-1');
    expect(details!.toolCalls[0].function?.name).toBe('do-thing');
    expect(details!.timeout).toBe('5m');
    expect(details!.onTimeout).toBe('reject');
    expect(details!.agentName).toBe('deploy-agent');
    expect(details!.phase).toBe('input-required');
  });

  it('falls back to lowercase agentName when capitalised key is absent', () => {
    const task = baseTask({
      status: {
        protocolMetadata: {
          toolCalls: '[]',
          context: JSON.stringify({ agentName: 'legacy-agent' }),
        },
      },
    });

    expect(buildApprovalDetails(task)?.agentName).toBe('legacy-agent');
  });

  it('tolerates unparseable tool calls and context gracefully', () => {
    const task = baseTask({
      status: {
        protocolMetadata: {
          toolCalls: 'not-json',
          context: 'also-not-json',
        },
      },
    });

    const details = buildApprovalDetails(task);
    expect(details).not.toBeNull();
    expect(details!.toolCalls).toEqual([]);
    expect(details!.agentName).toBeUndefined();
  });

  describe('expired flag', () => {
    const taskWithTiming = (
      startTime: string | undefined,
      timeout: string | undefined,
    ): A2ATaskDetailResponse =>
      baseTask({
        status: {
          startTime,
          protocolMetadata: {
            toolCalls: '[]',
            ...(timeout ? { timeout } : {}),
          },
        },
      });

    it('marks not-expired when start + timeout is in the future', () => {
      const fiveMinutesFromNow = new Date(Date.now() - 60_000).toISOString();
      const details = buildApprovalDetails(taskWithTiming(fiveMinutesFromNow, '5m'));
      expect(details!.expired).toBe(false);
      expect(details!.expiresAtMs).toBeDefined();
      expect(details!.expiresAtMs!).toBeGreaterThan(Date.now());
    });

    it('marks expired when start + timeout has elapsed', () => {
      const longAgo = new Date(Date.now() - 10 * 60_000).toISOString();
      const details = buildApprovalDetails(taskWithTiming(longAgo, '5m'));
      expect(details!.expired).toBe(true);
      expect(details!.expiresAtMs).toBeDefined();
      expect(details!.expiresAtMs!).toBeLessThan(Date.now());
    });

    it('defaults expired to false when startTime is missing', () => {
      const details = buildApprovalDetails(taskWithTiming(undefined, '5m'));
      expect(details!.expired).toBe(false);
      expect(details!.expiresAtMs).toBeUndefined();
    });

    it('defaults expired to false when timeout is missing', () => {
      const now = new Date().toISOString();
      const details = buildApprovalDetails(taskWithTiming(now, undefined));
      expect(details!.expired).toBe(false);
      expect(details!.expiresAtMs).toBeUndefined();
    });

    it('defaults expired to false when timeout is unparseable', () => {
      const now = new Date().toISOString();
      const details = buildApprovalDetails(taskWithTiming(now, 'gibberish'));
      expect(details!.expired).toBe(false);
      expect(details!.expiresAtMs).toBeUndefined();
    });
  });
});
