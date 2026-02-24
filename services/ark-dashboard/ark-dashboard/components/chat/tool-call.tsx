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
  result?: string;
}

interface ToolCallProps {
  toolCall: ToolCallData;
  className?: string;
}

export function ToolCall({ toolCall, className }: Readonly<ToolCallProps>) {
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isOutputExpanded, setIsOutputExpanded] = useState(false);

  let parsedArgs: Record<string, unknown> | null = null;
  let parseArgsError = false;

  try {
    parsedArgs = JSON.parse(toolCall.function.arguments) as Record<
      string,
      unknown
    >;
  } catch {
    parseArgsError = true;
  }

  let parsedResult: Record<string, unknown> | null = null;
  let parseResultError = false;

  if (toolCall.result) {
    try {
      parsedResult = JSON.parse(toolCall.result) as Record<string, unknown>;
    } catch {
      parseResultError = true;
    }
  }

  return (
    <div
      className={`bg-card border-border rounded-lg border p-3 text-sm shadow-sm ${className || ''}`}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Wrench className="text-muted-foreground h-4 w-4 flex-shrink-0" />
        <span className="font-semibold">{toolCall.function.name}</span>
      </div>

      <div className="mt-2 space-y-2">
        <div>
          <button
            onClick={() => setIsInputExpanded(!isInputExpanded)}
            className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors">
            {isInputExpanded ? (
              <ChevronDown className="h-3 w-3 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
            )}
            <span className="text-muted-foreground text-xs font-medium">
              Input
            </span>
          </button>
          {isInputExpanded && (
            <div className="mt-1 px-2">
              {parseArgsError ? (
                <pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs">
                  {toolCall.function.arguments}
                </pre>
              ) : (
                <pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs">
                  {JSON.stringify(parsedArgs, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {toolCall.result && (
          <div>
            <button
              onClick={() => setIsOutputExpanded(!isOutputExpanded)}
              className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors">
              {isOutputExpanded ? (
                <ChevronDown className="h-3 w-3 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 flex-shrink-0" />
              )}
              <span className="text-muted-foreground text-xs font-medium">
                Output
              </span>
            </button>
            {isOutputExpanded && (
              <div className="mt-1 px-2">
                {parseResultError ? (
                  <pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs">
                    {toolCall.result}
                  </pre>
                ) : (
                  <pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs">
                    {JSON.stringify(parsedResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
