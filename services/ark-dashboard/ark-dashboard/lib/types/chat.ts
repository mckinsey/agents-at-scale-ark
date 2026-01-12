export interface ToolCallData {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessageData {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  queryName?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  tool_calls?: ToolCallData[];
}
