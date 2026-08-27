import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import {
  chatService,
  extractMemoryNotice,
  hasMemoryCondition,
  type QueryDetailResponse,
} from '@/lib/services/chat';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/api/config', () => ({
  apiUrl: vi.fn((path: string) => path),
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

const HEALTHY_CONDITIONS = [
  {
    type: 'MemoryUnavailable',
    status: 'False',
    reason: 'MemoryReachable',
    message: 'Conversation history was available for this query',
  },
  {
    type: 'MemoryDegraded',
    status: 'False',
    reason: 'MemoryHealthy',
    message: 'Conversation history was read from memory for this query',
  },
];

const UNAVAILABLE_MESSAGE =
  'conversationId was set but no Memory backend was reachable; conversation history was disabled for this query';

const DEGRADED_MESSAGE =
  'failed to read conversation history from the memory backend; the query ran without prior context.';

function query(
  status: Record<string, unknown> | undefined,
): QueryDetailResponse {
  return {
    name: 'chat-query-1',
    input: 'hello',
    status,
  } as QueryDetailResponse;
}

describe('extractMemoryNotice', () => {
  it('returns null when both conditions are present but False', () => {
    expect(
      extractMemoryNotice({ phase: 'done', conditions: HEALTHY_CONDITIONS }),
    ).toBeNull();
  });

  it('returns the notice when MemoryUnavailable is True', () => {
    expect(
      extractMemoryNotice({
        phase: 'done',
        conditions: [
          {
            type: 'MemoryUnavailable',
            status: 'True',
            message: UNAVAILABLE_MESSAGE,
          },
          HEALTHY_CONDITIONS[1],
        ],
      }),
    ).toEqual({ type: 'MemoryUnavailable', message: UNAVAILABLE_MESSAGE });
  });

  it('returns the notice when MemoryDegraded is True', () => {
    expect(
      extractMemoryNotice({
        phase: 'done',
        conditions: [
          HEALTHY_CONDITIONS[0],
          {
            type: 'MemoryDegraded',
            status: 'True',
            message: DEGRADED_MESSAGE,
          },
        ],
      }),
    ).toEqual({ type: 'MemoryDegraded', message: DEGRADED_MESSAGE });
  });

  it('prefers MemoryUnavailable when both are True', () => {
    expect(
      extractMemoryNotice({
        phase: 'done',
        conditions: [
          {
            type: 'MemoryDegraded',
            status: 'True',
            message: DEGRADED_MESSAGE,
          },
          {
            type: 'MemoryUnavailable',
            status: 'True',
            message: UNAVAILABLE_MESSAGE,
          },
        ],
      }),
    ).toEqual({ type: 'MemoryUnavailable', message: UNAVAILABLE_MESSAGE });
  });

  it('falls back to a built-in message when the condition carries none', () => {
    const notice = extractMemoryNotice({
      phase: 'done',
      conditions: [
        { type: 'MemoryUnavailable', status: 'True', message: '   ' },
      ],
    });

    expect(notice?.type).toBe('MemoryUnavailable');
    expect(notice?.message).toBe(
      'No memory backend was reachable, so this query ran without conversation history.',
    );
  });

  it('ignores unrelated conditions that are True', () => {
    expect(
      extractMemoryNotice({
        phase: 'done',
        conditions: [
          { type: 'Completed', status: 'True', message: 'Query succeeded' },
        ],
      }),
    ).toBeNull();
  });

  it('returns null for a status with no conditions at all', () => {
    expect(extractMemoryNotice({ phase: 'done' })).toBeNull();
    expect(extractMemoryNotice(undefined)).toBeNull();
    expect(extractMemoryNotice(null)).toBeNull();
  });
});

describe('extractMemoryNotice edge shapes', () => {
  it('returns null for a status that is not an object', () => {
    expect(extractMemoryNotice('done')).toBeNull();
    expect(extractMemoryNotice(42)).toBeNull();
  });

  it('returns null when conditions is present but not an array', () => {
    expect(
      extractMemoryNotice({ phase: 'done', conditions: {} }),
    ).toBeNull();
  });

  it('tolerates a null entry inside conditions', () => {
    expect(
      extractMemoryNotice({
        phase: 'done',
        conditions: [
          null,
          {
            type: 'MemoryUnavailable',
            status: 'True',
            message: UNAVAILABLE_MESSAGE,
          },
        ],
      }),
    ).toEqual({ type: 'MemoryUnavailable', message: UNAVAILABLE_MESSAGE });
  });
});

describe('hasMemoryCondition', () => {
  it('is true for either memory condition, whatever its status', () => {
    expect(
      hasMemoryCondition({phase: 'done', conditions: HEALTHY_CONDITIONS}),
    ).toBe(true);
    expect(
      hasMemoryCondition({
        phase: 'done',
        conditions: [{type: 'MemoryDegraded', status: 'True'}],
      }),
    ).toBe(true);
  });

  // A query that failed before dispatch is terminal and carries neither
  // condition. That says nothing about memory, so it must not read as healthy.
  it('is false for a terminal query that carries no memory condition', () => {
    expect(
      hasMemoryCondition({
        phase: 'error',
        conditions: [{type: 'Completed', status: 'True'}],
      }),
    ).toBe(false);
    expect(hasMemoryCondition({phase: 'done'})).toBe(false);
    expect(hasMemoryCondition({phase: 'done', conditions: []})).toBe(false);
    expect(hasMemoryCondition(undefined)).toBe(false);
  });
});

