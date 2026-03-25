// These types must match the Ark CRD field names and values.
// They will later be replaced by an ark-sdk TypeScript package.

export type QueryPhase = 'pending' | 'running' | 'done' | 'error' | 'canceled' | 'unknown';

export const QueryPhases = {
  Pending: 'pending',
  Running: 'running',
  Done: 'done',
  Error: 'error',
  Canceled: 'canceled',
  Unknown: 'unknown',
} as const satisfies Record<string, QueryPhase>;

export const EventReasons = {
  QueryExecutionComplete: 'QueryExecutionComplete',
  AgentExecutionStart: 'AgentExecutionStart',
} as const;

export const ERROR_REASON_SUFFIX = 'Error';

export type QueryEventReason =
  | 'QueryExecutionStart'
  | 'QueryExecutionComplete'
  | 'AgentExecutionStart'
  | 'AgentExecutionComplete'
  | 'LLMCallStart'
  | 'LLMCallComplete'
  | 'LLMCallError'
  | 'MemoryAddMessagesComplete'
  | 'MemoryGetMessagesStart'
  | 'MemoryGetMessagesComplete'
  | 'ToolCallStart'
  | 'ToolCallComplete'
  | 'TeamExecutionStart'
  | 'TeamExecutionComplete'
  | 'TeamExecutionError'
  | 'TeamTurnComplete'
  | 'TeamTurnError'
  | 'TeamMemberError';

export interface SessionEventData {
  sessionId: string;
  queryName: string;
  queryNamespace?: string;
  conversationId?: string;
  agent?: string;
  error?: string;
  _reason?: string;
}

export type Message = unknown;

export interface StoredMessage {
  timestamp: string;
  conversation_id: string;
  query_id: string;
  message: Message;
  sequence: number;
}

export interface AddMessageRequest {
  message: Message;
}

export interface AddMessagesRequest {
  messages: Message[];
}

export interface MessagesResponse {
  messages: Message[];
}

export interface StreamChoice {
  index: number;
  delta: {
    content?: string;
  };
  finish_reason?: string;
}

export interface StreamError {
  message: string;
  type: string;
  code?: string;
}

export interface StreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices?: StreamChoice[];
  error?: StreamError;
}