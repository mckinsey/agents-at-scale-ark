'use client';

import { Send, Wrench } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ChatParameterFields } from '@/components/ui/chat-parameter-fields';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAgentQueryParameters } from '@/lib/hooks/use-agent-query-parameters';
import type { Conversation } from '@/lib/services/conversations';
import { useSendMessage } from '@/lib/services/conversations-hooks';

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

  // Don't render chat input for workflow conversations (multiple different participants)
  // In workflows, we don't know which agent to target for new messages
  const participantCount = conversation?.participants?.length || 0;
  const isWorkflowConversation = participantCount > 1;

  if (isWorkflowConversation) {
    // For workflows, only show tool toggle if there are tool calls
    if (toolCallCount > 0) {
      return (
        <div className="border-border border-t border-r border-b">
          <div className="text-muted-foreground flex items-center gap-3 px-8 py-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Wrench className="size-4" />
                <span className="bg-muted-foreground text-background absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px] font-medium">
                  {toolCallCount}
                </span>
              </div>
              <Switch
                checked={showToolCalls}
                onCheckedChange={onShowToolCallsChange}
                className="scale-75"
                aria-label="Toggle tool call visibility"
              />
              <span className="text-xs">Show tool calls</span>
            </div>
          </div>
        </div>
      );
    }
    // Don't render anything - workflows are not conversational
    return null;
  }

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
    <div className="border-border border-t border-r border-b">
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
      <div className="relative flex items-center gap-2 py-6 pr-8 pl-6">
        <Textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${participantName}`}
          className="placeholder:text-muted-foreground min-h-[48px] flex-1 resize-none border-0 bg-transparent pt-6 pr-16 pb-3 placeholder:text-sm placeholder:leading-none placeholder:tracking-[-0.01px] focus-visible:ring-0"
          disabled={isPending}
          rows={2}
        />

        <Button
          onClick={handleSend}
          disabled={!message.trim() || isPending || hasUnsuppliedParameters}
          variant="secondary"
          size="icon"
          className="bg-field-enabled text-secondary-foreground hover:bg-field-hover absolute right-10 h-9 w-9">
          <Send className="size-4" />
        </Button>
      </div>

      {hasUnsuppliedParameters && (
        <div className="text-muted-foreground px-8 pb-3 text-xs">
          {parameterHint}
        </div>
      )}

      {toolCallCount > 0 && (
        <div className="text-muted-foreground flex items-center gap-3 px-8 py-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Wrench className="size-4" />
              <span className="bg-muted-foreground text-background absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px] font-medium">
                {toolCallCount}
              </span>
            </div>
            <Switch
              checked={showToolCalls}
              onCheckedChange={onShowToolCallsChange}
              className="scale-75"
              aria-label="Toggle tool call visibility"
            />
            <span className="text-xs">Show tool calls</span>
          </div>
        </div>
      )}
    </div>
  );
}
