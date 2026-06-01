'use client';

import { useState } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { IconShell } from '@/components/ui/icon-shell';
import { ChevronRight, ErrorIcon } from '@/components/icons';
import { SmartToy } from '@/components/icons/smart-toy';
import { Handyman } from '@/components/icons/handyman';
import { type ToolCallData } from '@/components/chat/tool-call';
import { cn } from '@/lib/utils';

interface SessionMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallData[];
  sender?: string;
  timestamp?: string;
  className?: string;
  showToolCalls?: boolean;
}

function hasToolError(toolCall: ToolCallData): boolean {
  if (!toolCall.result) return false;
  const result = toolCall.result.toLowerCase();
  return result.includes('error') || result.includes('failed') || result.includes('exception');
}

function getToolIconColor(toolCall: ToolCallData): string {
  return hasToolError(toolCall)
    ? 'bg-status-error/10 text-status-error'
    : 'bg-viz-categorical-08/5 text-viz-categorical-08';
}

function ToolCallTreeItem({ toolCall }: { toolCall: ToolCallData }) {
  const [inputOpen, setInputOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const toolColor = getToolIconColor(toolCall);
  const toolName = toolCall.function?.name || 'Unknown';
  const toolInput = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : undefined;
  const hasOutput = !!toolCall.result;

  return (
    <div className="flex flex-col gap-0">
      {/* Tool name row */}
      <div className="flex items-start gap-0 h-9">
        <div className="w-8 h-5 border-l border-b border-stroke-divider -ml-3" />
        <div className="flex items-center gap-2 mt-2 -ml-3">
          <IconShell size="sm" className={cn('size-6', toolColor)}>
            <Handyman className="size-4" />
          </IconShell>
          <span className="text-fg-primary text-sm leading-5">{toolName}</span>
        </div>
      </div>

      {/* Input/Output container with additional indentation */}
      <div className="flex flex-col gap-0 pl-5">
        {/* Input section */}
        <div className="flex gap-0">
          <div className="w-5 h-5 min-h-5 border-l border-b border-stroke-divider" />
          <div className="flex-1">
            <Collapsible open={inputOpen} onOpenChange={setInputOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 p-2 text-left hover:bg-stateslayer-overlay-hover transition-colors w-full">
                <IconShell size="sm" className={cn('transition-transform', inputOpen && 'rotate-90')}>
                  <ChevronRight />
                </IconShell>
                <span className="text-fg-secondary text-sm leading-5">Input</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pl-6 p-2">
                  <pre className="text-fg-tertiary text-xs leading-4 whitespace-pre-wrap break-words overflow-hidden">
                    {JSON.stringify(toolInput, null, 2)}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        {/* Output section */}
        {hasOutput && (
          <div className="flex gap-0">
            <div className="w-5 h-5 min-h-5 border-l border-b border-stroke-divider rounded-bl" />
            <div className="flex-1">
              <Collapsible open={outputOpen} onOpenChange={setOutputOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 p-2 text-left hover:bg-stateslayer-overlay-hover transition-colors w-full">
                  <IconShell size="sm" className={cn('transition-transform', outputOpen && 'rotate-90')}>
                    <ChevronRight />
                  </IconShell>
                  <span className="text-fg-secondary text-sm leading-5">Output</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-6 p-2">
                    <pre className="text-fg-tertiary text-xs leading-4 whitespace-pre-wrap break-words overflow-hidden">
                      {toolCall.result}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        )}
      </div>
    </div>
  );
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

  // User messages - right aligned
  if (isUser) {
    return (
      <div className={cn('flex flex-col pr-3 pb-2 items-end gap-1', className)}>
        <div className="max-w-[56%] p-3 bg-surface-bg-tertiary">
          <div className="text-fg-primary text-sm font-normal leading-5">
            {content}
          </div>
        </div>
      </div>
    );
  }

  // System messages (assistant without sender)
  if (isAssistantWithoutName) {
    if (hasContent) {
      return (
        <div className={cn('flex flex-col items-start', className)}>
          <div className="pl-4 text-sm max-w-[80%]">
            <div className="flex items-center gap-2 py-1.5">
              <IconShell size="sm" variant="secondary" className="flex-shrink-0">
                <ErrorIcon />
              </IconShell>
              <span className="text-fg-secondary text-xs font-medium">System</span>
            </div>
            <div className="mt-1 pl-6">
              <pre className="overflow-hidden p-2 text-xs text-fg-tertiary whitespace-pre-wrap break-words">
                {content}
              </pre>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  // Agent messages with sender
  return (
    <div className={cn('flex flex-col', className)}>
      {/* Agent header row */}
      <div className="flex items-start gap-2">
        <IconShell size="sm" className="size-6 bg-brand-accents-qb-accent/10 text-brand-accents-qb-accent">
          <SmartToy className="size-4" />
        </IconShell>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-fg-primary text-sm font-normal leading-5 line-clamp-1">
              {sender}
            </span>
            {timestamp && (
              <span className="text-fg-tertiary text-xs font-normal leading-4">
                {new Date(timestamp).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                })}
              </span>
            )}
          </div>
          {hasContent && (
            <div className="text-fg-secondary text-sm font-normal leading-5">
              {content}
            </div>
          )}
        </div>
      </div>

      {/* Tool calls tree - indented to align with center of icon */}
      {hasToolCalls && showToolCalls && (
        <div className="pl-3 flex flex-col gap-2 relative mt-2">
          {/* Vertical line at 12px - only extends to first tool's connector */}
          <div className="absolute left-3 top-0 w-px bg-stroke-divider h-2" />

          {/* Tool items */}
          <div className="pl-3 flex flex-col gap-2">
            {toolCalls.map(toolCall => (
              <ToolCallTreeItem key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
