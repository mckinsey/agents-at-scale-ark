'use client';

import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';

export interface ToolCallData {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolCallProps {
  toolCall: ToolCallData;
  className?: string;
}

export function ToolCall({ toolCall, className }: Readonly<ToolCallProps>) {
  const [isExpanded, setIsExpanded] = useState(false);

  let parsedArgs: Record<string, unknown> | null = null;
  let parseError = false;

  try {
    parsedArgs = JSON.parse(toolCall.function.arguments) as Record<
      string,
      unknown
    >;
  } catch {
    parseError = true;
  }

  return (
    <div
      className={`bg-card border-border rounded-lg border p-3 text-sm shadow-sm ${className || ''}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors">
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
        )}
        <Wrench className="text-muted-foreground h-4 w-4 flex-shrink-0" />
        <span className="font-semibold">{toolCall.function.name}</span>
      </button>

      {isExpanded && (
        <div className="mt-2 border-t pt-2">
          {parseError ? (
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
              {toolCall.function.arguments}
            </pre>
          ) : (
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
              {JSON.stringify(parsedArgs, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
