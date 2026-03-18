import { AlertCircle } from 'lucide-react';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { useMemo, useEffect } from 'react';
import type { RefObject } from 'react';

import { ChatMessage } from '@/components/chat/chat-message';
import { GraphEnd } from '@/components/chat/graph-end';
import { GraphTransition } from '@/components/chat/graph-transition';
import { MaxTurnsEvent } from '@/components/chat/max-turns-event';
import { SelectorTransition } from '@/components/chat/selector-transition';
import { StrategyIndicator } from '@/components/chat/strategy-indicator';
import { TerminationEvent } from '@/components/chat/termination-event';
import type { ExtendedChatMessage, GraphEdge } from '@/lib/types/chat-message';

interface ChatMessageListProps {
  messages: ExtendedChatMessage[];
  type: string;
  strategy?: string;
  selectorAgentName?: string;
  graphEdges?: GraphEdge[];
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
  selectorAgentName,
  graphEdges,
  debugMode,
  isProcessing,
  error,
  viewMode = 'markdown',
  messagesEndRef,
}: Readonly<ChatMessageListProps>) {
  const transitionMap = useMemo(() => {
    if (!graphEdges || graphEdges.length === 0)
      return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    for (const edge of graphEdges) {
      if (!map.has(edge.from)) {
        map.set(edge.from, new Set());
      }
      map.get(edge.from)!.add(edge.to);
    }
    return map;
  }, [graphEdges]);

  const isGraphStrategy =
    strategy === 'graph' && graphEdges && graphEdges.length > 0;
  const isSelectorStrategy = strategy === 'selector';

  const processedMessages = useMemo(() => {
    const result: Array<{
      message: ExtendedChatMessage;
      index: number;
      msg: ChatCompletionMessageParam;
      content: string;
      senderName: string | undefined;
      toolCallsWithResults:
        | Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
            result?: string;
          }>
        | undefined;
      terminateToolCall: unknown;
      terminateMessage: string | undefined;
      isMaxTurnsMessage: boolean;
      hasToolCalls: boolean;
      hasContent: boolean;
      hasTermination: boolean;
    }> = [];

    messages.forEach((message, index) => {
      const msg = message as ChatCompletionMessageParam;
      if (msg.role === 'tool') return;

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
          const args = JSON.parse(
            (terminateToolCall as { function: { arguments: string } }).function
              .arguments,
          );
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
        debugMode && !!toolCallsWithResults && toolCallsWithResults.length > 0;
      const hasContent =
        !!content && content.trim().length > 0 && !isMaxTurnsMessage;
      const hasTermination = terminateToolCall !== undefined;

      if (
        !hasToolCalls &&
        !hasContent &&
        !hasTermination &&
        !isMaxTurnsMessage
      ) {
        return;
      }

      result.push({
        message,
        index,
        msg,
        content,
        senderName,
        toolCallsWithResults: toolCallsWithResults as
          | Array<{
              id: string;
              type: 'function';
              function: { name: string; arguments: string };
              result?: string;
            }>
          | undefined,
        terminateToolCall,
        terminateMessage,
        isMaxTurnsMessage,
        hasToolCalls,
        hasContent,
        hasTermination,
      });
    });

    return result;
  }, [messages, debugMode]);


  const lastAssistantName = useMemo(() => {
    if (!isGraphStrategy) return undefined;
    for (let i = processedMessages.length - 1; i >= 0; i--) {
      const pm = processedMessages[i];
      if (pm.msg.role === 'assistant' && pm.senderName) {
        return pm.senderName;
      }
    }
    return undefined;
  }, [processedMessages, isGraphStrategy]);

  const hasTerminationOrMaxTurns = useMemo(() => {
    return processedMessages.some(
      pm => pm.hasTermination || pm.isMaxTurnsMessage,
    );
  }, [processedMessages]);

  const showGraphEnd = useMemo(() => {
    if (
      !isGraphStrategy ||
      isProcessing ||
      !lastAssistantName ||
      hasTerminationOrMaxTurns
    ) {
      return false;
    }
    const outgoing = transitionMap.get(lastAssistantName);
    return !outgoing || outgoing.size === 0;
  }, [
    isGraphStrategy,
    isProcessing,
    lastAssistantName,
    transitionMap,
    hasTerminationOrMaxTurns,
  ]);

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
        <StrategyIndicator
          strategy={strategy}
          selectorAgentName={selectorAgentName}
        />
      )}

      {processedMessages.map((pm, pmIndex) => {
        let transitionElement: React.ReactNode = null;

        if (isGraphStrategy && pm.msg.role === 'assistant' && pm.senderName) {
          for (let j = pmIndex - 1; j >= 0; j--) {
            const prev = processedMessages[j];
            if (prev.msg.role === 'assistant' && prev.senderName) {
              if (transitionMap.get(prev.senderName)?.has(pm.senderName)) {
                transitionElement = (
                  <GraphTransition from={prev.senderName} to={pm.senderName} />
                );
              }
              break;
            }
          }
        }

        if (
          isSelectorStrategy &&
          pm.msg.role === 'assistant' &&
          pm.senderName
        ) {
          transitionElement = (
            <SelectorTransition
              agentName={pm.senderName}
              selectorAgentName={selectorAgentName}
            />
          );
        }

        return (
          <div key={pm.index} className="flex flex-col gap-2">
            {transitionElement}
            {pm.hasToolCalls &&
              pm.toolCallsWithResults!.map((toolCall, toolIndex) => {
                const toolKey = `${pm.index}-tool-${toolIndex}`;
                return (
                  <div key={toolKey}>
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
                );
              })}
            {pm.hasContent && (
              <ChatMessage
                role={pm.msg.role as 'user' | 'assistant' | 'system'}
                content={pm.content}
                viewMode={viewMode}
                sender={pm.senderName}
                status={pm.message.metadata?.status}
                queryName={pm.message.metadata?.queryName}
              />
            )}
            {pm.hasTermination && (
              <div className="mt-2 flex flex-col gap-2">
                <TerminationEvent
                  agentName={pm.senderName || 'Unknown Agent'}
                />
                {pm.terminateMessage && (
                  <ChatMessage
                    role="assistant"
                    content={pm.terminateMessage}
                    viewMode={viewMode}
                    sender={pm.senderName}
                  />
                )}
              </div>
            )}
            {pm.isMaxTurnsMessage &&
              (isGraphStrategy || isSelectorStrategy ? (
                <MaxTurnsEvent message={pm.content} />
              ) : (
                <div className="text-muted-foreground text-sm italic">
                  {pm.content}
                </div>
              ))}
          </div>
        );
      })}

      {showGraphEnd && <GraphEnd />}

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
