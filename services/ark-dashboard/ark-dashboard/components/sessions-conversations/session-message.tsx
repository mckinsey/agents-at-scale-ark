'use client';

import { ToolCall, type ToolCallData } from '@/components/chat/tool-call';

interface SessionMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallData[];
  sender?: string;
  timestamp?: string;
  className?: string;
}

export function SessionMessage({
  role,
  content,
  toolCalls,
  sender,
  timestamp,
  className,
}: Readonly<SessionMessageProps>) {
  const isUser = role === 'user';

  const hasContent = content && content.trim().length > 0;
  const hasToolCalls = toolCalls && toolCalls.length > 0;

  const containerClasses = `flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'} ${className || ''}`;

  if (!hasContent && hasToolCalls) {
    return (
      <div className={containerClasses}>
        <div className="flex w-full max-w-[80%] flex-col gap-3">
          {toolCalls.map(toolCall => (
            <ToolCall key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {hasContent && (
        <div className="max-w-[80%] rounded-lg bg-muted px-3 py-2">
          <div className="flex flex-col gap-2">
            {sender && !isUser && (
              <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
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
            <div className="min-w-0 flex-1">
              <pre className="m-0 border-0 bg-transparent p-0 font-mono text-sm whitespace-pre-wrap">
                {content}
              </pre>
            </div>
          </div>
        </div>
      )}

      {hasToolCalls && (
        <div className="flex w-full max-w-[80%] flex-col gap-3">
          {toolCalls.map(toolCall => (
            <ToolCall key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}
    </div>
  );
}
