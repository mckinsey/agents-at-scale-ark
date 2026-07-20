'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ChatParameterFields } from '@/components/ui/chat-parameter-fields';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Autorenew, Build, Info, Send } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { useSendMessage } from '@/lib/services/conversations-hooks';
import type { Conversation } from '@/lib/services/conversations';
import { toast } from '@/components/ui/sonner';
import { useAgentQueryParameters } from '@/lib/hooks/use-agent-query-parameters';
import { cn } from '@/lib/utils';

const FALLBACK_PARTICIPANT_NAME = 'participant';

interface Props {
  readonly conversationId: string;
  readonly sessionId: string;
  readonly conversation: Conversation | null;
  readonly onAddPendingMessage: (
    conversationId: string,
    content: string,
  ) => void;
  readonly onSetProcessing: (
    conversationId: string,
    isProcessing: boolean,
  ) => void;
  readonly onEnableQueries: () => void;
  readonly showToolCalls: boolean;
  readonly onShowToolCallsChange: (show: boolean) => void;
}

export function ChatInput({
  conversationId,
  sessionId,
  conversation,
  onAddPendingMessage,
  onSetProcessing,
  onEnableQueries,
  showToolCalls,
  onShowToolCallsChange,
}: Props) {
  const [message, setMessage] = useState('');
  const { mutate: sendMessage, isPending } = useSendMessage();

  const participantName =
    conversation?.participants?.[0] ||
    conversation?.name ||
    FALLBACK_PARTICIPANT_NAME;
  const participantType = conversation?.participantType;

  const {
    variant: parameterVariant,
    hasParameters,
    availableParameters,
    teamAgents,
    rows: parameterRows,
    addRow: addParameterRow,
    setRowName: setParameterRowName,
    setRowValue: setParameterRowValue,
    setRowAgent: setParameterRowAgent,
    removeRow: removeParameterRow,
    canAddRow: canAddParameterRow,
    missingParameters,
    toApiParameters,
  } = useAgentQueryParameters(participantName, participantType);

  const hasUnsuppliedParameters = missingParameters.length > 0;
  const parameterHint = hasUnsuppliedParameters
    ? `This agent needs the ${missingParameters.join(', ')} parameter${
        missingParameters.length > 1 ? 's' : ''
      } before you can send a message.`
    : '';

  // Workflow conversations have multiple different participants (not teams)
  // In workflows, we don't know which agent to target for new messages
  const participantCount = conversation?.participants?.length || 0;
  const isWorkflowConversation = participantCount > 1 && participantType !== 'team';

  // Disable input when no conversation is selected
  const isDisabled = !conversationId || isPending || isWorkflowConversation;

  const handleSend = () => {
    if (!message.trim() || isPending) return;

    if (hasUnsuppliedParameters) {
      toast.error('This agent needs query parameters', {
        description: parameterHint,
      });
      return;
    }

    const messageToSend = message.trim();

    onAddPendingMessage(conversationId, messageToSend);
    setMessage('');
    onSetProcessing(conversationId, true);

    sendMessage(
      {
        conversationId,
        sessionId,
        message: messageToSend,
        agentName: participantName,
        participantType,
        parameters: toApiParameters(),
      },
      {
        onSuccess: () => {
          onEnableQueries();
        },
        onError: error => {
          onSetProcessing(conversationId, false);
          toast.error('Failed to send message', {
            description:
              error instanceof Error ? error.message : 'Unknown error',
          });
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-surface-bg-primary border-x border-t border-stroke-divider flex flex-col gap-2 px-4 py-3 shrink-0">
      {hasParameters && (
        <div>
          {parameterVariant === 'team' ? (
            <ChatParameterFields
              variant="team"
              teamAgents={teamAgents}
              rows={parameterRows}
              onAddRow={addParameterRow}
              onChangeAgent={setParameterRowAgent}
              onChangeName={setParameterRowName}
              onChangeValue={setParameterRowValue}
              onRemoveRow={removeParameterRow}
              canAddRow={canAddParameterRow}
              disabled={isPending}
            />
          ) : (
            <ChatParameterFields
              variant="agent"
              availableParameters={availableParameters}
              rows={parameterRows}
              onAddRow={addParameterRow}
              onChangeName={setParameterRowName}
              onChangeValue={setParameterRowValue}
              onRemoveRow={removeParameterRow}
              canAddRow={canAddParameterRow}
              disabled={isPending}
            />
          )}
        </div>
      )}

      <Textarea
        rows={1}
        autoResize
        maxRows={17}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Message ${participantName}`}
        className="min-h-0 w-full resize-none border-0 bg-transparent px-0 py-1 text-sm font-normal leading-5 shadow-none hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 disabled:bg-transparent disabled:hover:bg-transparent placeholder:text-fg-tertiary"
        disabled={isDisabled}
      />

      {hasUnsuppliedParameters && (
        <div className="bg-fill-onsurface-ui-3 text-fg-secondary flex items-center gap-2 self-stretch rounded-full px-4 py-2">
          <IconShell className="text-status-information shrink-0">
            <Info />
          </IconShell>
          <span className="text-sm">
            This {participantType === 'team' ? 'team' : 'agent'} needs a value
            definition before you can send a message. Please add it above.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Clear chat"
                disabled={!message.trim() || isPending}
                onClick={() => setMessage('')}>
                <IconShell size="sm" variant="secondary">
                  <Autorenew />
                </IconShell>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear chat</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={showToolCalls}
                aria-label={
                  showToolCalls ? 'Disable tool calls' : 'Activate tool calls'
                }
                onClick={() => onShowToolCallsChange(!showToolCalls)}
                className="relative">
                <IconShell size="sm" variant="secondary">
                  <Build />
                </IconShell>
                <span
                  className={cn(
                    'absolute -right-0.5 -top-0.5 size-2 rounded-full',
                    showToolCalls ? 'bg-status-success' : 'bg-status-error',
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showToolCalls ? 'Disable tool calls' : 'Activate tool calls'}
            </TooltipContent>
          </Tooltip>
        </div>

        <Button
          onClick={handleSend}
          disabled={!message.trim() || isDisabled || hasUnsuppliedParameters}
          variant="ghost"
          size="icon-sm"
          aria-label="Send message"
          className="bg-fill-active text-fg-primary-inverse hover:bg-fill-active/90 disabled:bg-surface-bg-tertiary disabled:text-fg-tertiary">
          <IconShell size="sm">
            <Send />
          </IconShell>
        </Button>
      </div>
    </div>
  );
}
