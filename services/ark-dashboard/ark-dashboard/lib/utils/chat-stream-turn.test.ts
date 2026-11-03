import { describe, expect, it, vi } from 'vitest';

import { BrokerUnavailableError } from '@/lib/services/chat';
import type {
  ArkExtendedChunk,
  ExtendedChatMessage,
} from '@/lib/types/chat-message';

import {
  type StreamTurnEffects,
  createStreamTurnState,
  finishStreamTurn,
  isBrokerUnavailableChunk,
  processStreamChunk,
} from './chat-stream-turn';

type MessagesUpdater = (prev: ExtendedChatMessage[]) => ExtendedChatMessage[];

function setup(messages: ExtendedChatMessage[] = []) {
  const store = { messages };
  const effects: StreamTurnEffects = {
    updateChatMessages: vi.fn((updater: MessagesUpdater) => {
      store.messages = updater(store.messages);
    }),
    setStatusText: vi.fn(),
    updateConversationId: vi.fn(),
    updateTokenUsage: vi.fn(),
    setMessageTokenUsage: vi.fn(),
    onApprovalRequest: vi.fn(),
    onQueryNameChange: vi.fn(),
  };
  const state = createStreamTurnState('q1', 1);
  return { store, effects, state };
}

function chunk(value: Record<string, unknown>): ArkExtendedChunk {
  return value as unknown as ArkExtendedChunk;
}

function contentChunk(
  content: string,
  extra: Record<string, unknown> = {},
): ArkExtendedChunk {
  return chunk({
    id: 'chatcmpl-1',
    choices: [{ index: 0, delta: { content } }],
    ...extra,
  });
}

const USER_TURN: ExtendedChatMessage[] = [
  { role: 'user', content: 'hello' },
  { role: 'assistant', content: '' },
];

describe('isBrokerUnavailableChunk', () => {
  it('is false for a chunk without an error', () => {
    expect(isBrokerUnavailableChunk(contentChunk('hi'))).toBe(false);
  });

  it('is true for the broker_unavailable code', () => {
    expect(
      isBrokerUnavailableChunk(
        chunk({ error: { message: 'down' }, code: 'broker_unavailable' }),
      ),
    ).toBe(true);
  });

  it('is true for connection and service errors', () => {
    expect(
      isBrokerUnavailableChunk(chunk({ error: { type: 'connection_error' } })),
    ).toBe(true);
    expect(
      isBrokerUnavailableChunk(
        chunk({ error: { type: 'service_unavailable' } }),
      ),
    ).toBe(true);
  });

  it('is false for any other error', () => {
    expect(
      isBrokerUnavailableChunk(chunk({ error: { type: 'invalid_request' } })),
    ).toBe(false);
  });
});

