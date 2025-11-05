import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';
import { generateUUID } from '@/lib/utils/uuid';

interface AxiosError extends Error {
  response?: {
    status: number;
  };
}

export type QueryResponse = components['schemas']['QueryResponse'];
export type QueryDetailResponse = components['schemas']['QueryDetailResponse'];
export type QueryListResponse = components['schemas']['QueryListResponse'];
export type QueryCreateRequest = components['schemas']['QueryCreateRequest'];
export type QueryUpdateRequest = components['schemas']['QueryUpdateRequest'];

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
  responses?: Array<{ content: string }>;
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
    // Normalize target types to lowercase
    const normalizedQuery = {
      ...query,
      targets: query.targets?.map(target => ({
        ...target,
        type: target.type?.toLowerCase(),
      })),
    };

    const response = await apiClient.post<QueryDetailResponse>(
      `/api/v1/queries/`,
      normalizedQuery,
    );
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
  ): Promise<QueryDetailResponse> {
    const queryRequest = {
      name: `chat-query-${generateUUID()}`,
      type: 'messages',
      // Use OpenAI ChatCompletionMessageParam which supports multimodal content
      input: messages,
      targets: [
        {
          type: targetType.toLowerCase(),
          name: targetName,
        },
      ],
      sessionId,
    } as unknown as QueryCreateRequest;

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
            targets: undefined,
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
        return { status: 'unknown', terminal: true };
      }

      const status = query.status;
      if (typeof status === 'object' && 'phase' in status) {
        const statusWithPhase = status as QueryStatusWithPhase;
        const phase = statusWithPhase.phase;
        const responses = statusWithPhase.responses || [];
        const response = responses[0]?.content || 'No response';

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
};