describe('chatService.getQueryResult memory lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carries a settled lookup when the query holds the verdict', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      query({
        phase: 'done',
        response: {content: 'hi'},
        conditions: [
          {
            type: 'MemoryUnavailable',
            status: 'True',
            message: UNAVAILABLE_MESSAGE,
          },
        ],
      }),
    );

    const result = await chatService.getQueryResult('chat-query-1');

    expect(result.memoryLookup).toEqual({
      settled: true,
      notice: {type: 'MemoryUnavailable', message: UNAVAILABLE_MESSAGE},
    });
  });

  it('carries a settled healthy lookup when the verdict says so', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      query({phase: 'done', conditions: HEALTHY_CONDITIONS}),
    );

    const result = await chatService.getQueryResult('chat-query-1');

    expect(result.memoryLookup).toEqual({settled: true, notice: null});
  });

  it('carries no lookup when the query holds no verdict', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      query({phase: 'error', response: {content: 'target unresolvable'}}),
    );

    const result = await chatService.getQueryResult('chat-query-1');

    expect(result.memoryLookup).toBeUndefined();
  });

  it('carries no lookup when the query could not be read', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('network error'));

    const result = await chatService.getQueryResult('chat-query-1');

    expect(result).toEqual({status: 'error', terminal: true});
  });
});

describe('chatService.resolveMemoryNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps polling until the verdict lands on the query', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(query({ phase: 'running' }))
      .mockResolvedValueOnce(query({ phase: 'running' }))
      .mockResolvedValueOnce(
        query({
          phase: 'done',
          conditions: [
            {
              type: 'MemoryUnavailable',
              status: 'True',
              message: UNAVAILABLE_MESSAGE,
            },
          ],
        }),
      );

    const lookup = await chatService.resolveMemoryNotice('chat-query-1', 6, 0);

    expect(lookup).toEqual({
      settled: true,
      notice: { type: 'MemoryUnavailable', message: UNAVAILABLE_MESSAGE },
    });
    expect(apiClient.get).toHaveBeenCalledTimes(3);
  });

  it('settles on a healthy verdict at the first read', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      query({ phase: 'done', conditions: HEALTHY_CONDITIONS }),
    );

    const lookup = await chatService.resolveMemoryNotice('chat-query-1', 6, 0);

    expect(lookup).toEqual({ settled: true, notice: null });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  // "Could not tell" must never be reported as "nothing wrong": the caller
  // clears its banner on a settled lookup.
  it('stays unsettled when the verdict never lands', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(query({ phase: 'running' }));

    const lookup = await chatService.resolveMemoryNotice('chat-query-1', 3, 0);

    expect(lookup).toEqual({ settled: false, notice: null });
    expect(apiClient.get).toHaveBeenCalledTimes(3);
  });

  // The banner used to be cleared here: the query is terminal, so the old
  // phase-based gate settled, and no conditions read as "no problem".
  it('stays unsettled for a query that ended without a verdict', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      query({ phase: 'error', response: { content: 'target unresolvable' } }),
    );

    const lookup = await chatService.resolveMemoryNotice('chat-query-1', 3, 0);

    expect(lookup).toEqual({ settled: false, notice: null });
  });

  it('stays unsettled when every lookup fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network error'));

    const lookup = await chatService.resolveMemoryNotice('chat-query-1', 3, 0);

    expect(lookup).toEqual({ settled: false, notice: null });
  });

  // A 502 from the gateway inside the poll window used to abandon the budget
  // and report health.
  it('keeps polling past a transient failure', async () => {
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('bad gateway'))
      .mockResolvedValueOnce(
        query({
          phase: 'done',
          conditions: [
            {
              type: 'MemoryDegraded',
              status: 'True',
              message: DEGRADED_MESSAGE,
            },
          ],
        }),
      );

    const lookup = await chatService.resolveMemoryNotice('chat-query-1', 3, 0);

    expect(lookup).toEqual({
      settled: true,
      notice: { type: 'MemoryDegraded', message: DEGRADED_MESSAGE },
    });
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('keeps polling when the query is not found yet', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(query({ phase: 'done', conditions: HEALTHY_CONDITIONS }));

    const lookup = await chatService.resolveMemoryNotice('chat-query-1', 3, 0);

    expect(lookup).toEqual({ settled: true, notice: null });
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('makes exactly as many reads as the attempt budget allows', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(query(undefined));

    await chatService.resolveMemoryNotice('chat-query-1', 4, 0);

    expect(apiClient.get).toHaveBeenCalledTimes(4);
  });
});
