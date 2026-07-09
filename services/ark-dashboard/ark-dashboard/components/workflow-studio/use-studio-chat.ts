'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ToolCallData } from '@/components/chat/tool-call';
import { ARGO_MAKE_AUTHOR_AGENT_NAME } from '@/lib/constants/argo-make';
import { chatService } from '@/lib/services/chat';
import type { ArkExtendedChunk } from '@/lib/types/chat-message';
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
  lockReason: string | undefined;
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

export function useStudioChat({
  draftYaml,
  lastAgentYaml,
  commitAgentYaml,
  building,
  setBuilding,
  isDirty,
  handEdited,
  timeout,
}: UseStudioChatParams): UseStudioChatReturn {
  const [messages, setMessages] = useState<StudioChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(true);

  const sessionIdRef = useRef<string>(`argo-make-${generateUUID()}`);
  const conversationIdRef = useRef<string | undefined>(undefined);

  const composerLocked = handEdited && isDirty && !building;
  const composerDisabled = building || isStreaming || composerLocked;
  const lockReason = composerLocked ? LOCK_REASON : undefined;

  const newConversation = useCallback(() => {
    sessionIdRef.current = `argo-make-${generateUUID()}`;
    conversationIdRef.current = undefined;
    setMessages([]);
    setInput('');
  }, []);

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

      let assistantText = '';
      const toolCalls: ToolCallData[] = [];
      let hadError = false;
      let errorMessage = '';
      let conversationId: string | undefined;

      const updateAssistant = () => {
        setMessages(prev =>
          prev.map(message =>
            message.id === assistantId
              ? {
                  ...message,
                  content: assistantText,
                  toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
                }
              : message,
          ),
        );
      };

      try {
        const { chunks } = await chatService.startStreamChatResponse(
          dispatchInput,
          'agent',
          ARGO_MAKE_AUTHOR_AGENT_NAME,
          sessionIdRef.current,
          conversationIdRef.current,
          timeout,
        );

        for await (const chunk of chunks) {
          const typedChunk = chunk as unknown as ArkExtendedChunk;

          if (
            'type' in typedChunk &&
            typedChunk.type === 'tool_approval_request'
          ) {
            continue;
          }

          if ('error' in typedChunk && typedChunk.error) {
            hadError = true;
            errorMessage = typedChunk.error.message || 'An error occurred';
            break;
          }

          if (
            'id' in typedChunk &&
            typedChunk.id === 'chatcmpl-final' &&
            'ark' in typedChunk &&
            typedChunk.ark
          ) {
            const arkData = typedChunk.ark;
            const returnedConversationId =
              arkData.completedQuery?.status?.conversationId;
            if (returnedConversationId) {
              conversationId = returnedConversationId;
            }
            if (arkData.completedQuery?.status?.phase === 'error') {
              hadError = true;
              errorMessage =
                arkData.completedQuery.status.response?.content ||
                'Query failed';
              break;
            }
          }

          const delta =
            'choices' in typedChunk
              ? typedChunk.choices?.[0]?.delta
              : undefined;

          if (delta?.content) {
            assistantText += delta.content;
          }

          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              let existingIndex = -1;
              if (toolCallDelta.id) {
                existingIndex = toolCalls.findIndex(
                  tc => tc.id === toolCallDelta.id,
                );
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
              if (existingIndex !== -1) {
                if (toolCallDelta.id) {
                  toolCalls[existingIndex].id = toolCallDelta.id;
                }
                if (toolCallDelta.function?.arguments) {
                  toolCalls[existingIndex].function.arguments +=
                    toolCallDelta.function.arguments;
                }
              }
            }
          }

          updateAssistant();
        }

        if (conversationId) {
          conversationIdRef.current = conversationId;
        }

        if (hadError) {
          setMessages(prev =>
            prev.map(message =>
              message.id === assistantId
                ? { ...message, content: errorMessage, status: 'failed' }
                : message,
            ),
          );
          return;
        }

        updateAssistant();

        const extraction = extractWorkflowYaml(assistantText);
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
      setBuilding,
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
      lockReason,
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
      lockReason,
    ],
  );
}
