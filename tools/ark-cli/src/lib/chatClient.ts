import {ArkApiClient, QueryTarget} from './arkApiClient.js';
import type {Query} from './types.js';
import {QUERY_ANNOTATIONS} from './constants.js';

// Re-export QueryTarget for compatibility
export {QueryTarget};

export interface ChatConfig {
  streamingEnabled: boolean;
  currentTarget?: QueryTarget;
  a2aContextId?: string;
  sessionId?: string;
  conversationId?: string;
  queryTimeout?: string;
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
  completedQuery?: Query;
}

export class ChatClient {
  private arkApiClient: ArkApiClient;

  constructor(arkApiClient: ArkApiClient) {
    this.arkApiClient = arkApiClient;
  }

  async getQueryTargets(): Promise<QueryTarget[]> {
    return await this.arkApiClient.getQueryTargets();
  }

  /**
   * Send a chat completion request
   */
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
    const shouldStream = config.streamingEnabled && !!onChunk;

    const params: any = {
      model: targetId,
      messages: messages,
      signal: signal,
    };

    // Build metadata object - only add if we have something to include
    if (
      config.sessionId ||
      config.conversationId ||
      config.a2aContextId ||
      config.queryTimeout
    ) {
      params.metadata = {};

      if (config.sessionId) {
        params.metadata.sessionId = config.sessionId;
      }

      if (config.conversationId) {
        params.metadata.conversationId = config.conversationId;
      }

      if (config.queryTimeout) {
        params.metadata.timeout = config.queryTimeout;
      }

      // Add A2A context ID to queryAnnotations (goes to annotations)
      if (config.a2aContextId) {
        const queryAnnotations: Record<string, string> = {
          [QUERY_ANNOTATIONS.A2A_CONTEXT_ID]: config.a2aContextId,
        };
        params.metadata.queryAnnotations = JSON.stringify(queryAnnotations);
      }
    }

    if (shouldStream) {
      let fullResponse = '';
      const toolCallsById = new Map<number, ToolCall>();

      const stream = this.arkApiClient.createChatCompletionStream(params);

      for await (const chunk of stream) {
        if (signal?.aborted) {
          break;
        }

        const delta = chunk.choices?.[0]?.delta;
        // Extract ARK metadata if present
        const arkMetadata = (chunk as any).ark as ArkMetadata | undefined;

        const content = delta?.content || '';
        if (content) {
          fullResponse += content;
        }
        if (onChunk) {
          onChunk(content, undefined, arkMetadata);
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            // Initialize tool call if this is the first chunk for this index
            if (!toolCallsById.has(index)) {
              toolCallsById.set(index, {
                id: toolCallDelta.id || '',
                type: toolCallDelta.type || 'function',
                function: {
                  name: toolCallDelta.function?.name || '',
                  arguments: '',
                },
              });
            }

            // Accumulate function arguments
            const toolCall = toolCallsById.get(index)!;
            if (toolCallDelta.function?.arguments) {
              toolCall.function.arguments += toolCallDelta.function.arguments;
            }

            // Send the current state of all tool calls
            if (onChunk) {
              const toolCallsArray = Array.from(toolCallsById.values());
              onChunk('', toolCallsArray, arkMetadata);
            }
          }
        }
      }
      return fullResponse;
    } else {
      const response = await this.arkApiClient.createChatCompletion(params);
      const message = response.choices[0]?.message;
      const content = message?.content || '';
      const arkMetadata = (response as any).ark as ArkMetadata | undefined;

      // Handle tool calls in non-streaming mode
      if (message?.tool_calls && message.tool_calls.length > 0) {
        const toolCalls: ToolCall[] = message.tool_calls.map((tc: any) => ({
          id: tc.id,
          type: tc.type || 'function',
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '',
          },
        }));

        // Send tool calls first
        if (onChunk) {
          onChunk('', toolCalls, arkMetadata);
        }
      }

      // Send content after tool calls
      if (content && onChunk) {
        onChunk(content, undefined, arkMetadata);
      }

      return content;
    }
  }
}
