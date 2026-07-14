'use client';

import { RotateCcw, SendHorizontal, Sparkles, Zap } from 'lucide-react';

import { ChatMessage } from '@/components/chat/chat-message';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ARGO_MAKE_AUTHOR_AGENT_NAME } from '@/lib/constants/argo-make';

import { StudioChatGate } from './studio-chat-gate';
import { type UseStudioChatReturn } from './use-studio-chat';

const EXAMPLE_PROMPT =
  'Build a workflow to check HR tickets, categorise them, then send each to the right department';

interface StudioChatEmptyStateProps {
  onExample: (value: string) => void;
  disabled: boolean;
}

function StudioChatEmptyState({
  onExample,
  disabled,
}: StudioChatEmptyStateProps) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
      data-testid="studio-chat-empty">
      <Sparkles className="text-muted-foreground h-7 w-7" />
      <p className="text-foreground text-sm font-medium">
        Describe your workflow
      </p>
      <p className="text-muted-foreground text-sm">
        The argo-make-author agent drafts an Argo WorkflowTemplate live as you
        chat.
      </p>
      <div className="mt-1 flex max-w-xs flex-col gap-2.5 text-left">
        <div className="flex items-start gap-2.5">
          <span className="bg-muted text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs">
            1
          </span>
          <span className="text-muted-foreground text-sm">
            Say what to build in plain language
          </span>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="bg-muted text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs">
            2
          </span>
          <span className="text-muted-foreground text-sm">
            The agent drafts it live
          </span>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="bg-muted text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs">
            3
          </span>
          <span className="text-muted-foreground text-sm">
            Edit the <span className="text-foreground">YAML</span>, then{' '}
            <span className="text-foreground">Save</span> your changes &mdash;
            it&apos;s already in your workflows
          </span>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onExample(EXAMPLE_PROMPT)}
        data-testid="studio-chat-example"
        className="bg-secondary text-foreground hover:bg-accent inline-flex items-center gap-2 border px-3 py-2 text-left text-sm disabled:opacity-50">
        <Zap className="text-muted-foreground h-4 w-4 shrink-0" />
        e.g. Build a workflow to check HR tickets, categorise them, then send
        each to the right department
      </button>
    </div>
  );
}

export interface StudioChatPanelProps {
  chat: UseStudioChatReturn;
  gated: boolean;
  agentMissing: boolean;
  agentNotReady: boolean;
  mcpMissing: boolean;
  mcpNotReady: boolean;
}

export function StudioChatPanel({
  chat,
  gated,
  agentMissing,
  agentNotReady,
  mcpMissing,
  mcpNotReady,
}: StudioChatPanelProps) {
  const composerDisabled = chat.composerDisabled || gated;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!composerDisabled) {
        void chat.send();
      }
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {gated && (
        <StudioChatGate
          agentMissing={agentMissing}
          agentNotReady={agentNotReady}
          mcpMissing={mcpMissing}
          mcpNotReady={mcpNotReady}
        />
      )}

      <div
        className="min-h-0 flex-1 overflow-auto p-4"
        data-testid="studio-chat-transcript">
        {chat.messages.length === 0 ? (
          <StudioChatEmptyState
            onExample={chat.setInput}
            disabled={composerDisabled}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {chat.messages.map(message => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                viewMode="markdown"
                defaultCodeCollapsed
                status={message.status}
                sender={
                  message.role === 'assistant'
                    ? ARGO_MAKE_AUTHOR_AGENT_NAME
                    : undefined
                }
                toolCalls={chat.showToolCalls ? message.toolCalls : undefined}
              />
            ))}
            {chat.isStreaming && (
              <div
                className="text-muted-foreground flex items-center gap-2 text-sm"
                data-testid="studio-chat-typing">
                <Spinner className="h-4 w-4" />
                Agent is building...
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-border shrink-0 border-t p-4">
        {chat.composerLocked && (
          <div
            className="text-muted-foreground mb-2 text-xs"
            data-testid="studio-composer-lock">
            {chat.lockReason}
          </div>
        )}
        <div className="bg-card flex items-center gap-2 border p-2">
          <Textarea
            data-testid="studio-chat-input"
            value={chat.input}
            disabled={composerDisabled}
            spellCheck={false}
            onChange={event => chat.setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message workflow builder agent"
            className="max-h-40 min-h-[40px] flex-1 resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            size="icon"
            onClick={() => void chat.send()}
            disabled={composerDisabled || chat.input.trim() === ''}
            data-testid="studio-chat-send">
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="studio-show-tool-calls"
              checked={chat.showToolCalls}
              onCheckedChange={chat.setShowToolCalls}
              data-testid="studio-show-tool-calls"
            />
            <Label
              htmlFor="studio-show-tool-calls"
              className="text-muted-foreground text-xs">
              Show tool calls
            </Label>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={chat.newConversation}
            data-testid="studio-new-conversation">
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset chat
          </Button>
        </div>
      </div>
    </div>
  );
}
