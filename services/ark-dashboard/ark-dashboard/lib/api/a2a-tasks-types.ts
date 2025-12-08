export interface A2ATaskResponse {
  name: string;
  namespace: string;
  taskId: string;
  phase?: string;
  agentRef?: {
    name?: string;
    namespace?: string;
  };
  queryRef?: {
    name: string;
    namespace?: string;
    responseTarget?: string;
  };
  creationTimestamp?: string;
}

export interface A2ATaskListResponse {
  items: A2ATaskResponse[];
  count: number;
}

export interface A2ATaskPart {
  kind: 'text' | 'file' | 'data';
  text?: string;
  data?: string;
  uri?: string;
  mimeType?: string;
  metadata?: Record<string, string>;
}

export interface A2ATaskArtifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: A2ATaskPart[];
  metadata?: Record<string, string>;
}

export interface A2ATaskMessage {
  messageId?: string;
  role: 'user' | 'agent' | 'system';
  parts: A2ATaskPart[];
  metadata?: Record<string, string>;
}

export interface A2ATaskStatus {
  phase?: string;
  protocolState?: string;
  protocolMetadata?: Record<string, string>;
  startTime?: string;
  completionTime?: string;
  lastStatusTimestamp?: string;
  error?: string;
  contextId?: string;
  artifacts?: A2ATaskArtifact[];
  history?: A2ATaskMessage[];
  lastStatusMessage?: A2ATaskMessage;
  conditions?: Array<Record<string, unknown>>;
}

export interface A2ATaskDetailResponse {
  name: string;
  namespace: string;
  taskId: string;
  a2aServerRef: {
    name: string;
    namespace?: string;
  };
  agentRef: {
    name?: string;
    namespace?: string;
  };
  queryRef: {
    name: string;
    namespace?: string;
    responseTarget?: string;
  };
  contextId?: string;
  input?: string;
  parameters?: Record<string, string>;
  pollInterval?: string;
  priority?: number;
  timeout?: string;
  ttl?: string;
  status?: A2ATaskStatus;
  metadata?: Record<string, unknown>;
}