describe('processStreamChunk', () => {
  it('turns an approval request into an approval card on the current message', () => {
    const { store, effects, state } = setup([...USER_TURN]);

    const outcome = processStreamChunk(
      state,
      chunk({
        type: 'tool_approval_request',
        taskId: 't1',
        toolCalls: [],
      }),
      effects,
    );

    expect(outcome).toBe('continue');
    expect(state.hasPendingApproval).toBe(true);
    expect(effects.onApprovalRequest).toHaveBeenCalledWith('q1', 1);
    expect(store.messages[1]).toMatchObject({
      role: 'assistant',
      content: '',
      approvalRequest: { taskId: 't1' },
      metadata: { queryName: 'q1' },
    });
    expect(store.messages[1].approvalRequest?.receivedAtMs).toEqual(
      expect.any(Number),
    );
  });

  it('shows the status text of an a2a status event', () => {
    const { effects, state } = setup();

    expect(
      processStreamChunk(
        state,
        chunk({ type: 'a2a_status', message: 'Thinking' }),
        effects,
      ),
    ).toBe('continue');
    processStreamChunk(state, chunk({ type: 'a2a_status' }), effects);

    expect(effects.setStatusText).toHaveBeenNthCalledWith(1, 'Thinking');
    expect(effects.setStatusText).toHaveBeenNthCalledWith(2, undefined);
  });

  it('stops with a broker error when the broker is unavailable', () => {
    const { effects, state } = setup();

    const outcome = processStreamChunk(
      state,
      chunk({ error: { message: 'down' }, code: 'broker_unavailable' }),
      effects,
    );

    expect(outcome).toBe('stop');
    expect(state.brokerUnavailableError).toBeInstanceOf(BrokerUnavailableError);
    expect(state.brokerUnavailableError?.queryName).toBe('q1');
    expect(state.hasError).toBe(false);
  });

  it('defaults the broker error details', () => {
    const { effects, state } = setup();

    processStreamChunk(
      state,
      chunk({ error: { type: 'connection_error' } }),
      effects,
    );

    expect(state.brokerUnavailableError).toMatchObject({
      message: 'Broker unavailable',
      code: 'broker_unavailable',
      fallback: 'poll',
    });
  });

  it('stops with the query error of an error chunk', () => {
    const { effects, state } = setup();

    const outcome = processStreamChunk(
      state,
      chunk({ error: { message: 'boom' }, ark: { query: 'q-error' } }),
      effects,
    );

    expect(outcome).toBe('stop');
    expect(state.hasError).toBe(true);
    expect(state.errorMessage).toBe('boom');
    expect(state.queryName).toBe('q-error');
    expect(effects.onQueryNameChange).toHaveBeenCalledWith('q-error');
  });

  it('falls back to a generic message for an error chunk without details', () => {
    const { effects, state } = setup();

    processStreamChunk(state, chunk({ error: {} }), effects);

    expect(state.errorMessage).toBe('An error occurred');
    expect(state.queryName).toBe('');
  });

  it('stops when the final chunk reports a failed query', () => {
    const { effects, state } = setup();

    const outcome = processStreamChunk(
      state,
      chunk({
        id: 'chatcmpl-final',
        choices: [],
        ark: {
          completedQuery: {
            metadata: { name: 'q-final' },
            status: { phase: 'error', response: { content: 'bad' } },
          },
        },
      }),
      effects,
    );

    expect(outcome).toBe('stop');
    expect(state.hasError).toBe(true);
    expect(state.errorMessage).toBe('bad');
    expect(state.queryName).toBe('q-final');
  });

  it('defaults the failure details of a failed final chunk', () => {
    const { effects, state } = setup();

    processStreamChunk(
      state,
      chunk({
        id: 'chatcmpl-final',
        choices: [],
        ark: { completedQuery: { status: { phase: 'error' } } },
      }),
      effects,
    );

    expect(state.errorMessage).toBe('Query failed');
    expect(state.queryName).toBe('');
  });

  it('collects the conversation, messages and usage of a completed query', () => {
    const { effects, state } = setup([...USER_TURN]);

    const outcome = processStreamChunk(
      state,
      chunk({
        id: 'chatcmpl-final',
        choices: [],
        ark: {
          completedQuery: {
            status: {
              phase: 'done',
              conversationId: 'conv-1',
              response: {
                raw: JSON.stringify([{ role: 'assistant', content: 'final' }]),
              },
              tokenUsage: { promptTokens: 3, completionTokens: 2 },
            },
          },
        },
      }),
      effects,
    );

    expect(outcome).toBe('continue');
    expect(effects.updateConversationId).toHaveBeenCalledWith('conv-1');
    expect(state.completedQueryMessages).toEqual([
      { role: 'assistant', content: 'final' },
    ]);
    const usage = {
      prompt_tokens: 3,
      completion_tokens: 2,
      total_tokens: 0,
      cached_tokens: 0,
    };
    expect(state.messageTokenUsage).toEqual(usage);
    expect(effects.updateTokenUsage).toHaveBeenCalledWith(usage);
  });

  it('keeps going when the completed messages cannot be parsed', () => {
    const { effects, state } = setup();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    processStreamChunk(
      state,
      chunk({
        id: 'chatcmpl-final',
        choices: [],
        ark: { completedQuery: { status: { response: { raw: '{' } } } },
      }),
      effects,
    );

    expect(state.completedQueryMessages).toEqual([]);
    expect(effects.updateTokenUsage).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('streams content and tool calls into the current message', () => {
    const { store, effects, state } = setup([...USER_TURN]);

    processStreamChunk(state, contentChunk('Hel'), effects);
    processStreamChunk(
      state,
      chunk({
        id: 'chatcmpl-1',
        choices: [
          {
            index: 0,
            delta: {
              content: 'lo',
              tool_calls: [
                {
                  index: 0,
                  id: 'call-1',
                  function: { name: 'search', arguments: '{}' },
                },
              ],
            },
          },
        ],
      }),
      effects,
    );

    expect(effects.setStatusText).toHaveBeenCalledWith(undefined);
    expect(store.messages[1]).toEqual({
      role: 'assistant',
      content: 'Hello',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'search', arguments: '{}' },
        },
      ],
    });
  });

  it('starts a new message for each agent and queues their system messages', () => {
    const { store, effects, state } = setup([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '' },
    ]);

    processStreamChunk(
      state,
      contentChunk('first', { ark: { agent: 'planner' } }),
      effects,
    );
    processStreamChunk(
      state,
      contentChunk('second', {
        ark: { agent: 'writer', systemMessage: 'handing over' },
      }),
      effects,
    );

    expect(store.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: 'first', name: 'planner' },
      { role: 'system', content: 'handing over' },
      { role: 'assistant', content: 'second', name: 'writer' },
    ]);
    expect(state.currentAgent).toBe('writer');
    expect(state.currentMessageIndex).toBe(4);
  });

  it('starts a new message when the same agent speaks again after finishing', () => {
    const { store, effects, state } = setup([...USER_TURN]);
    state.currentAgent = 'planner';
    state.currentMessageIndex = 1;

    processStreamChunk(
      state,
      chunk({
        id: 'chatcmpl-1',
        choices: [
          { index: 0, delta: { content: 'done' }, finish_reason: 'stop' },
        ],
        ark: { agent: 'planner' },
      }),
      effects,
    );
    expect(state.turnComplete).toBe(true);

    processStreamChunk(
      state,
      contentChunk('again', { ark: { agent: 'planner' } }),
      effects,
    );

    expect(state.turnComplete).toBe(false);
    expect(state.currentMessageIndex).toBe(2);
    expect(store.messages[1]).toEqual({
      role: 'assistant',
      content: 'done',
      name: 'planner',
    });
    expect(store.messages[2]).toEqual({
      role: 'assistant',
      content: 'again',
      name: 'planner',
    });
  });
});

