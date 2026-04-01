import {ArkApiClient, QueryTarget} from './arkApiClient.js';
import {QUERY_ANNOTATIONS} from './constants.js';

export {QueryTarget};

export interface ChatConfig {
  streamingEnabled: boolean;
  currentTarget?: QueryTarget;
  sessionId?: string;
  conversationId?: string;
  queryTimeout?: string;
  a2aContextId?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ArkMetadata {
  agent?: string;
  team?: string;
  model?: string;
  query?: string;
  target?: string;
  completedQuery?: Record<string, unknown>;
}

export class ChatClient {
  private arkApiClient: ArkApiClient;

  constructor(arkApiClient: ArkApiClient) {
    this.arkApiClient = arkApiClient;
  }

  async getQueryTargets(): Promise<QueryTarget[]> {
    return await this.arkApiClient.getQueryTargets();
  }

  async sendMessage(
    targetId: string,
    messages: Array<{role: 'user' | 'assistant' | 'system'; content: string}>,
    config: ChatConfig,
    onChunk?: (
      chunk: string,
      toolCalls?: ToolCall[],
      arkMetadata?: ArkMetadata
    ) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const parts = targetId.split('/');
    const targetType = parts[0] || 'agent';
    const targetName = parts.slice(1).join('/') || targetId;

    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const input = lastUserMessage?.content || '';

    const annotations: Record<string, string> = {};
    if (config.a2aContextId) {
      annotations[QUERY_ANNOTATIONS.A2A_CONTEXT_ID] = config.a2aContextId;
    }
    if (config.streamingEnabled && onChunk) {
      annotations['ark.mckinsey.com/streaming-enabled'] = 'true';
    }

    const queryResult = await this.arkApiClient.createQuery({
      input,
      target: {type: targetType, name: targetName},
      sessionId: config.sessionId,
      conversationId: config.conversationId,
      timeout: config.queryTimeout,
      ...(Object.keys(annotations).length > 0
        ? {metadata: {annotations}}
        : {}),
    });

    const queryName = (queryResult as {name?: string}).name;
    if (!queryName) {
      throw new Error('Query creation did not return a name');
    }

    if (config.streamingEnabled && onChunk) {
      return await this.pollStreamResponse(queryName, onChunk, signal);
    } else {
      return await this.pollResponse(queryName, onChunk, signal);
    }
  }

  private async pollResponse(
    queryName: string,
    onChunk?: (
      chunk: string,
      toolCalls?: ToolCall[],
      arkMetadata?: ArkMetadata
    ) => void,
    signal?: AbortSignal
  ): Promise<string> {
    while (!signal?.aborted) {
      const query = (await this.arkApiClient.getQuery(queryName)) as {
        status?: {
          phase?: string;
          response?: {content?: string; raw?: string};
          conversationId?: string;
        };
      };

      const phase = query.status?.phase;
      if (phase === 'done' || phase === 'error' || phase === 'canceled') {
        const content = query.status?.response?.content || '';

        let toolCalls: ToolCall[] | undefined;
        if (query.status?.response?.raw) {
          try {
            const rawMessages = JSON.parse(query.status.response.raw) as Array<{
              tool_calls?: Array<{
                id: string;
                type: string;
                function: {name: string; arguments: string};
              }>;
            }>;
            for (const msg of rawMessages) {
              if (msg.tool_calls && msg.tool_calls.length > 0) {
                toolCalls = msg.tool_calls.map(tc => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: tc.function,
                }));
              }
            }
          } catch {
            // ignore parse errors
          }
        }

        if (toolCalls && onChunk) {
          onChunk('', toolCalls, undefined);
        }
        if (content && onChunk) {
          onChunk(content, undefined, undefined);
        }

        if (phase === 'error') {
          throw new Error(content || 'Query failed');
        }

        return content;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return '';
  }

  private async pollStreamResponse(
    queryName: string,
    onChunk: (
      chunk: string,
      toolCalls?: ToolCall[],
      arkMetadata?: ArkMetadata
    ) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const baseUrl = this.arkApiClient.getBaseUrl();
    const response = await fetch(
      `${baseUrl}/v1/broker/chunks?watch=true&query-id=${queryName}`,
      {signal}
    );

    if (!response.ok) {
      return await this.pollResponse(queryName, onChunk, signal);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return await this.pollResponse(queryName, onChunk, signal);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';
    const toolCallsById = new Map<number, ToolCall>();

    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const data = trimmed.substring(5).trim();
          if (data === '[DONE]') continue;

          let chunk: Record<string, unknown>;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }

          const arkMetadata = (chunk as {ark?: ArkMetadata}).ark;
          const choices = (chunk as {choices?: Array<{delta?: {content?: string; tool_calls?: Array<{index: number; id?: string; type?: string; function?: {name?: string; arguments?: string}}>}}>}).choices;
          const delta = choices?.[0]?.delta;

          const content = delta?.content || '';
          if (content) {
            fullResponse += content;
            onChunk(content, undefined, arkMetadata);
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (!toolCallsById.has(tc.index)) {
                toolCallsById.set(tc.index, {
                  id: tc.id || '',
                  type: 'function',
                  function: {name: tc.function?.name || '', arguments: ''},
                });
              }
              const existing = toolCallsById.get(tc.index)!;
              if (tc.function?.arguments) {
                existing.function.arguments += tc.function.arguments;
              }
              onChunk('', Array.from(toolCallsById.values()), arkMetadata);
            }
          }

          if (
            !fullResponse &&
            arkMetadata?.completedQuery
          ) {
            const completed = arkMetadata.completedQuery as {status?: {response?: {content?: string}}};
            const responseContent = completed?.status?.response?.content;
            if (responseContent) {
              fullResponse = responseContent;
              onChunk(responseContent, undefined, arkMetadata);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullResponse;
  }
}
