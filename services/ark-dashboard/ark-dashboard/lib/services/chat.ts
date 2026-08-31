import { trackEvent } from '@/lib/analytics/singleton';
import { hashPromptSync } from '@/lib/analytics/utils';
import { apiClient } from '@/lib/api/client';
import { apiUrl } from '@/lib/api/config';
import type { components } from '@/lib/api/generated/types';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { generateUUID } from '@/lib/utils/uuid';
import { a2aTasksService } from '@/lib/services/a2a-tasks';

interface AxiosError extends Error {
  response?: {
    status: number;
  };
}

export type QueryParameter = components['schemas']['QueryParameter'];
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
type NonTerminalQueryStatusPhase =
  | 'pending'
  | 'provisioning'
  | 'running'
  | 'queued'
  | 'input-required';

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
  ['pending', 'provisioning', 'running', 'queued', 'input-required'] as const;
const QUERY_STATUS_PHASES: readonly QueryStatusPhase[] = [
  ...TERMINAL_QUERY_STATUS_PHASES,
  ...NON_TERMINAL_QUERY_STATUS_PHASES,
] as const;

const MEMORY_NOTICE_POLL_ATTEMPTS = 6;
const MEMORY_NOTICE_POLL_INTERVAL_MS = 500;

type QueryStatusWithPhase = {
  phase: string;
  response?: {
    content: string;
    raw?: string;
  };
  conditions?: Array<{
    type?: string;
    status?: string;
    message?: string;
  }>;
};

// The controller writes both memory conditions on every query whose dispatch
// completes, carrying Status "False" and a reassuring message on the healthy
// path. Their presence therefore says nothing; only Status "True" reports a
// problem. A query that failed before dispatch carries neither.
export const MEMORY_CONDITION_TYPES = [
  'MemoryUnavailable',
  'MemoryDegraded',
] as const;

export type MemoryConditionType = (typeof MEMORY_CONDITION_TYPES)[number];

export type MemoryNotice = {
  type: MemoryConditionType;
  message: string;
};

/**
 * The outcome of asking a query what it recorded about memory. `settled` false
 * means the question could not be answered — never that the answer was "no
 * problem". Callers must leave what they are showing untouched in that case,
 * or a slow status write silently clears a notice that is still true.
 */
export type MemoryNoticeLookup = {
  settled: boolean;
  notice: MemoryNotice | null;
};

const MEMORY_LOOKUP_UNSETTLED: MemoryNoticeLookup = {
  settled: false,
  notice: null,
};

const MEMORY_NOTICE_FALLBACK_MESSAGE: Record<MemoryConditionType, string> = {
  MemoryUnavailable:
    'No memory backend was reachable, so this query ran without conversation history.',
  MemoryDegraded:
    'Reading conversation history from the memory backend failed, so this query ran without prior context.',
};

/**
 * Whether a query's status carries the controller's memory verdict at all.
 *
 * Both conditions are written by the same update that writes the terminal
 * phase, so their presence — not the phase string — is the precise signal that
 * there is an answer to read. A query that failed before dispatch is terminal
 * and carries neither, and that says nothing about memory: reporting it as
 * healthy would clear a notice that is still true.
 */
export function hasMemoryCondition(status: unknown): boolean {
  if (!status || typeof status !== 'object') {
    return false;
  }
  const conditions = (status as QueryStatusWithPhase).conditions;
  if (!Array.isArray(conditions)) {
    return false;
  }
  return conditions.some(
    c =>
      c?.type !== undefined &&
      (MEMORY_CONDITION_TYPES as readonly string[]).includes(c.type),
  );
}

/**
 * Extract the memory problem a query's status reports, or null when it reports
 * none. MemoryUnavailable wins over MemoryDegraded: losing the backend
 * outright is the more useful thing to say. Only meaningful when
 * hasMemoryCondition is true.
 */
