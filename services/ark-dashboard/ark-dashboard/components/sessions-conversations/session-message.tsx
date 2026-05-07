'use client';

import { Bot, AlertCircle } from 'lucide-react';
import { ToolCall, type ToolCallData } from '@/components/chat/tool-call';

interface SessionMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallData[];
  sender?: string;
  timestamp?: string;
  className?: string;
  showToolCalls?: boolean;
}

export function SessionMessage({
  role,
  content,
  toolCalls,
  sender,
  timestamp,
  className,
  showToolCalls = false,
}: Readonly<SessionMessageProps>) {
  const isUser = role === 'user';
  const isAssistantWithoutName = role === 'assistant' && !sender;

  const hasContent = content && content.trim().length > 0;
  const hasToolCalls = toolCalls && toolCalls.length > 0;

  // Hide messages that only have tool calls when showToolCalls is false
  if (!hasContent && hasToolCalls && !showToolCalls) {
    return null;
  }

  const containerClasses = `flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'} ${className || ''}`;

  // Assistant messages without sender name → Display as tool/system message
  if (isAssistantWithoutName) {
    if (hasContent) {
      return (
        <div className={containerClasses}>
          <div className="pl-4 text-sm max-w-[80%]">
            <div className="flex items-center gap-2 py-1.5">
              <AlertCircle className="text-muted-foreground h-4 w-4 flex-shrink-0" />
              <span className="text-muted-foreground text-xs font-medium">System</span>
            </div>
            <div className="mt-1 pl-6">
              <pre className="overflow-x-auto p-2 text-xs">
                {content}
              </pre>
            </div>
          </div>
        </div>
      );
    }
    // Assistant without name and no content - show bare tool calls if any
    if (hasToolCalls && showToolCalls) {
      return (
        <div className={containerClasses}>
          <div className="flex w-full max-w-[80%] flex-col gap-3">
            {toolCalls.map(toolCall => (
              <ToolCall key={toolCall.id} toolCall={toolCall} variant="tree" />
            ))}
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={containerClasses}>
      <div className={`max-w-[80%] px-3 py-2 ${isUser ? 'bg-secondary' : ''}`}>
        <div className="flex flex-col gap-3">
          {sender && !isUser && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
              <Bot className="h-4 w-4 flex-shrink-0" />
              <span>{sender}</span>
              {timestamp && (
                <span className="opacity-70">
                  {new Date(timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                  })}
                </span>
              )}
            </div>
          )}
          {hasContent && (
            <div className="min-w-0 flex-1">
              <pre className="m-0 border-0 bg-transparent p-0 font-mono text-sm whitespace-pre-wrap">
                {content}
              </pre>
            </div>
          )}
          {hasToolCalls && showToolCalls && (
            <div className="flex w-full flex-col gap-3">
              {toolCalls.map(toolCall => (
                <ToolCall key={toolCall.id} toolCall={toolCall} variant="tree" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
