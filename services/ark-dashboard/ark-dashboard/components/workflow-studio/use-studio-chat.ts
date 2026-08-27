'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ToolCallData } from '@/components/chat/tool-call';
import { ARGO_MAKE_AUTHOR_AGENT_NAME } from '@/lib/constants/argo-make';
import { chatService } from '@/lib/services/chat';
import { useNamespace } from '@/providers/NamespaceProvider';
import type { ConversationMessage } from '@/lib/services/conversations';
import { studioChatHistoryService } from '@/lib/services/studio-chat-history';
import type {
  ArkCompletedQueryData,
  ArkExtendedChunk,
} from '@/lib/types/chat-message';
import { extractWorkflowYaml } from '@/lib/utils/extract-workflow-yaml';
import { generateUUID } from '@/lib/utils/uuid';

export interface StudioChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallData[];
  status?: 'failed';
}

export interface UseStudioChatParams {
  draftYaml: string;
  lastAgentYaml: string | undefined;
  commitAgentYaml: (value: string) => void;
  building: boolean;
  setBuilding: (value: boolean) => void;
  isDirty: boolean;
  handEdited: boolean;
  sessionId?: string;
  resumeConversation?: boolean;
  timeout?: string;
}

export interface UseStudioChatReturn {
  messages: StudioChatMessage[];
  input: string;
  setInput: (value: string) => void;
  send: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  isStreaming: boolean;
  showToolCalls: boolean;
  setShowToolCalls: (value: boolean) => void;
  newConversation: () => void;
  composerLocked: boolean;
  composerDisabled: boolean;
  inputDisabled: boolean;
  lockReason: string | undefined;
  historyLoading: boolean;
}

const LOCK_REASON = 'Save your YAML changes to continue chatting';

function buildDispatchInput(
  typedText: string,
  draftYaml: string,
  lastAgentYaml: string | undefined,
): string {
  const shouldPrepend = draftYaml.trim() !== '' && draftYaml !== lastAgentYaml;
  if (!shouldPrepend) {
    return typedText;
  }
  return `Here is the current workflow template I am editing:\n\n\`\`\`yaml\n${draftYaml}\n\`\`\`\n\n${typedText}`;
}

const WORKFLOW_PREAMBLE_PATTERN =
  /^Here is the current workflow template I am editing:\n\n```yaml\n[\s\S]*?\n```\n\n/;

export function stripWorkflowPreamble(content: string): string {
  return content.replace(WORKFLOW_PREAMBLE_PATTERN, '');
}

function toStudioToolCalls(
  toolCalls: ConversationMessage['message']['tool_calls'],
  toolResults: Map<string, string>,
): ToolCallData[] | undefined {
  if (!toolCalls || toolCalls.length === 0) {
    return undefined;
  }
  return toolCalls.map(toolCall => ({
    id: toolCall.id,
    type: 'function',
    function: {
      name: toolCall.function.name,
      arguments: toolCall.function.arguments,
    },
    result: toolResults.get(toolCall.id),
  }));
}

function historyToStudioMessages(
  items: ConversationMessage[],
): StudioChatMessage[] {
  const toolResults = new Map<string, string>();
  for (const item of items) {
    const message = item.message;
    if (message?.role === 'tool' && message.tool_call_id && message.content) {
      toolResults.set(message.tool_call_id, message.content);
    }
  }

  const studioMessages: StudioChatMessage[] = [];
  for (const item of items) {
    const message = item.message;
    if (!message) {
      continue;
    }
    const role = message.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') {
      continue;
    }
    const rawContent = message.content ?? '';
    studioMessages.push({
      id: generateUUID(),
      role,
      content: role === 'user' ? stripWorkflowPreamble(rawContent) : rawContent,
      toolCalls: toStudioToolCalls(message.tool_calls, toolResults),
    });
  }
  return studioMessages;
}

interface StreamAccumulator {
  assistantText: string;
  toolCalls: ToolCallData[];
  conversationId?: string;
  hadError: boolean;
  errorMessage: string;
}

