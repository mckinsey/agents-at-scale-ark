import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { trackEvent } from '@/lib/analytics/singleton';
import { hashPromptSync } from '@/lib/analytics/utils';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { generateUUID } from '@/lib/utils/uuid';

interface AxiosError extends Error {
  response?: {
    status: number;
  };
}

export type QueryResponse = components['schemas']['QueryResponse'];
export type QueryDetailResponse = components['schemas']['QueryDetailResponse'];
export type QueryListResponse = components['schemas']['QueryListResponse'];
export type QueryCreateRequest = Omit<
  components['schemas']['QueryCreateRequest'],
  'targets'
> & {
  target?: { name: string; type: string };
};
export type QueryUpdateRequest = Omit<
  components['schemas']['QueryUpdateRequest'],
  'targets'
> & {
  target?: { name: string; type: string };
};

// Define terminal status phases
type TerminalQueryStatusPhase = 'done' | 'error' | 'canceled' | 'unknown';

// Define non-terminal status phases
type NonTerminalQueryStatusPhase = 'pending' | 'running';

// Combined query status phase type
type QueryStatusPhase = TerminalQueryStatusPhase | NonTerminalQueryStatusPhase;

// Constants for runtime checks
const TERMINAL_QUERY_STATUS_PHASES: readonly TerminalQueryStatusPhase[] = [
  'done',
  'error',
  'canceled',
  'unknown',
] as const;
const NON_TERMINAL_QUERY_STATUS_PHASES: readonly NonTerminalQueryStatusPhase[] =
  ['pending', 'running'] as const;
const QUERY_STATUS_PHASES: readonly QueryStatusPhase[] = [
  ...TERMINAL_QUERY_STATUS_PHASES,
  ...NON_TERMINAL_QUERY_STATUS_PHASES,
] as const;

type QueryStatusWithPhase = {
  phase: string;
  response?: { content: string };
};

// Type guard for checking if a phase is terminal
function isTerminalPhase(
  phase: QueryStatusPhase,
): phase is TerminalQueryStatusPhase {
  return (TERMINAL_QUERY_STATUS_PHASES as readonly string[]).includes(phase);
}

// Type guard for checking if a string is a valid query status phase
function isValidQueryStatusPhase(phase: string): phase is QueryStatusPhase {
  return (QUERY_STATUS_PHASES as readonly string[]).includes(phase);
}

export type ChatResponse = {
  status: QueryStatusPhase;
  terminal: boolean;
  response?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  queryId?: string;
};

export type ChatSession = {
  id: string;
  messages: ChatMessage[];
  queryResults?: QueryDetailResponse[];
  createdAt: Date;
  updatedAt: Date;
};

