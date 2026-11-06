import type { TokenUsage } from '@/atoms/chat-history';
import { BrokerUnavailableError } from '@/lib/services/chat';
import type {
  A2AStatusEvent,
  ArkExtendedChunk,
  ExtendedChatMessage,
  ToolApprovalRequest,
} from '@/lib/types/chat-message';
import {
  type AccumulatedToolCall,
  type ResultMessage,
  accumulateToolCallDeltas,
  convertTurnMessages,
  extractTokenUsage,
} from '@/lib/utils/chat-turn';

type CompletionChunk = Exclude<
  ArkExtendedChunk,
  ToolApprovalRequest | A2AStatusEvent
>;

type ChunkError = NonNullable<CompletionChunk['error']>;

type ChunkArkData = NonNullable<CompletionChunk['ark']>;

type MessagesUpdater = (prev: ExtendedChatMessage[]) => ExtendedChatMessage[];

export type ChunkOutcome = 'continue' | 'stop';

export interface StreamTurnState {
  queryName: string;
  turnStartIndex: number;
  currentMessageIndex: number;
  accumulatedContent: string;
  accumulatedToolCalls: AccumulatedToolCall[];
  pendingSystemMessages: string[];
  currentAgent?: string;
  turnComplete: boolean;
  completedQueryMessages: ResultMessage[];
  messageTokenUsage: TokenUsage | null;
  hasPendingApproval: boolean;
  hasError: boolean;
  errorMessage: string;
  brokerUnavailableError: BrokerUnavailableError | null;
}

export interface StreamTurnEffects {
  updateChatMessages: (updater: MessagesUpdater) => void;
  setStatusText: (text: string | undefined) => void;
  updateConversationId: (conversationId: string) => void;
  updateTokenUsage: (usage: TokenUsage) => void;
  setMessageTokenUsage: (messageIndex: number, usage: TokenUsage) => void;
  onApprovalRequest: (queryName: string, messageIndex: number) => void;
  onQueryNameChange: (queryName: string) => void;
}

export function createStreamTurnState(
  queryName: string,
  turnStartIndex: number,
): StreamTurnState {
  return {
    queryName,
    turnStartIndex,
    currentMessageIndex: turnStartIndex,
    accumulatedContent: '',
    accumulatedToolCalls: [],
    pendingSystemMessages: [],
    currentAgent: undefined,
    turnComplete: false,
    completedQueryMessages: [],
    messageTokenUsage: null,
    hasPendingApproval: false,
    hasError: false,
    errorMessage: '',
    brokerUnavailableError: null,
  };
}

export function isBrokerUnavailableChunk(chunk: ArkExtendedChunk): boolean {
  if (!('error' in chunk) || !chunk.error) {
    return false;
  }
  if (chunk.code === 'broker_unavailable') {
    return true;
  }
  return (
    chunk.error.type === 'connection_error' ||
    chunk.error.type === 'service_unavailable'
  );
}

function isApprovalRequestChunk(
  chunk: ArkExtendedChunk,
): chunk is ToolApprovalRequest {
  return 'type' in chunk && chunk.type === 'tool_approval_request';
}

function isStatusChunk(chunk: ArkExtendedChunk): chunk is A2AStatusEvent {
  return 'type' in chunk && chunk.type === 'a2a_status';
}

function toSystemMessages(contents: string[]): ExtendedChatMessage[] {
  return contents.map(content => ({ role: 'system', content }));
}

function replaceMessageAt(
  effects: StreamTurnEffects,
  index: number,
  message: ExtendedChatMessage,
): void {
  effects.updateChatMessages(prev => {
    const updated = [...prev];
    updated[index] = message;
    return updated;
  });
}

function writeCurrentMessage(
  state: StreamTurnState,
  effects: StreamTurnEffects,
  toolCalls: AccumulatedToolCall[],
): void {
  const message: ExtendedChatMessage = {
    role: 'assistant',
    content: state.accumulatedContent,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
  if (state.currentAgent) {
    message.name = state.currentAgent;
  }
  replaceMessageAt(effects, state.currentMessageIndex, message);
}

function finalizeCurrentMessage(
  state: StreamTurnState,
  effects: StreamTurnEffects,
): void {
  if (state.accumulatedContent || state.accumulatedToolCalls.length > 0) {
    writeCurrentMessage(state, effects, [...state.accumulatedToolCalls]);
  }
}

function addSystemMessagesAndNewAssistant(
  state: StreamTurnState,
  effects: StreamTurnEffects,
): void {
  const systemMsgs = toSystemMessages(state.pendingSystemMessages);
  effects.updateChatMessages(prev => [
    ...prev,
    ...systemMsgs,
    { role: 'assistant', content: '' },
  ]);
  state.pendingSystemMessages.length = 0;
  state.currentMessageIndex += systemMsgs.length + 1;
}

function applyApprovalRequest(
  state: StreamTurnState,
  chunk: ToolApprovalRequest,
  effects: StreamTurnEffects,
): void {
  console.log('[HITL Debug] Detected tool_approval_request event!', chunk);
  const approvalRequest: ToolApprovalRequest = {
    ...chunk,
    receivedAtMs: Date.now(),
  };
  state.hasPendingApproval = true;
  effects.onApprovalRequest(state.queryName, state.currentMessageIndex);
  replaceMessageAt(effects, state.currentMessageIndex, {
    role: 'assistant',
    content: '',
    approvalRequest,
    metadata: { queryName: state.queryName },
  });
}

function applyErrorChunk(
  state: StreamTurnState,
  chunk: CompletionChunk,
  error: ChunkError,
  effects: StreamTurnEffects,
): void {
  if (isBrokerUnavailableChunk(chunk)) {
    state.brokerUnavailableError = new BrokerUnavailableError(
      error.message || 'Broker unavailable',
      503,
      chunk.code ?? 'broker_unavailable',
      chunk.fallback ?? 'poll',
      state.queryName,
    );
    return;
  }
  state.hasError = true;
  state.errorMessage = error.message || 'An error occurred';
  state.queryName = chunk.ark?.query || '';
  effects.onQueryNameChange(state.queryName);
}

function parseRawMessages(raw: string | undefined): ResultMessage[] | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse completed query messages:', e);
    return null;
  }
}

