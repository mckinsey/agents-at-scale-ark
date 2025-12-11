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