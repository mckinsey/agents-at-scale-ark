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
  variant?: 'card' | 'tree';
  className?: string;
}

export function ToolCall({ toolCall, variant = 'card', className }: Readonly<ToolCallProps>) {
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

  if (variant === 'tree') {
    return (
      <div className={`relative pl-6 text-sm ${className || ''}`}>
        <div className="absolute left-0 top-0 h-[18px] w-[2px] bg-border/50"></div>
        <div className="absolute left-0 top-[18px] w-4 h-[2px] bg-border/50"></div>
        <div className="flex items-center gap-2 py-1.5 pl-2">
          <Wrench className="text-muted-foreground h-4 w-4 flex-shrink-0" />
          <span className="font-semibold">{toolCall.function.name}</span>
        </div>

        <div className="mt-1 space-y-1 pl-2">
          <div className="relative">
            <div className="absolute left-0 top-0 h-[14px] w-[2px] bg-border/50"></div>
            <div className="absolute left-0 top-[14px] w-3 h-[2px] bg-border/50"></div>
            <button
              onClick={() => setIsInputExpanded(!isInputExpanded)}
              className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors pl-4">
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
              <div className="mt-1 pl-5">
                {parseArgsError ? (
                  <pre className="overflow-x-auto p-2 text-xs">
                    {toolCall.function.arguments}
                  </pre>
                ) : (
                  <pre className="overflow-x-auto p-2 text-xs">
                    {JSON.stringify(parsedArgs, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>

          {toolCall.result && (
            <div className="relative">
              <div className="absolute left-0 top-0 h-[14px] w-[2px] bg-border/50"></div>
              <div className="absolute left-0 top-[14px] w-3 h-[2px] bg-border/50"></div>
              <button
                onClick={() => setIsOutputExpanded(!isOutputExpanded)}
                className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors pl-4">
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
                <div className="mt-1 pl-5">
                  {parseResultError ? (
                    <pre className="overflow-x-auto p-2 text-xs">
                      {toolCall.result}
                    </pre>
                  ) : (
                    <pre className="overflow-x-auto p-2 text-xs">
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

  // Default 'card' variant
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
