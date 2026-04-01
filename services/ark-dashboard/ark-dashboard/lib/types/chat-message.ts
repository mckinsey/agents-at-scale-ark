export interface GraphEdge {
  from: string;
  to: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export type ExtendedChatMessage = ChatMessage & {
  metadata?: {
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    queryName?: string;
  };
};
