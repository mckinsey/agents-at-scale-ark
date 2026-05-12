'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Send, Wrench } from 'lucide-react';
import { useSendMessage } from '@/lib/services/conversations-hooks';
import type { Conversation } from '@/lib/services/conversations';
import { toast } from 'sonner';

const FALLBACK_PARTICIPANT_NAME = 'participant';

interface Props {
  readonly conversationId: string;
  readonly sessionId: string;
  readonly conversation: Conversation | null;
  readonly onAddPendingMessage: (conversationId: string, content: string) => void;
  readonly onSetProcessing: (conversationId: string, isProcessing: boolean) => void;
  readonly onEnableQueries: () => void;
  readonly showToolCalls: boolean;
  readonly onShowToolCallsChange: (show: boolean) => void;
}

export function ChatInput({ conversationId, sessionId, conversation, onAddPendingMessage, onSetProcessing, onEnableQueries, showToolCalls, onShowToolCallsChange }: Props) {
  const [message, setMessage] = useState('');
  const { mutate: sendMessage, isPending } = useSendMessage();

  const participantName = conversation?.participants?.[0] || conversation?.name || FALLBACK_PARTICIPANT_NAME;
  const participantType = conversation?.participantType;
  const toolCallCount = conversation?.toolCallCount || 0;

  // Don't render chat input for workflow conversations (multiple different participants)
  // In workflows, we don't know which agent to target for new messages
  const participantCount = conversation?.participants?.length || 0;
  const isWorkflowConversation = participantCount > 1;

  if (isWorkflowConversation) {
    // For workflows, only show tool toggle if there are tool calls
    if (toolCallCount > 0) {
      return (
        <div className="border-b border-r border-t border-border">
          <div className="flex items-center gap-3 px-8 py-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Wrench className="size-4" />
                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-muted-foreground text-[10px] font-medium text-background">
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
      },
      {
        onSuccess: () => {
          onEnableQueries();
        },
        onError: (error) => {
          onSetProcessing(conversationId, false);
          toast.error('Failed to send message', {
            description: error instanceof Error ? error.message : 'Unknown error',
          });
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-b border-r border-t border-border">
      <div className="relative flex items-center gap-2 py-6 pl-6 pr-8">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${participantName}`}
          className="flex-1 min-h-[48px] resize-none border-0 bg-transparent pt-6 pb-3 pr-16 focus-visible:ring-0 placeholder:text-sm placeholder:leading-none placeholder:tracking-[-0.01px] placeholder:text-muted-foreground"
          disabled={isPending}
          rows={2}
        />

        <Button
          onClick={handleSend}
          disabled={!message.trim() || isPending}
          variant="secondary"
          size="icon"
          className="absolute right-10 h-9 w-9 bg-field-enabled text-secondary-foreground hover:bg-field-hover"
        >
          <Send className="size-4" />
        </Button>
      </div>

      {toolCallCount > 0 && (
        <div className="flex items-center gap-3 px-8 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Wrench className="size-4" />
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-muted-foreground text-[10px] font-medium text-background">
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
