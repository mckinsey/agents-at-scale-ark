export interface ChatMessageData {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  queryName?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}