type ToolCallDelta = {
  id?: string;
  function?: { name?: string; arguments?: string };
};

type ChunkOutcome = 'skip' | 'break' | 'update';

function mergeToolCallDeltas(
  toolCalls: ToolCallData[],
  deltas: ToolCallDelta[],
): void {
  for (const toolCallDelta of deltas) {
    let existingIndex = -1;
    if (toolCallDelta.id) {
      existingIndex = toolCalls.findIndex(tc => tc.id === toolCallDelta.id);
    }
    if (existingIndex === -1 && toolCallDelta.function?.name) {
      toolCalls.push({
        id: toolCallDelta.id || '',
        type: 'function',
        function: {
          name: toolCallDelta.function.name,
          arguments: '',
        },
      });
      existingIndex = toolCalls.length - 1;
    }
    if (existingIndex === -1) {
      continue;
    }
    if (toolCallDelta.id) {
      toolCalls[existingIndex].id = toolCallDelta.id;
    }
    if (toolCallDelta.function?.arguments) {
      toolCalls[existingIndex].function.arguments +=
        toolCallDelta.function.arguments;
    }
  }
}

function applyCompletionData(
  acc: StreamAccumulator,
  completedQuery: ArkCompletedQueryData['completedQuery'],
): void {
  const status = completedQuery?.status;
  if (status?.conversationId) {
    acc.conversationId = status.conversationId;
  }
  if (status?.phase === 'error') {
    acc.hadError = true;
    acc.errorMessage = status.response?.content || 'Query failed';
  }
}

function handleStreamChunk(
  acc: StreamAccumulator,
  typedChunk: ArkExtendedChunk,
): ChunkOutcome {
  if ('type' in typedChunk && typedChunk.type === 'tool_approval_request') {
    return 'skip';
  }

  if ('error' in typedChunk && typedChunk.error) {
    acc.hadError = true;
    acc.errorMessage = typedChunk.error.message || 'An error occurred';
    return 'break';
  }

  if (
    'id' in typedChunk &&
    typedChunk.id === 'chatcmpl-final' &&
    'ark' in typedChunk &&
    typedChunk.ark
  ) {
    applyCompletionData(acc, typedChunk.ark.completedQuery);
    if (acc.hadError) {
      return 'break';
    }
  }

  const delta =
    'choices' in typedChunk ? typedChunk.choices?.[0]?.delta : undefined;

  if (delta?.content) {
    acc.assistantText += delta.content;
  }

  if (delta?.tool_calls) {
    mergeToolCallDeltas(acc.toolCalls, delta.tool_calls);
  }

  return 'update';
}

