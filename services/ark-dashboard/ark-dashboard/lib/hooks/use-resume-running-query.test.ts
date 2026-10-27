import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatService } from '@/lib/services';
import type { ChatResponse } from '@/lib/services/chat';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';

import { useResumeRunningQuery } from './use-resume-running-query';

vi.mock('@/lib/services', () => ({
  chatService: {
    getQueryResult: vi.fn(),
  },
}));

type MessagesUpdater = (prev: ExtendedChatMessage[]) => ExtendedChatMessage[];

function createParams(
  messages: ExtendedChatMessage[],
  overrides: Partial<Parameters<typeof useResumeRunningQuery>[0]> = {},
) {
  const state = { messages };
  const params = {
    namespace: 'test-namespace',
    chatKey: 'agent-test-agent',
    activeQueryName: 'q1',
    isProcessing: false,
    setIsProcessing: vi.fn(),
    setProcessingPhase: vi.fn(),
    updateChatMessages: vi.fn((updater: MessagesUpdater) => {
      state.messages = updater(state.messages);
    }),
    clearActiveQuery: vi.fn(),
    onResume: vi.fn(),
    restorePendingApproval: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
  return { params, state };
}

describe('useResumeRunningQuery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does nothing until the namespace is resolved', async () => {
    const { params } = createParams([{ role: 'user', content: 'hello' }], {
      namespace: '',
    });

    renderHook(() => useResumeRunningQuery(params));

    await Promise.resolve();
    expect(chatService.getQueryResult).not.toHaveBeenCalled();
    expect(params.onResume).not.toHaveBeenCalled();
  });

  it('does nothing while a turn is already in flight', async () => {
    const { params } = createParams([{ role: 'user', content: 'hello' }], {
      isProcessing: true,
    });

    renderHook(() => useResumeRunningQuery(params));

    await Promise.resolve();
    expect(chatService.getQueryResult).not.toHaveBeenCalled();
  });

  it('shows the plain response of a done query without raw messages', async () => {
    const { params, state } = createParams([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'partial' },
    ]);
    vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
      status: 'done',
      terminal: true,
      response: 'final answer',
    });

    renderHook(() => useResumeRunningQuery(params));

    await waitFor(() => {
      expect(params.clearActiveQuery).toHaveBeenCalled();
    });
    expect(chatService.getQueryResult).toHaveBeenCalledWith(
      'test-namespace',
      'q1',
    );
    expect(state.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'final answer' },
    ]);
    expect(params.setIsProcessing).toHaveBeenLastCalledWith(false);
  });

  it('keeps the partial turn of a done query that returned nothing', async () => {
    const { params, state } = createParams([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'partial' },
    ]);
    vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
      status: 'done',
      terminal: true,
    });

    renderHook(() => useResumeRunningQuery(params));

    await waitFor(() => {
      expect(params.clearActiveQuery).toHaveBeenCalled();
    });
    expect(state.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'partial' },
    ]);
  });

  it('falls back to a generic message for an error without a response', async () => {
    const { params, state } = createParams([
      { role: 'user', content: 'hello' },
    ]);
    vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
      status: 'unknown',
      terminal: true,
    });

    renderHook(() => useResumeRunningQuery(params));

    await waitFor(() => {
      expect(params.clearActiveQuery).toHaveBeenCalled();
    });
    expect(state.messages).toEqual([
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: 'Query failed',
        metadata: { status: 'failed', queryName: 'q1' },
      },
    ]);
  });

  it('keeps the partial turn of a canceled query', async () => {
    const { params, state } = createParams([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'partial' },
      { role: 'assistant', content: '' },
    ]);
    vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
      status: 'canceled',
      terminal: true,
    });

    renderHook(() => useResumeRunningQuery(params));

    await waitFor(() => {
      expect(params.clearActiveQuery).toHaveBeenCalled();
    });
    expect(state.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'partial' },
    ]);
  });

  it('keeps polling when restoring the approval fails', async () => {
    const { params, state } = createParams(
      [{ role: 'user', content: 'hello' }],
      {
        restorePendingApproval: vi
          .fn()
          .mockRejectedValueOnce(new Error('task not found')),
      },
    );
    vi.mocked(chatService.getQueryResult)
      .mockResolvedValueOnce({ status: 'input-required', terminal: false })
      .mockResolvedValueOnce({
        status: 'done',
        terminal: true,
        response: 'final answer',
      });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    renderHook(() => useResumeRunningQuery(params));

    await waitFor(
      () => {
        expect(params.clearActiveQuery).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
    expect(params.restorePendingApproval).toHaveBeenCalledWith('q1');
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to restore pending approval:',
      expect.any(Error),
    );
    expect(state.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'final answer' },
    ]);
    consoleError.mockRestore();
  });

  it('ignores a result that arrives after the resume was stopped', async () => {
    const { params, state } = createParams([
      { role: 'user', content: 'hello' },
    ]);
    let resolveResult: ((value: ChatResponse) => void) | undefined;
    vi.mocked(chatService.getQueryResult).mockImplementationOnce(
      () =>
        new Promise<ChatResponse>(resolve => {
          resolveResult = resolve;
        }),
    );

    const { unmount } = renderHook(() => useResumeRunningQuery(params));

    await waitFor(() => {
      expect(chatService.getQueryResult).toHaveBeenCalled();
    });
    unmount();
    resolveResult?.({ status: 'done', terminal: true, response: 'late' });
    await Promise.resolve();

    expect(params.clearActiveQuery).not.toHaveBeenCalled();
    expect(state.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });
});