export const chatService = {
  async createQuery(query: QueryCreateRequest): Promise<QueryDetailResponse> {
    // Normalize target type to lowercase
    const normalizedQuery = {
      ...query,
      target: query.target
        ? {
            ...query.target,
            type: query.target.type?.toLowerCase(),
          }
        : undefined,
    };

    const response = await apiClient.post<QueryDetailResponse>(
      `/api/v1/queries/`,
      normalizedQuery,
    );

    const inputContent =
      typeof query.input === 'string'
        ? query.input
        : JSON.stringify(query.input);

    trackEvent({
      name: 'query_executed',
      properties: {
        queryName: response.name,
        inputType: query.type,
        targetName: query.target?.name ?? '',
        targetType: query.target?.type ?? '',
        promptHash: hashPromptSync(inputContent),
      },
    });

    return response;
  },

  async getQuery(queryName: string): Promise<QueryDetailResponse | null> {
    try {
      return await apiClient.get<QueryDetailResponse>(
        `/api/v1/queries/${queryName}`,
      );
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async listQueries(): Promise<QueryListResponse> {
    const response = await apiClient.get<QueryListResponse>(`/api/v1/queries/`);
    return response;
  },

  async updateQuery(
    queryName: string,
    updates: QueryUpdateRequest,
  ): Promise<QueryDetailResponse | null> {
    try {
      const response = await apiClient.put<QueryDetailResponse>(
        `/api/v1/queries/${queryName}`,
        updates,
      );
      return response;
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async deleteQuery(queryName: string): Promise<boolean> {
    try {
      await apiClient.delete(`/api/v1/queries/${queryName}`);
      return true;
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return false;
      }
      throw error;
    }
  },

  async submitChatQuery(
    messages: ChatCompletionMessageParam[],
    targetType: string,
    targetName: string,
    sessionId?: string,
    enableStreaming?: boolean,
  ): Promise<QueryDetailResponse> {
    const queryRequest: QueryCreateRequest = {
      name: `chat-query-${generateUUID()}`,
      type: 'messages',
      // Use OpenAI ChatCompletionMessageParam which supports multimodal content
      input: messages,
      target: {
        type: targetType.toLowerCase(),
        name: targetName,
      },
      sessionId,
    };

    // Add streaming annotation if enabled
    if (enableStreaming) {
      queryRequest.metadata = {
        annotations: {
          [ARK_ANNOTATIONS.STREAMING_ENABLED]: 'false',
        },
      };
    }

    return await this.createQuery(queryRequest);
  },

  async getChatHistory(sessionId: string): Promise<QueryDetailResponse[]> {
    const response = await this.listQueries();

    return response.items
      .filter(item => item.name.startsWith('chat-query-'))
      .map(
        item =>
          ({
            ...item,
            input: item.input,
            status: item.status,
            memory: undefined,
            parameters: undefined,
            selector: undefined,
            serviceAccount: undefined,
            sessionId: sessionId,
            target: undefined,
          }) as QueryDetailResponse,
      )
      .sort((a, b) => {
        const aTime = parseInt(a.name.split('-').pop() || '0');
        const bTime = parseInt(b.name.split('-').pop() || '0');
        return aTime - bTime;
      });
  },

  async getQueryResult(queryName: string): Promise<ChatResponse> {
    try {
      const query = await this.getQuery(queryName);

      if (!query || !query.status) {
        return { status: 'unknown', terminal: false };
      }

      const status = query.status;
      if (typeof status === 'object' && 'phase' in status) {
        const statusWithPhase = status as QueryStatusWithPhase;
        const phase = statusWithPhase.phase;
        const response = statusWithPhase.response?.content || 'No response';

        // Check if phase is in the valid set, otherwise use 'unknown'
        const validatedPhase: QueryStatusPhase = isValidQueryStatusPhase(phase)
          ? phase
          : 'unknown';

        return {
          terminal: isTerminalPhase(validatedPhase),
          status: validatedPhase,
          response: response,
        };
      }

      return { status: 'unknown', terminal: true };
    } catch {
      return { status: 'error', terminal: true };
    }
  },

  async streamQueryStatus(
    queryName: string,
    onUpdate: (status: QueryDetailResponse['status']) => void,
    pollInterval: number = 1000,
  ): Promise<() => void> {
    let stopped = false;

    const poll = async () => {
      while (!stopped) {
        try {
          const query = await this.getQuery(queryName);
          if (query && query.status) {
            onUpdate(query.status);

            if (
              query.status &&
              typeof query.status === 'object' &&
              'phase' in query.status
            ) {
              const statusWithPhase = query.status as QueryStatusWithPhase;
              const phase = statusWithPhase.phase;
              const validatedPhase: QueryStatusPhase = isValidQueryStatusPhase(
                phase,
              )
                ? phase
                : 'unknown';
              if (isTerminalPhase(validatedPhase)) {
                stopped = true;
                break;
              }
            }
          }
        } catch (error) {
          console.error('Error polling query status:', error);
        }

        if (!stopped) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }
    };

    poll();

    return () => {
      stopped = true;
    };
  },

  /**
   * Parse a Server-Sent Events (SSE) chunk line
   * @param line - SSE line in format "data: {json}" or "data: [DONE]"
   * @returns Parsed JSON object or null for [DONE] marker, empty lines, or invalid data
   */
  parseSSEChunk(line: string): Record<string, unknown> | null {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      return null;
    }

    if (!trimmedLine.startsWith('data:')) {
      return null;
    }

    const data = trimmedLine.substring(5).trim();
    if (data === '[DONE]') {
      return null;
    }

    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return null;
    }
  },

  /**
   * Stream chat response using Server-Sent Events
   * @param messages - Chat messages to send
   * @param targetType - Type of target (agent, model, team)
   * @param targetName - Name of the target
   * @param sessionId - Optional session ID
   * @yields Parsed SSE chunks containing response data
   */
  async *streamChatResponse(
    messages: ChatCompletionMessageParam[],
    targetType: string,
    targetName: string,
    sessionId?: string,
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const model = `${targetType}/${targetName}`;
    const response = await fetch('/api/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        metadata: sessionId ? { sessionId } : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to connect to stream: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available for streaming');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Split by double newline (SSE event separator)
        const lines = buffer.split('\n\n');

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        // Process complete lines
        for (const line of lines) {
          const chunk = this.parseSSEChunk(line);
          if (chunk) {
            yield chunk;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};
