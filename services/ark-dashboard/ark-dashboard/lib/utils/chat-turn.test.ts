import { describe, expect, it, vi } from 'vitest';

import type { chatService } from '@/lib/services/chat';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';

import {
  buildCascadingApprovalMessage,
  convertResultMessage,
  findTurnStartIndex,
  stripEmptyAssistantPlaceholder,
} from './chat-turn';

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