export function extractMemoryNotice(status: unknown): MemoryNotice | null {
  if (!status || typeof status !== 'object') {
    return null;
  }
  const conditions = (status as QueryStatusWithPhase).conditions;
  if (!Array.isArray(conditions)) {
    return null;
  }
  for (const type of MEMORY_CONDITION_TYPES) {
    const condition = conditions.find(c => c?.type === type);
    if (condition?.status !== 'True') {
      continue;
    }
    return {
      type,
      message:
        condition.message?.trim() || MEMORY_NOTICE_FALLBACK_MESSAGE[type],
    };
  }
  return null;
}

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
  memoryLookup?: MemoryNoticeLookup;
  messages?: Array<{
    role: string;
    content?: string;
    name?: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
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

  async getA2ATask(taskId: string) {
    return await a2aTasksService.get(taskId);
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
    input: string,
    targetType: string,
    targetName: string,
    sessionId?: string,
    conversationId?: string,
    enableStreaming?: boolean,
    timeout?: string,
    parameters?: QueryParameter[],
  ): Promise<QueryDetailResponse> {
    const queryRequest: QueryCreateRequest = {
      name: `chat-query-${generateUUID()}`,
      type: 'user',
      input,
      target: {
        type: targetType.toLowerCase(),
        name: targetName,
      },
      sessionId,
      conversationId,
      timeout,
      ...(parameters && parameters.length > 0 ? { parameters } : {}),
    };

    if (enableStreaming) {
      queryRequest.metadata = {
        annotations: {
          [ARK_ANNOTATIONS.STREAMING_ENABLED]: 'true',
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

        const validatedPhase: QueryStatusPhase = isValidQueryStatusPhase(phase)
          ? phase
          : 'unknown';

        let messages:
          | Array<{
              role: string;
              content?: string;
              name?: string;
              tool_calls?: Array<{
                id: string;
                type: string;
                function: { name: string; arguments: string };
              }>;
              tool_call_id?: string;
            }>
          | undefined;

        if (statusWithPhase.response?.raw) {
          try {
            messages = JSON.parse(statusWithPhase.response.raw);
          } catch (error) {
            console.error('Failed to parse raw messages:', error);
          }
        }

        return {
          terminal: isTerminalPhase(validatedPhase),
          status: validatedPhase,
          response: response,
          messages: messages,
          // Only when the controller's verdict is actually on the object. An
          // absent key means "nothing to say", which the caller must not read
          // as "nothing wrong".
          ...(hasMemoryCondition(status)
            ? {
                memoryLookup: {
                  settled: true,
                  notice: extractMemoryNotice(status),
                },
              }
            : {}),
        };
      }

      return { status: 'unknown', terminal: true };
    } catch {
      return { status: 'error', terminal: true };
    }
  },

  /**
   * Poll a query until its memory verdict appears, then report it. The
   * streaming path needs this rather than reading the query once: the executor
   * closes the stream before the controller writes the terminal status, so the
   * conditions are not on the resource yet when the last chunk arrives. The
   * paths that already hold a terminal response read `memoryLookup` off it
   * instead.
   *
   * Returns an unsettled lookup when the budget runs out, when every read
   * failed, or when the query settled without a verdict. A transient error does
   * not end the attempts — one bad response inside the window must not be
   * reported as a clean bill of health.
   */
  async resolveMemoryNotice(
    queryName: string,
    attempts: number = MEMORY_NOTICE_POLL_ATTEMPTS,
    delayMs: number = MEMORY_NOTICE_POLL_INTERVAL_MS,
  ): Promise<MemoryNoticeLookup> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      let status: QueryDetailResponse['status'];
      try {
        status = (await this.getQuery(queryName))?.status;
      } catch {
        continue;
      }
      if (hasMemoryCondition(status)) {
        return {settled: true, notice: extractMemoryNotice(status)};
      }
    }
    return MEMORY_LOOKUP_UNSETTLED;
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

  async startStreamChatResponse(
    input: string,
    targetType: string,
    targetName: string,
    sessionId?: string,
    conversationId?: string,
    timeout?: string,
    abortSignal?: AbortSignal,
    parameters?: QueryParameter[],
  ): Promise<{
    queryName: string;
    chunks: AsyncGenerator<Record<string, unknown>, void, unknown>;
  }> {
    const query = await this.submitChatQuery(
      input,
      targetType,
      targetName,
      sessionId,
      conversationId,
      true,
      timeout,
      parameters,
    );

    const queryName = query.name;
    const self = this;

    async function* generateChunks(): AsyncGenerator<
      Record<string, unknown>,
      void,
      unknown
    > {
      const response = await fetch(
        apiUrl(`/api/v1/broker/chunks?watch=true&query-id=${queryName}`),
        {
          signal: abortSignal,
        },
      );

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

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const chunk = self.parseSSEChunk(line);
            if (chunk) {
              yield chunk;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    return { queryName, chunks: generateChunks() };
  },

  async *streamChatResponse(
    input: string,
    targetType: string,
    targetName: string,
    sessionId?: string,
    conversationId?: string,
    timeout?: string,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const { chunks } = await this.startStreamChatResponse(
      input,
      targetType,
      targetName,
      sessionId,
      conversationId,
      timeout,
      abortSignal,
    );
    yield* chunks;
  },

  async cancelQuery(queryName: string): Promise<QueryDetailResponse> {
    return await apiClient.patch(`/api/v1/queries/${queryName}/cancel`);
  },
};
