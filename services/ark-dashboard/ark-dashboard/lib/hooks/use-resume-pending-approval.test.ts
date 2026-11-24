import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatService } from '@/lib/services';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';

import {
  type PendingApprovalQuery,
  useResumePendingApproval,
} from './use-resume-pending-approval';

vi.mock('@/lib/services', () => ({
  chatService: {
    getQuery: vi.fn(),
    getA2ATask: vi.fn(),
  },
}));

type QueryDetail = Awaited<ReturnType<typeof chatService.getQuery>>;
type A2ATask = Awaited<ReturnType<typeof chatService.getA2ATask>>;
type MessagesUpdater = (prev: ExtendedChatMessage[]) => ExtendedChatMessage[];

const TOOL_CALLS = [
  {
    id: 'call-1',
    type: 'function',
    function: { name: 'write-file', arguments: '{}' },
  },
];

function renderRestore(messages: ExtendedChatMessage[]) {
  const state = { messages };
  const pendingApprovalQueryRef: { current: PendingApprovalQuery | null } = {
    current: null,
  };
  const updateChatMessages = vi.fn((updater: MessagesUpdater) => {
    state.messages = updater(state.messages);
  });
  const { result } = renderHook(() =>
    useResumePendingApproval({
      namespace: 'test-namespace',
      getMessages: () => state.messages,
      updateChatMessages,
      pendingApprovalQueryRef,
    }),
  );
  return {
    restore: result.current,
    state,
    pendingApprovalQueryRef,
    updateChatMessages,
  };
}

describe('useResumePendingApproval', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns false when the query has no A2A task yet', async () => {
    vi.mocked(chatService.getQuery).mockResolvedValueOnce({
      status: { phase: 'input-required' },
    } as unknown as QueryDetail);
    const { restore, pendingApprovalQueryRef } = renderRestore([
      { role: 'user', content: 'hello' },
    ]);

    await expect(restore('q1')).resolves.toBe(false);
    expect(chatService.getQuery).toHaveBeenCalledWith('test-namespace', 'q1');
    expect(chatService.getA2ATask).not.toHaveBeenCalled();
    expect(pendingApprovalQueryRef.current).toBeNull();
  });

  it('returns false when the task carries no tool calls to approve', async () => {
    vi.mocked(chatService.getQuery).mockResolvedValueOnce({
      namespace: 'test-namespace',
      status: { response: { a2a: { taskId: 't1' } } },
    } as unknown as QueryDetail);
    vi.mocked(chatService.getA2ATask).mockResolvedValueOnce({
      status: {},
    } as unknown as A2ATask);
    const { restore, updateChatMessages, pendingApprovalQueryRef } =
      renderRestore([{ role: 'user', content: 'hello' }]);

    await expect(restore('q1')).resolves.toBe(false);
    expect(chatService.getA2ATask).toHaveBeenCalledWith(
      'test-namespace',
      'a2a-task-t1',
    );
    expect(updateChatMessages).not.toHaveBeenCalled();
    expect(pendingApprovalQueryRef.current).toBeNull();
  });

  it('appends the approval card and links it to the turn', async () => {
    vi.mocked(chatService.getQuery).mockResolvedValueOnce({
      status: { response: { a2a: { taskId: 't1' } } },
    } as unknown as QueryDetail);
    vi.mocked(chatService.getA2ATask).mockResolvedValueOnce({
      status: {
        protocolMetadata: { toolCalls: JSON.stringify(TOOL_CALLS) },
      },
    } as unknown as A2ATask);
    const { restore, state, pendingApprovalQueryRef } = renderRestore([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '' },
    ]);

    await expect(restore('q1')).resolves.toBe(true);

    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].approvalRequest).toMatchObject({
      taskId: 't1',
      queryNamespace: 'test-namespace',
    });
    expect(pendingApprovalQueryRef.current).toEqual({
      queryName: 'q1',
      messageIndex: 1,
    });
  });
});
