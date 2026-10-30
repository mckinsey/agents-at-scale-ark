import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatService } from '@/lib/services';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';

import {
  type AccumulatedToolCall,
  QUERY_NOT_FOUND_MESSAGE,
  accumulateToolCallDeltas,
  buildCascadingApprovalMessage,
  buildPollResultMessages,
  convertResultMessage,
  convertTurnMessages,
  extractTokenUsage,
  findTurnStartIndex,
  loadApprovalRequestMessage,
  readA2ATaskId,
  stripEmptyAssistantPlaceholder,
} from './chat-turn';

vi.mock('@/lib/services', () => ({
  chatService: {
    getQuery: vi.fn(),
    getA2ATask: vi.fn(),
  },
}));

type QueryDetail = Awaited<ReturnType<typeof chatService.getQuery>>;

type A2ATask = Awaited<ReturnType<typeof chatService.getA2ATask>>;

describe('findTurnStartIndex', () => {
  it('returns the index right after the last user message', () => {
    const messages: ExtendedChatMessage[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'partial' },
    ];

    expect(findTurnStartIndex(messages)).toBe(3);
  });

  it('returns the message count when there is no user message', () => {
    const messages: ExtendedChatMessage[] = [
      { role: 'system', content: 'notice' },
    ];

    expect(findTurnStartIndex(messages)).toBe(1);
  });
});

describe('stripEmptyAssistantPlaceholder', () => {
  it('drops a trailing empty assistant message', () => {
    expect(
      stripEmptyAssistantPlaceholder([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: '' },
      ]),
    ).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('keeps a trailing assistant message that carries content', () => {
    const messages: ExtendedChatMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'partial' },
    ];

    expect(stripEmptyAssistantPlaceholder(messages)).toBe(messages);
  });
});

describe('convertResultMessage', () => {
  it('converts a tool message', () => {
    expect(
      convertResultMessage({
        role: 'tool',
        content: 'result',
        tool_call_id: 'call-1',
      }),
    ).toEqual({ role: 'tool', content: 'result', tool_call_id: 'call-1' });
  });

  it('defaults missing tool fields to empty strings', () => {
    expect(convertResultMessage({ role: 'tool' })).toEqual({
      role: 'tool',
      content: '',
      tool_call_id: '',
    });
  });

  it('keeps the agent name and tool calls of an assistant message', () => {
    expect(
      convertResultMessage({
        role: 'assistant',
        content: 'calling',
        name: 'researcher',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'search', arguments: '{}' },
          },
        ],
      }),
    ).toEqual({
      role: 'assistant',
      content: 'calling',
      name: 'researcher',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'search', arguments: '{}' },
        },
      ],
    });
  });

  it('omits empty tool calls from an assistant message', () => {
    expect(convertResultMessage({ role: 'assistant', tool_calls: [] })).toEqual(
      { role: 'assistant', content: '' },
    );
  });

  it('converts a system message', () => {
    expect(convertResultMessage({ role: 'system', content: 'note' })).toEqual({
      role: 'system',
      content: 'note',
    });
  });

  it('keeps the name of a user message', () => {
    expect(
      convertResultMessage({ role: 'user', content: 'hi', name: 'alice' }),
    ).toEqual({ role: 'user', content: 'hi', name: 'alice' });
  });

  it('maps an unknown role to a system message', () => {
    expect(convertResultMessage({ role: 'developer', content: 'x' })).toEqual({
      role: 'system',
      content: 'x',
    });
  });

  it('defaults missing system content to an empty string', () => {
    expect(convertResultMessage({ role: 'system' })).toEqual({
      role: 'system',
      content: '',
    });
  });
});

