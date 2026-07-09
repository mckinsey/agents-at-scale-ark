'use client';

import { Plus, Sparkles } from 'lucide-react';

import { ChatMessage } from '@/components/chat/chat-message';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { StudioChatGate } from './studio-chat-gate';
import { type UseStudioChatReturn } from './use-studio-chat';

const EXAMPLE_PROMPT =
  'Build a workflow that summarizes a document, then extracts action items.';

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
      className="text-muted-foreground flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
      data-testid="studio-chat-empty">
      <Sparkles className="h-8 w-8" />
      <div>
        <p className="text-foreground text-sm font-medium">
          Describe your workflow
        </p>
        <ol className="mt-2 space-y-1 text-xs">
          <li>1. Tell the agent what you want to build.</li>
          <li>2. Review the generated diagram and YAML.</li>
          <li>3. Iterate, then save when you are happy.</li>
        </ol>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onExample(EXAMPLE_PROMPT)}
        data-testid="studio-chat-example">
        Try an example
      </Button>
    </div>
  );
}

export interface StudioChatPanelProps {
  chat: UseStudioChatReturn;
  gated: boolean;
  agentMissing: boolean;
  mcpMissing: boolean;
}

export function StudioChatPanel({
  chat,
  gated,
  agentMissing,
  mcpMissing,
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
        <StudioChatGate agentMissing={agentMissing} mcpMissing={mcpMissing} />
      )}

      <div className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
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
          <Plus className="mr-1 h-4 w-4" />
          New conversation
        </Button>
      </div>

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
                  message.role === 'assistant' ? 'Author agent' : undefined
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
        <div className="flex items-end gap-2">
          <Textarea
            data-testid="studio-chat-input"
            value={chat.input}
            disabled={composerDisabled}
            spellCheck={false}
            onChange={event => chat.setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe a change to your workflow..."
            className="max-h-40 min-h-[44px] flex-1 resize-none text-sm"
          />
          <Button
            type="button"
            onClick={() => void chat.send()}
            disabled={composerDisabled || chat.input.trim() === ''}
            data-testid="studio-chat-send">
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