export function useStudioChat({
  draftYaml,
  lastAgentYaml,
  commitAgentYaml,
  building,
  setBuilding,
  isDirty,
  handEdited,
  sessionId,
  resumeConversation,
  timeout,
}: UseStudioChatParams): UseStudioChatReturn {
  const { namespace } = useNamespace();
  const [messages, setMessages] = useState<StudioChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(true);
  const [historyLoading, setHistoryLoading] = useState<boolean>(
    Boolean(resumeConversation && sessionId),
  );

  const fallbackSessionIdRef = useRef<string>(`argo-make-${generateUUID()}`);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const hydratedSessionRef = useRef<string | undefined>(undefined);

  const composerLocked = handEdited && isDirty && !building;
  const inputDisabled = building || isStreaming;
  const composerDisabled = inputDisabled || composerLocked;
  const lockReason = composerLocked ? LOCK_REASON : undefined;

  useEffect(() => {
    if (!resumeConversation || !sessionId) {
      setHistoryLoading(false);
      return;
    }
    if (hydratedSessionRef.current === sessionId) {
      setHistoryLoading(false);
      return;
    }
    let active = true;
    setHistoryLoading(true);
    void studioChatHistoryService.load(sessionId).then(history => {
      if (!active) {
        return;
      }
      hydratedSessionRef.current = sessionId;
      if (history) {
        if (conversationIdRef.current === undefined) {
          conversationIdRef.current = history.conversationId;
        }
        setMessages(prev =>
          prev.length === 0 ? historyToStudioMessages(history.messages) : prev,
        );
      }
      setHistoryLoading(false);
    });
    return () => {
      active = false;
    };
  }, [resumeConversation, sessionId]);

  const newConversation = useCallback(() => {
    if (!sessionId) {
      fallbackSessionIdRef.current = `argo-make-${generateUUID()}`;
    }
    conversationIdRef.current = undefined;
    setMessages([]);
    setInput('');
  }, [sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const typedText = text.trim();
      if (!typedText || building || isStreaming) {
        return;
      }

      const dispatchInput = buildDispatchInput(
        typedText,
        draftYaml,
        lastAgentYaml,
      );

      const assistantId = generateUUID();
      setMessages(prev => [
        ...prev,
        { id: generateUUID(), role: 'user', content: typedText },
        { id: assistantId, role: 'assistant', content: '' },
      ]);
      setBuilding(true);
      setIsStreaming(true);

      const acc: StreamAccumulator = {
        assistantText: '',
        toolCalls: [],
        hadError: false,
        errorMessage: '',
      };

      const updateAssistant = () => {
        setMessages(prev =>
          prev.map(message =>
            message.id === assistantId
              ? {
                  ...message,
                  content: acc.assistantText,
                  toolCalls:
                    acc.toolCalls.length > 0 ? [...acc.toolCalls] : undefined,
                }
              : message,
          ),
        );
      };

      try {
        const activeSessionId = sessionId ?? fallbackSessionIdRef.current;
        const { chunks } = await chatService.startStreamChatResponse(
          namespace,
          dispatchInput,
          'agent',
          ARGO_MAKE_AUTHOR_AGENT_NAME,
          activeSessionId,
          conversationIdRef.current,
          timeout,
        );

        for await (const chunk of chunks) {
          const outcome = handleStreamChunk(
            acc,
            chunk as unknown as ArkExtendedChunk,
          );
          if (outcome === 'skip') {
            continue;
          }
          if (outcome === 'break') {
            break;
          }
          updateAssistant();
        }

        if (acc.conversationId) {
          conversationIdRef.current = acc.conversationId;
        }

        if (acc.hadError) {
          setMessages(prev =>
            prev.map(message =>
              message.id === assistantId
                ? { ...message, content: acc.errorMessage, status: 'failed' }
                : message,
            ),
          );
          return;
        }

        updateAssistant();

        const extraction = extractWorkflowYaml(acc.assistantText);
        if (extraction.ok) {
          commitAgentYaml(extraction.yaml);
        } else if (extraction.reason === 'invalid') {
          toast.error('The agent produced invalid YAML', {
            description: extraction.error,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to reach the agent';
        setMessages(prev =>
          prev.map(item =>
            item.id === assistantId
              ? { ...item, content: message, status: 'failed' }
              : item,
          ),
        );
      } finally {
        setBuilding(false);
        setIsStreaming(false);
      }
    },
    [
      building,
      isStreaming,
      draftYaml,
      lastAgentYaml,
      namespace,
      setBuilding,
      sessionId,
      timeout,
      commitAgentYaml,
    ],
  );

  const send = useCallback(async () => {
    if (input.trim() === '' || composerDisabled) {
      return;
    }
    const text = input;
    setInput('');
    await sendMessage(text);
  }, [input, composerDisabled, sendMessage]);

  return useMemo(
    () => ({
      messages,
      input,
      setInput,
      send,
      sendMessage,
      isStreaming,
      showToolCalls,
      setShowToolCalls,
      newConversation,
      composerLocked,
      composerDisabled,
      inputDisabled,
      lockReason,
      historyLoading,
    }),
    [
      messages,
      input,
      send,
      sendMessage,
      isStreaming,
      showToolCalls,
      newConversation,
      composerLocked,
      composerDisabled,
      inputDisabled,
      lockReason,
      historyLoading,
    ],
  );
}