describe('finishStreamTurn', () => {
  it('finalizes the message and replaces the turn with the completed query', () => {
    const { store, effects, state } = setup([...USER_TURN]);
    processStreamChunk(state, contentChunk('partial'), effects);
    state.completedQueryMessages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'final' },
    ];

    expect(finishStreamTurn(state, effects)).toBe(false);
    expect(store.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'final' },
    ]);
  });

  it('keeps the approval card and reports the paused turn', () => {
    const { store, effects, state } = setup([...USER_TURN]);
    processStreamChunk(
      state,
      chunk({ type: 'tool_approval_request', taskId: 't1', toolCalls: [] }),
      effects,
    );

    expect(finishStreamTurn(state, effects)).toBe(true);
    expect(store.messages[1].approvalRequest?.taskId).toBe('t1');
  });

  it('records the token usage of the last assistant message', () => {
    const { effects, state } = setup([...USER_TURN]);
    const usage = {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
      cached_tokens: 0,
    };
    state.messageTokenUsage = usage;

    finishStreamTurn(state, effects);

    expect(effects.setMessageTokenUsage).toHaveBeenCalledWith(1, usage);
  });

  it('appends the system messages still pending', () => {
    const { store, effects, state } = setup([...USER_TURN]);
    state.pendingSystemMessages.push('wrap up');

    finishStreamTurn(state, effects);

    expect(store.messages.at(-1)).toEqual({
      role: 'system',
      content: 'wrap up',
    });
    expect(state.pendingSystemMessages).toEqual([]);
  });

  it('replaces the current message with the error of a failed turn', () => {
    const { store, effects, state } = setup([...USER_TURN]);
    state.hasError = true;
    state.errorMessage = 'boom';
    state.completedQueryMessages = [{ role: 'assistant', content: 'final' }];

    expect(finishStreamTurn(state, effects)).toBe(false);
    expect(store.messages[1]).toEqual({
      role: 'assistant',
      content: 'boom',
      metadata: { status: 'failed', queryName: 'q1' },
    });
  });

  it('leaves the query name out of an error without one', () => {
    const { store, effects, state } = setup([...USER_TURN]);
    state.hasError = true;
    state.errorMessage = 'boom';
    state.queryName = '';

    finishStreamTurn(state, effects);

    expect(store.messages[1].metadata).toEqual({
      status: 'failed',
      queryName: undefined,
    });
  });

  it('does not report an error when the agent terminated on purpose', () => {
    const { store, effects, state } = setup([...USER_TURN]);
    state.hasError = true;
    state.errorMessage = 'boom';
    state.accumulatedToolCalls.push({
      id: 'call-1',
      type: 'function',
      function: { name: 'terminate', arguments: '{}' },
    });
    state.completedQueryMessages = [{ role: 'assistant', content: 'final' }];

    expect(finishStreamTurn(state, effects)).toBe(false);
    expect(store.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'final' },
    ]);
  });
});
