'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ChatParameterFields } from '@/components/ui/chat-parameter-fields';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { NumericBadge } from '@/components/ui/badge';
import { Info, Send, SingleTool } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { useSendMessage } from '@/lib/services/conversations-hooks';
import type { Conversation } from '@/lib/services/conversations';
import { toast } from '@/components/ui/sonner';
import { useAgentQueryParameters } from '@/lib/hooks/use-agent-query-parameters';

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
  const toolCallCount = conversation?.toolCallCount || 0;

  const {
    requiredParameters,
    values: parameterValues,
    setValue: setParameterValue,
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
    <div className="pb-8 bg-surface-bg-base border-r border-t border-b border-stroke-divider flex flex-col justify-start items-start overflow-hidden shrink-0">
      {requiredParameters.length > 0 && (
        <div className="px-8 pt-4">
          <ChatParameterFields
            requiredParameters={requiredParameters}
            values={parameterValues}
            onChange={setParameterValue}
            disabled={isPending}
          />
        </div>
      )}
      <div className="self-stretch px-4 pt-3 flex flex-col justify-start items-start gap-4">
        <div className="w-full h-16 p-3 bg-surface-bg-primary flex justify-start items-center gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${participantName}`}
            className="flex-1 h-4 border-0 bg-transparent shadow-none p-0 focus-visible:ring-0 focus-visible:bg-transparent hover:bg-transparent disabled:bg-transparent disabled:hover:bg-transparent text-sm font-normal placeholder:text-fg-tertiary"
            disabled={isDisabled}
          />

          <Button
            onClick={handleSend}
            disabled={!message.trim() || isDisabled || hasUnsuppliedParameters}
            variant="ghost"
            size="icon"
            aria-label="Send message"
            className="size-8 bg-surface-bg-tertiary hover:bg-surface-bg-tertiary/80 flex justify-center items-center"
          >
            <IconShell size="sm" className="opacity-100">
              <Send />
            </IconShell>
          </Button>
        </div>

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

        <div className="self-stretch flex justify-between items-center pb-2">
          <div className="flex justify-start items-center gap-5">
            <div className="relative">
              <IconShell size="sm" variant="secondary">
                <SingleTool />
              </IconShell>
              {toolCallCount > 0 && (
                <div className="absolute -right-2 -top-2">
                  <NumericBadge size="sm">
                    {toolCallCount}
                  </NumericBadge>
                </div>
              )}
            </div>
            <Switch
              checked={showToolCalls}
              onCheckedChange={onShowToolCallsChange}
              className="scale-75"
              aria-label="Toggle tool call visibility"
            />
            <span className="text-xs font-normal leading-4 tracking-tight text-fg-secondary">
              Show tool calls
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
