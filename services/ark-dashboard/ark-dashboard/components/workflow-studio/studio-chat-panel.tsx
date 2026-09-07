'use client';

import { useState } from 'react';

import { ChatMessage } from '@/components/chat/chat-message';
import {
  AutoAwesome,
  ExpandContent,
  Lock,
  RestartAlt,
  Send,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ARGO_MAKE_AUTHOR_AGENT_NAME } from '@/lib/constants/argo-make';

import { PromptEditorDialog } from './prompt-editor-dialog';
import { StudioChatDisabledBanner } from './studio-chat-disabled-banner';
import { StudioChatGate } from './studio-chat-gate';
import { StudioExperimentalNotice } from './studio-experimental-notice';
import { useExperimentalNotice } from './use-experimental-notice';
import { type UseStudioChatReturn } from './use-studio-chat';

const SUGGESTION_PROMPTS = [
  'Build a workflow to check HR tickets and categorise them',
  'Create a KYC customer onboarding workflow with 4 specialized teams',
  'Build a COBOL Modernization workflow with 3 key steps',
];

interface StudioChatEmptyStateProps {
  onExample: (value: string) => void;
  disabled: boolean;
}

function StudioChatEmptyState({
  onExample,
  disabled,
}: Readonly<StudioChatEmptyStateProps>) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
      data-testid="studio-chat-empty">
      <AutoAwesome className="text-fg-secondary h-7 w-7" />
      <p className="text-fg-primary text-lg font-semibold">
        Describe your workflow
      </p>
      <p className="text-fg-secondary text-sm">
        The {ARGO_MAKE_AUTHOR_AGENT_NAME} agent drafts an argo workflow template
        live as you chat
      </p>
      <div className="mt-1 flex w-full max-w-sm flex-col gap-2.5">
        {SUGGESTION_PROMPTS.map((prompt, index) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) {
                return;
              }
              onExample(prompt);
            }}
            data-testid={`studio-chat-suggestion-${index}`}
            className="bg-fill-subtle text-fg-primary hover:bg-fill-muted focus-visible:border-stroke-status-focus focus-visible:ring-stroke-status-focus border-stroke-divider w-full border px-3 py-2 text-left text-sm outline-none focus-visible:ring-[3px] disabled:opacity-50">
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface StudioChatPanelProps {
  chat: UseStudioChatReturn;
  loading: boolean;
  gated: boolean;
  agentMissing: boolean;
  agentNotReady: boolean;
  mcpMissing: boolean;
  mcpNotReady: boolean;
  unverifiable: boolean;
}

export function StudioChatPanel({
  chat,
  loading,
  gated,
  agentMissing,
  agentNotReady,
  mcpMissing,
  mcpNotReady,
  unverifiable,
}: Readonly<StudioChatPanelProps>) {
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const experimentalNotice = useExperimentalNotice();
  const noticeBlocking = experimentalNotice.visible;
  const composerDisabled = chat.composerDisabled || gated || noticeBlocking;
  const inputDisabled = chat.inputDisabled || gated || noticeBlocking;
  const notInstalled = !unverifiable && (agentMissing || mcpMissing);
  const installedNotReady =
    !unverifiable && !notInstalled && (agentNotReady || mcpNotReady);
  const showExperimentalNotice = noticeBlocking && !unverifiable;
  const showGate = unverifiable || (notInstalled && !showExperimentalNotice);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!composerDisabled) {
        void chat.send();
      }
    }
  };

  if (loading) {
    return (
      <div
        className="text-fg-secondary flex h-full min-h-0 flex-col items-center justify-center gap-2 text-sm"
        data-testid="studio-chat-loading">
        <Spinner />
        Loading chat...
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {showGate && (
        <StudioChatGate
          agentMissing={agentMissing}
          agentNotReady={agentNotReady}
          mcpMissing={mcpMissing}
          mcpNotReady={mcpNotReady}
          unverifiable={unverifiable}
        />
      )}

      {showExperimentalNotice && (
        <StudioExperimentalNotice onDismiss={experimentalNotice.dismiss} />
      )}

      {installedNotReady && !showExperimentalNotice && (
        <StudioChatDisabledBanner
          agentNotReady={agentNotReady}
          mcpNotReady={mcpNotReady}
        />
      )}

      <div
        className={`min-h-0 flex-1 overflow-auto p-4 ${
          installedNotReady ? 'pointer-events-none opacity-50' : ''
        }`}
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
                constrainWidth
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
                className="text-fg-secondary flex items-center gap-2 text-sm"
                data-testid="studio-chat-typing">
                <Spinner className="h-4 w-4" />
                Agent is building...
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className={`border-stroke-divider shrink-0 border-t p-4 ${
          installedNotReady ? 'opacity-50' : ''
        }`}>
        {chat.composerLocked ? (
          <div
            className="bg-fill-muted/40 border-stroke-divider border p-2"
            data-testid="studio-composer-lock">
            <div className="text-fg-secondary flex min-h-[48px] items-center justify-center gap-2 text-sm">
              <Lock className="h-4 w-4" />
              {chat.lockReason}
            </div>
          </div>
        ) : (
          <div className="bg-surface-primary border-stroke-divider flex items-end gap-2 border p-2">
            <Textarea
              data-testid="studio-chat-input"
              value={chat.input}
              disabled={inputDisabled}
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
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
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
              className="text-fg-secondary text-xs">
              Show tool calls
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={chat.newConversation}
              data-testid="studio-new-conversation">
              <RestartAlt className="mr-1 h-4 w-4" />
              Reset chat
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPromptEditorOpen(true)}
              disabled={inputDisabled}
              aria-label="Open prompt editor"
              data-testid="studio-chat-expand">
              <ExpandContent className="mr-1 h-4 w-4" />
              Expand
            </Button>
          </div>
        </div>
      </div>

      <PromptEditorDialog
        open={promptEditorOpen}
        onOpenChange={setPromptEditorOpen}
        value={chat.input}
        onChange={chat.setInput}
        disabled={inputDisabled}
      />
    </div>
  );
}
