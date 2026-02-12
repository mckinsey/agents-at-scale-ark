import { AlertCircle } from 'lucide-react';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { RefObject } from 'react';

import { ChatMessage } from '@/components/chat/chat-message';
import { StrategyIndicator } from '@/components/chat/strategy-indicator';
import { TerminationEvent } from '@/components/chat/termination-event';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';

interface ChatMessageListProps {
  messages: ExtendedChatMessage[];
  type: string;
  strategy?: string;
  debugMode: boolean;
  isProcessing: boolean;
  error: string | null;
  viewMode?: 'text' | 'markdown';
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

export function ChatMessageList({
  messages,
  type,
  strategy,
  debugMode,
  isProcessing,
  error,
  viewMode = 'markdown',
  messagesEndRef,
}: Readonly<ChatMessageListProps>) {
  return (
    <>
      {error && (
        <div className="text-destructive bg-destructive/10 flex items-center gap-2 rounded-md p-3 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {messages.length === 0 && !error && (
        <div className="text-muted-foreground py-8 text-center">
          Start a conversation with the {type}
        </div>
      )}

      {strategy && messages.length > 0 && (
        <StrategyIndicator strategy={strategy} />
      )}

      {messages.map((message, index) => {
        const msg = message as ChatCompletionMessageParam;
        if (msg.role === 'tool') {
          return null;
        }

        let content = '';
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          content = msg.content
            .filter(
              part =>
                typeof part === 'object' &&
                part !== null &&
                'type' in part &&
                part.type === 'text',
            )
            .map(part =>
              typeof part === 'object' && part !== null && 'text' in part
                ? part.text
                : '',
            )
            .join('\n');
        }

        const toolCalls = 'tool_calls' in msg ? msg.tool_calls : undefined;

        const senderName = 'name' in msg ? msg.name : undefined;

        const toolCallsWithResults = toolCalls?.map(toolCall => {
          const toolResultMessage = messages
            .slice(index + 1)
            .find(
              m =>
                (m as ChatCompletionMessageParam).role === 'tool' &&
                'tool_call_id' in m &&
                (m as { tool_call_id: string }).tool_call_id === toolCall.id,
            ) as ChatCompletionMessageParam | undefined;

          return {
            ...toolCall,
            result:
              toolResultMessage && typeof toolResultMessage.content === 'string'
                ? toolResultMessage.content
                : undefined,
          };
        });

        const terminateToolCall = toolCallsWithResults?.find(tc => {
          if ('function' in tc && tc.function) {
            return tc.function.name === 'terminate';
          }
          return false;
        });

        let terminateMessage: string | undefined;
        if (terminateToolCall && 'function' in terminateToolCall) {
          try {
            const args = JSON.parse(terminateToolCall.function.arguments);
            if (typeof args.response === 'string') {
              terminateMessage = args.response;
            }
          } catch {
            // fall through
          }
        }

        const isMaxTurnsMessage =
          msg.role === 'system' && content.includes('maximum turns limit');

        const hasToolCalls =
          debugMode && toolCallsWithResults && toolCallsWithResults.length > 0;
        const hasContent =
          content && content.trim().length > 0 && !isMaxTurnsMessage;
        const hasTermination = terminateToolCall !== undefined;

        if (
          !hasToolCalls &&
          !hasContent &&
          !hasTermination &&
          !isMaxTurnsMessage
        ) {
          return null;
        }

        return (
          <div key={index} className="flex flex-col gap-2">
            {hasToolCalls &&
              toolCallsWithResults.map((toolCall, toolIndex) => (
                <div key={`${index}-tool-${toolIndex}`}>
                  <ChatMessage
                    role="assistant"
                    content=""
                    viewMode={viewMode}
                    toolCalls={[
                      toolCall as {
                        id: string;
                        type: 'function';
                        function: { name: string; arguments: string };
                        result?: string;
                      },
                    ]}
                  />
                </div>
              ))}
            {hasContent && (
              <ChatMessage
                role={msg.role as 'user' | 'assistant' | 'system'}
                content={content}
                viewMode={viewMode}
                sender={senderName}
                status={message.metadata?.status}
                queryName={message.metadata?.queryName}
              />
            )}
            {hasTermination && (
              <div className="mt-2 flex flex-col gap-2">
                <TerminationEvent agentName={senderName || 'Unknown Agent'} />
                {terminateMessage && (
                  <ChatMessage
                    role="assistant"
                    content={terminateMessage}
                    viewMode={viewMode}
                    sender={senderName}
                  />
                )}
              </div>
            )}
            {isMaxTurnsMessage && (
              <div className="text-muted-foreground text-sm italic">
                {content}
              </div>
            )}
          </div>
        );
      })}

      {isProcessing && (
        <div className="flex justify-start">
          <div className="bg-muted max-w-[80%] rounded-lg px-3 py-2">
            <div className="flex space-x-1">
              <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></div>
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                style={{ animationDelay: '0.1s' }}></div>
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </>
  );
}