function applyFinalChunk(
  state: StreamTurnState,
  chunk: CompletionChunk,
  ark: ChunkArkData,
  effects: StreamTurnEffects,
): ChunkOutcome {
  const completedQuery = ark.completedQuery;
  const status = completedQuery?.status;
  if (status?.conversationId) {
    effects.updateConversationId(status.conversationId);
  }

  if (status?.phase === 'error') {
    state.hasError = true;
    state.errorMessage = status.response?.content || 'Query failed';
    state.queryName = completedQuery?.metadata?.name || '';
    return 'stop';
  }

  const completedMessages = parseRawMessages(status?.response?.raw);
  if (completedMessages) {
    state.completedQueryMessages = completedMessages;
  }

  const usage = extractTokenUsage(status?.tokenUsage, chunk.usage);
  if (usage) {
    state.messageTokenUsage = usage;
    effects.updateTokenUsage(usage);
  }
  return 'continue';
}

function applyArkMetadata(
  state: StreamTurnState,
  ark: ChunkArkData,
  effects: StreamTurnEffects,
): void {
  if (ark.systemMessage) {
    state.pendingSystemMessages.push(ark.systemMessage);
  }

  const chunkAgent = ark.agent;
  const isNewAgent = chunkAgent && chunkAgent !== state.currentAgent;
  const isNewTurn = chunkAgent === state.currentAgent && state.turnComplete;
  if (!isNewAgent && !isNewTurn) return;

  if (state.currentAgent) {
    finalizeCurrentMessage(state, effects);
    state.accumulatedContent = '';
    state.accumulatedToolCalls.length = 0;
  }

  addSystemMessagesAndNewAssistant(state, effects);

  if (isNewAgent) {
    state.currentAgent = chunkAgent;
  }
  state.turnComplete = false;
}

function applyDelta(
  state: StreamTurnState,
  chunk: CompletionChunk,
  effects: StreamTurnEffects,
): void {
  const choice = chunk.choices?.[0];
  const delta = choice?.delta;
  if (delta?.content) {
    state.accumulatedContent += delta.content;
    effects.setStatusText(undefined);
  }
  if (delta?.tool_calls) {
    accumulateToolCallDeltas(state.accumulatedToolCalls, delta.tool_calls);
  }

  writeCurrentMessage(state, effects, state.accumulatedToolCalls);

  if (choice?.finish_reason === 'stop') {
    state.turnComplete = true;
  }
}

export function processStreamChunk(
  state: StreamTurnState,
  chunk: ArkExtendedChunk,
  effects: StreamTurnEffects,
): ChunkOutcome {
  console.log(
    '[HITL Debug] Received chunk:',
    JSON.stringify(chunk).slice(0, 200),
  );

  if (isApprovalRequestChunk(chunk)) {
    applyApprovalRequest(state, chunk, effects);
    return 'continue';
  }

  if (isStatusChunk(chunk)) {
    effects.setStatusText(chunk.message || undefined);
    return 'continue';
  }

  if (chunk.error) {
    applyErrorChunk(state, chunk, chunk.error, effects);
    return 'stop';
  }

  if (
    chunk.id === 'chatcmpl-final' &&
    chunk.ark &&
    applyFinalChunk(state, chunk, chunk.ark, effects) === 'stop'
  ) {
    return 'stop';
  }

  if (chunk.ark) {
    applyArkMetadata(state, chunk.ark, effects);
  }

  applyDelta(state, chunk, effects);
  return 'continue';
}

function flushPendingSystemMessages(
  state: StreamTurnState,
  effects: StreamTurnEffects,
): void {
  if (state.pendingSystemMessages.length === 0) return;
  const systemMsgs = toSystemMessages(state.pendingSystemMessages);
  effects.updateChatMessages(prev => [...prev, ...systemMsgs]);
  state.pendingSystemMessages.length = 0;
}

function hasTerminateToolCall(state: StreamTurnState): boolean {
  return state.accumulatedToolCalls.some(
    tc => tc.function.name === 'terminate',
  );
}

export function finishStreamTurn(
  state: StreamTurnState,
  effects: StreamTurnEffects,
): boolean {
  if (state.hasPendingApproval) {
    console.log(
      '[HITL Debug] Skipping finalize because we have a pending approval',
    );
  } else {
    finalizeCurrentMessage(state, effects);
  }

  if (state.messageTokenUsage) {
    effects.setMessageTokenUsage(
      state.currentMessageIndex,
      state.messageTokenUsage,
    );
  }

  flushPendingSystemMessages(state, effects);

  if (state.hasError && !hasTerminateToolCall(state)) {
    replaceMessageAt(effects, state.currentMessageIndex, {
      role: 'assistant',
      content: state.errorMessage,
      metadata: {
        status: 'failed',
        queryName: state.queryName || undefined,
      },
    });
    return false;
  }

  if (state.completedQueryMessages.length > 0) {
    const turnMessages = convertTurnMessages(state.completedQueryMessages);
    effects.updateChatMessages(prev => [
      ...prev.slice(0, state.turnStartIndex),
      ...turnMessages,
    ]);
  }

  return state.hasPendingApproval;
}