describe('buildCascadingApprovalMessage', () => {
  const toolCalls = [
    {
      id: 'call-1',
      type: 'function',
      function: { name: 'write-file', arguments: '{}' },
    },
  ];

  it('returns null when the task has no tool calls to approve', () => {
    expect(
      buildCascadingApprovalMessage(
        { status: {} } as unknown as A2ATask,
        'q1',
        'default',
        't1',
      ),
    ).toBeNull();
  });

  it('stamps the approval with the task start time', () => {
    const message = buildCascadingApprovalMessage(
      {
        agentRef: { name: 'agent-a' },
        status: {
          startTime: '2026-10-27T10:00:00Z',
          protocolMetadata: {
            toolCalls: JSON.stringify(toolCalls),
            timeout: '5m',
            onTimeout: 'reject',
          },
        },
      } as unknown as A2ATask,
      'q1',
      'default',
      't1',
    );

    expect(message?.approvalRequest).toMatchObject({
      taskId: 't1',
      toolCalls,
      timeout: '5m',
      onTimeout: 'reject',
      agentName: 'agent-a',
      receivedAtMs: new Date('2026-10-27T10:00:00Z').getTime(),
    });
    expect(message?.metadata).toEqual({ queryName: 'q1' });
  });

  it('falls back to the current time when the task has no start time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));
    try {
      const message = buildCascadingApprovalMessage(
        {
          status: {
            protocolMetadata: { toolCalls: JSON.stringify(toolCalls) },
          },
        } as unknown as A2ATask,
        'q1',
        'default',
        't1',
      );

      expect(message?.approvalRequest?.receivedAtMs).toBe(
        new Date('2026-10-27T12:00:00Z').getTime(),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('convertTurnMessages', () => {
  it('keeps only the response roles of a turn', () => {
    expect(
      convertTurnMessages([
        { role: 'user', content: 'hello' },
        { role: 'system', content: 'note' },
        { role: 'tool', content: 'result', tool_call_id: 'call-1' },
        { role: 'assistant', content: 'answer' },
        { role: 'developer', content: 'hidden' },
      ]),
    ).toEqual([
      { role: 'system', content: 'note' },
      { role: 'tool', content: 'result', tool_call_id: 'call-1' },
      { role: 'assistant', content: 'answer' },
    ]);
  });
});

describe('accumulateToolCallDeltas', () => {
  it('starts a tool call and appends its streamed arguments', () => {
    const accumulated: AccumulatedToolCall[] = [];

    accumulateToolCallDeltas(accumulated, [
      {
        index: 0,
        id: 'call-1',
        function: { name: 'search', arguments: '{"q"' },
      },
    ]);
    accumulateToolCallDeltas(accumulated, [
      { index: 0, id: 'call-1', function: { arguments: ':"rome"}' } },
    ]);

    expect(accumulated).toEqual([
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'search', arguments: '{"q":"rome"}' },
      },
    ]);
  });

  it('starts a tool call that has a name but no id yet', () => {
    const accumulated: AccumulatedToolCall[] = [];

    accumulateToolCallDeltas(accumulated, [
      { index: 0, function: { name: 'search' } },
    ]);

    expect(accumulated).toEqual([
      { id: '', type: 'function', function: { name: 'search', arguments: '' } },
    ]);
  });

  it('ignores a delta that matches no tool call and starts none', () => {
    const accumulated: AccumulatedToolCall[] = [];

    accumulateToolCallDeltas(accumulated, [
      { index: 0, function: { arguments: '{}' } },
    ]);

    expect(accumulated).toEqual([]);
  });
});

describe('extractTokenUsage', () => {
  it('prefers the token usage reported by the completed query', () => {
    expect(
      extractTokenUsage(
        { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      ),
    ).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      cached_tokens: 0,
    });
  });

  it('falls back to the usage carried by the chunk', () => {
    expect(
      extractTokenUsage(undefined, {
        prompt_tokens: 8,
        completion_tokens: 2,
        total_tokens: 10,
        prompt_tokens_details: { cached_tokens: 4 },
      }),
    ).toEqual({
      prompt_tokens: 8,
      completion_tokens: 2,
      total_tokens: 10,
      cached_tokens: 4,
    });
  });

  it('returns null when no usage is reported', () => {
    expect(extractTokenUsage(undefined, null)).toBeNull();
  });
});

describe('buildPollResultMessages', () => {
  it('converts the raw messages of a done query', () => {
    expect(
      buildPollResultMessages(
        {
          status: 'done',
          terminal: true,
          messages: [{ role: 'assistant', content: 'answer' }],
        },
        'q1',
      ),
    ).toEqual([{ role: 'assistant', content: 'answer' }]);
  });

  it('uses the plain response of a done query without raw messages', () => {
    expect(
      buildPollResultMessages(
        { status: 'done', terminal: true, response: 'answer' },
        'q1',
      ),
    ).toEqual([{ role: 'assistant', content: 'answer' }]);
  });

  it('returns nothing for a done query without any answer', () => {
    expect(
      buildPollResultMessages({ status: 'done', terminal: true }, 'q1'),
    ).toEqual([]);
  });

  it('reports a failed query with its response', () => {
    expect(
      buildPollResultMessages(
        { status: 'error', terminal: true, response: 'boom' },
        'q1',
      ),
    ).toEqual([
      {
        role: 'assistant',
        content: 'boom',
        metadata: { status: 'failed', queryName: 'q1' },
      },
    ]);
  });

  it('reports a failed query without a response', () => {
    expect(
      buildPollResultMessages({ status: 'error', terminal: true }, 'q1'),
    ).toEqual([
      {
        role: 'assistant',
        content: 'Query failed',
        metadata: { status: 'failed', queryName: 'q1' },
      },
    ]);
  });

  it('reports an unknown query status', () => {
    expect(
      buildPollResultMessages({ status: 'unknown', terminal: true }, 'q1'),
    ).toEqual([
      {
        role: 'assistant',
        content: 'Query status unknown',
        metadata: { status: 'failed', queryName: 'q1' },
      },
    ]);
  });

  it('reports a query that no longer exists', () => {
    expect(
      buildPollResultMessages(
        { status: 'unknown', terminal: true, notFound: true },
        'q1',
      ),
    ).toEqual([{ role: 'system', content: QUERY_NOT_FOUND_MESSAGE }]);
  });

  it('returns nothing for a canceled query', () => {
    expect(
      buildPollResultMessages({ status: 'canceled', terminal: true }, 'q1'),
    ).toEqual([]);
  });
});

describe('readA2ATaskId', () => {
  it('reads the task id of an A2A response', () => {
    expect(readA2ATaskId({ response: { a2a: { taskId: 't1' } } })).toBe('t1');
  });

  it.each([
    ['no status', undefined],
    ['no response', {}],
    ['no a2a block', { response: {} }],
    ['a non-string task id', { response: { a2a: { taskId: 42 } } }],
  ])('returns undefined with %s', (_label, status) => {
    expect(readA2ATaskId(status)).toBeUndefined();
  });
});

describe('loadApprovalRequestMessage', () => {
  const toolCalls = [
    {
      id: 'call-1',
      type: 'function',
      function: { name: 'write-file', arguments: '{}' },
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('builds the approval card from the A2A task of the query', async () => {
    vi.mocked(chatService.getQuery).mockResolvedValueOnce({
      namespace: 'query-namespace',
      status: { response: { a2a: { taskId: 't1' } } },
    } as unknown as QueryDetail);
    vi.mocked(chatService.getA2ATask).mockResolvedValueOnce({
      status: { protocolMetadata: { toolCalls: JSON.stringify(toolCalls) } },
    } as unknown as A2ATask);

    const approval = await loadApprovalRequestMessage('default', 'q1');

    expect(chatService.getQuery).toHaveBeenCalledWith('default', 'q1');
    expect(chatService.getA2ATask).toHaveBeenCalledWith(
      'default',
      'a2a-task-t1',
    );
    expect(approval?.taskId).toBe('t1');
    expect(approval?.message.approvalRequest).toMatchObject({
      taskId: 't1',
      queryName: 'q1',
      queryNamespace: 'query-namespace',
      toolCalls,
    });
  });

  it('falls back to the requested namespace', async () => {
    vi.mocked(chatService.getQuery).mockResolvedValueOnce({
      status: { response: { a2a: { taskId: 't1' } } },
    } as unknown as QueryDetail);
    vi.mocked(chatService.getA2ATask).mockResolvedValueOnce({
      status: { protocolMetadata: { toolCalls: JSON.stringify(toolCalls) } },
    } as unknown as A2ATask);

    const approval = await loadApprovalRequestMessage('default', 'q1');

    expect(approval?.message.approvalRequest).toMatchObject({
      queryNamespace: 'default',
    });
  });

  it('returns null when the query has no A2A task', async () => {
    vi.mocked(chatService.getQuery).mockResolvedValueOnce(null);

    await expect(loadApprovalRequestMessage('default', 'q1')).resolves.toBe(
      null,
    );
    expect(chatService.getA2ATask).not.toHaveBeenCalled();
  });

  it('returns null when the task has nothing to approve', async () => {
    vi.mocked(chatService.getQuery).mockResolvedValueOnce({
      status: { response: { a2a: { taskId: 't1' } } },
    } as unknown as QueryDetail);
    vi.mocked(chatService.getA2ATask).mockResolvedValueOnce({
      status: {},
    } as unknown as A2ATask);

    await expect(loadApprovalRequestMessage('default', 'q1')).resolves.toBe(
      null,
    );
  });
});
